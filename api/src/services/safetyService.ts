import db from "@hakwa/db";
import { safetyContact, safetyIncident, trip } from "@hakwa/db/schema";
import { generateSafetyReferenceCode } from "@hakwa/core";
import redis from "@hakwa/redis";
import { and, eq, or } from "drizzle-orm";
import { publishSosTriggeredEvent } from "./safetyEvents.ts";

const SOS_DEDUP_TTL_SECONDS = 60;

export interface TriggerSosInput {
  userId: string;
  tripId?: string;
  silent?: boolean;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface TriggerSosResult {
  incidentId: string;
  referenceCode: string;
  duplicate: boolean;
  emergencyNumbers: string[];
}

export function buildSosDedupKey(tripId: string): string {
  return `safety:sos_dedup:${tripId}`;
}

function buildSosSmsBody(input: {
  referenceCode: string;
  tripId: string;
  location?: { lat: number; lng: number };
}): string {
  const locationLink = input.location
    ? `https://www.openstreetmap.org/?mlat=${input.location.lat}&mlon=${input.location.lng}`
    : "Location unavailable";

  return [
    "HAKWA SAFETY ALERT",
    `Reference: ${input.referenceCode}`,
    `Trip: ${input.tripId}`,
    `Location: ${locationLink}`,
    "Fiji emergency: Police 917 | Ambulance 911 | Fire 910",
  ].join("\n");
}

async function findActiveTripForUser(
  userId: string,
  tripId?: string,
): Promise<
  | {
      id: string;
      passengerId: string;
      driverId: string | null;
      status: "accepted" | "driver_arrived" | "in_progress";
    }
  | undefined
> {
  const baseWhere = [
    or(
      eq(trip.status, "accepted"),
      eq(trip.status, "driver_arrived"),
      eq(trip.status, "in_progress"),
    ),
    or(eq(trip.passengerId, userId), eq(trip.driverId, userId)),
  ];

  const whereClause = tripId
    ? and(eq(trip.id, tripId), ...baseWhere)
    : and(...baseWhere);

  const [row] = await db
    .select({
      id: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
    })
    .from(trip)
    .where(whereClause)
    .limit(1);

  if (!row) {
    return undefined;
  }

  return {
    ...row,
    status: row.status as "accepted" | "driver_arrived" | "in_progress",
  };
}

async function getExistingActiveSosIncident(tripId: string): Promise<
  | {
      id: string;
      referenceCode: string;
    }
  | undefined
> {
  const [existing] = await db
    .select({
      id: safetyIncident.id,
      referenceCode: safetyIncident.referenceCode,
    })
    .from(safetyIncident)
    .where(
      and(
        eq(safetyIncident.tripId, tripId),
        eq(safetyIncident.type, "sos"),
        eq(safetyIncident.status, "active"),
      ),
    )
    .limit(1);

  return existing;
}

export async function triggerSOS(
  input: TriggerSosInput,
): Promise<TriggerSosResult> {
  const activeTrip = await findActiveTripForUser(input.userId, input.tripId);
  if (!activeTrip) {
    throw new Error("SAFETY_NO_ACTIVE_TRIP");
  }

  const dedupKey = buildSosDedupKey(activeTrip.id);
  const dedupIncidentId = await redis.get(dedupKey);
  if (dedupIncidentId) {
    const [dedupIncident] = await db
      .select({
        id: safetyIncident.id,
        referenceCode: safetyIncident.referenceCode,
      })
      .from(safetyIncident)
      .where(eq(safetyIncident.id, dedupIncidentId))
      .limit(1);

    if (dedupIncident) {
      return {
        incidentId: dedupIncident.id,
        referenceCode: dedupIncident.referenceCode,
        duplicate: true,
        emergencyNumbers: ["917", "911", "910"],
      };
    }
  }

  const existing = await getExistingActiveSosIncident(activeTrip.id);
  if (existing) {
    await redis.set(dedupKey, existing.id, "EX", SOS_DEDUP_TTL_SECONDS);
    return {
      incidentId: existing.id,
      referenceCode: existing.referenceCode,
      duplicate: true,
      emergencyNumbers: ["917", "911", "910"],
    };
  }

  const referenceCode = generateSafetyReferenceCode();
  const reporterRole =
    activeTrip.driverId === input.userId ? "driver" : "passenger";
  const [created] = await db
    .insert(safetyIncident)
    .values({
      referenceCode,
      reporterId: input.userId,
      tripId: activeTrip.id,
      type: "sos",
      reporterRole,
      status: "active",
      locationSnapshotJson: input.location
        ? JSON.stringify(input.location)
        : null,
    })
    .returning({
      id: safetyIncident.id,
      referenceCode: safetyIncident.referenceCode,
    });

  if (!created) {
    throw new Error("SAFETY_SOS_CREATE_FAILED");
  }

  const contacts = await db
    .select({ phone: safetyContact.phone })
    .from(safetyContact)
    .where(
      and(
        eq(safetyContact.userId, input.userId),
        eq(safetyContact.isActive, true),
      ),
    )
    .limit(3);

  const smsBody = buildSosSmsBody({
    referenceCode: created.referenceCode,
    tripId: activeTrip.id,
    ...(input.location ? { location: input.location } : {}),
  });

  for (const contact of contacts) {
    await redis.xadd(
      "safety:sms:outbox",
      "*",
      "to",
      contact.phone,
      "body",
      smsBody,
      "incidentId",
      created.id,
      "retryCount",
      "0",
      "silent",
      input.silent ? "1" : "0",
    );
  }

  await publishSosTriggeredEvent({
    incidentId: created.id,
    tripId: activeTrip.id,
    reporterId: input.userId,
    referenceCode: created.referenceCode,
  });

  await redis.set(dedupKey, created.id, "EX", SOS_DEDUP_TTL_SECONDS);

  return {
    incidentId: created.id,
    referenceCode: created.referenceCode,
    duplicate: false,
    emergencyNumbers: ["917", "911", "910"],
  };
}
