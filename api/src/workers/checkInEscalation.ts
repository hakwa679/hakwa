import db from "@hakwa/db";
import {
  safetyCheckIn,
  safetyContact,
  safetyIncident,
  trip,
} from "@hakwa/db/schema";
import { generateSafetyReferenceCode } from "@hakwa/core";
import { redis } from "@hakwa/redis";
import { and, eq, isNull, lte } from "drizzle-orm";
import { publishCheckInEscalatedEvent } from "../services/safetyEvents.ts";

const CHECK_INTERVAL_MS = 15_000;
const ESCALATION_SECONDS = 90;

function getEscalationType(
  checkInType: "route_deviation" | "speed_anomaly" | "prolonged_stop",
):
  | "route_deviation_escalation"
  | "speed_anomaly_escalation"
  | "stop_anomaly_escalation" {
  switch (checkInType) {
    case "route_deviation":
      return "route_deviation_escalation";
    case "speed_anomaly":
      return "speed_anomaly_escalation";
    case "prolonged_stop":
      return "stop_anomaly_escalation";
  }
}

async function escalatePendingCheckIns(): Promise<void> {
  const cutoff = new Date(Date.now() - ESCALATION_SECONDS * 1000);

  const pending = await db
    .select({
      id: safetyCheckIn.id,
      tripId: safetyCheckIn.tripId,
      userId: safetyCheckIn.userId,
      type: safetyCheckIn.type,
      promptedAt: safetyCheckIn.promptedAt,
    })
    .from(safetyCheckIn)
    .where(
      and(
        eq(safetyCheckIn.status, "pending"),
        isNull(safetyCheckIn.escalatedAt),
        lte(safetyCheckIn.promptedAt, cutoff),
      ),
    )
    .limit(50);

  for (const checkIn of pending) {
    const [tripRow] = await db
      .select({ status: trip.status })
      .from(trip)
      .where(eq(trip.id, checkIn.tripId))
      .limit(1);

    if (!tripRow || tripRow.status !== "in_progress") {
      await db
        .update(safetyCheckIn)
        .set({ status: "trip_ended", updatedAt: new Date() })
        .where(eq(safetyCheckIn.id, checkIn.id));
      continue;
    }

    const result = await db.transaction(async (tx) => {
      const [incident] = await tx
        .insert(safetyIncident)
        .values({
          referenceCode: generateSafetyReferenceCode(),
          reporterId: checkIn.userId,
          tripId: checkIn.tripId,
          type: getEscalationType(checkIn.type),
          reporterRole: "passenger",
          status: "active",
        })
        .returning({
          id: safetyIncident.id,
          referenceCode: safetyIncident.referenceCode,
        });

      if (!incident) {
        return null;
      }

      await tx
        .update(safetyCheckIn)
        .set({
          status: "escalated",
          escalatedAt: new Date(),
          incidentId: incident.id,
          updatedAt: new Date(),
        })
        .where(eq(safetyCheckIn.id, checkIn.id));

      const contacts = checkIn.userId
        ? await tx
            .select({ phone: safetyContact.phone })
            .from(safetyContact)
            .where(
              and(
                eq(safetyContact.userId, checkIn.userId),
                eq(safetyContact.isActive, true),
              ),
            )
            .limit(3)
        : [];

      for (const contact of contacts) {
        await redis.xadd(
          "safety:sms:outbox",
          "*",
          "to",
          contact.phone,
          "body",
          `Hakwa safety check-in escalated. Ref: ${incident.referenceCode}`,
          "incidentId",
          incident.id,
          "retryCount",
          "0",
        );
      }

      return incident;
    });

    if (!result) {
      continue;
    }

    await publishCheckInEscalatedEvent({
      incidentId: result.id,
      checkInId: checkIn.id,
      tripId: checkIn.tripId,
      ...(checkIn.userId ? { reporterId: checkIn.userId } : {}),
      referenceCode: result.referenceCode,
    });
  }
}

export function startSafetyCheckInEscalationWorker(): void {
  setInterval(() => {
    escalatePendingCheckIns().catch((error) => {
      console.error("[safety:checkInEscalation] tick failed", { error });
    });
  }, CHECK_INTERVAL_MS);
}
