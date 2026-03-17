import { randomBytes } from "node:crypto";
import db from "@hakwa/db";
import { merchant, safetyIncident, trip } from "@hakwa/db/schema";
import { generateSafetyReferenceCode } from "@hakwa/core";
import { and, eq } from "drizzle-orm";
import { publishCriticalIncidentEvent } from "./safetyEvents.ts";

const CRITICAL = new Set(["assault", "wrong_vehicle"]);

export function buildEvidenceStorageKey(input: {
  userId: string;
  incidentId: string;
  fileName: string;
}) {
  const ext = input.fileName.includes(".")
    ? input.fileName.slice(input.fileName.lastIndexOf(".")).toLowerCase()
    : "";
  const rand = randomBytes(12).toString("hex");
  return `safety/${input.userId}/${input.incidentId}/${rand}${ext}`;
}

export async function fileSafetyIncident(input: {
  userId: string;
  tripId: string;
  category: string;
  description?: string;
}) {
  const [tripRow] = await db
    .select({
      id: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
    })
    .from(trip)
    .where(eq(trip.id, input.tripId))
    .limit(1);

  if (
    !tripRow ||
    (tripRow.passengerId !== input.userId && tripRow.driverId !== input.userId)
  ) {
    throw new Error("SAFETY_INVALID_TRIP");
  }

  const isCritical = CRITICAL.has(input.category);

  const result = await db.transaction(async (tx) => {
    const [incident] = await tx
      .insert(safetyIncident)
      .values({
        referenceCode: generateSafetyReferenceCode(),
        reporterId: input.userId,
        tripId: input.tripId,
        type: "formal_report",
        category: input.category as any,
        reporterRole:
          tripRow.passengerId === input.userId ? "passenger" : "driver",
        status: isCritical ? "active" : "open",
        description: input.description ?? null,
      })
      .returning({
        id: safetyIncident.id,
        referenceCode: safetyIncident.referenceCode,
      });

    if (!incident) {
      throw new Error("SAFETY_INCIDENT_CREATE_FAILED");
    }

    if (isCritical && tripRow.driverId) {
      await tx
        .update(merchant)
        .set({ status: "suspended_pending_review" })
        .where(eq(merchant.userId, tripRow.driverId));
    }

    return { incident, isCritical };
  });

  if (result.isCritical) {
    await publishCriticalIncidentEvent({
      incidentId: result.incident.id,
      tripId: input.tripId,
      reporterId: input.userId,
      category: input.category,
      referenceCode: result.incident.referenceCode,
    });
  }

  return result.incident;
}

export async function createEvidenceUploadRequest(input: {
  userId: string;
  incidentId: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}) {
  const allowed = new Set(["image/jpeg", "image/png", "audio/mp4"]);
  if (!allowed.has(input.mimeType)) {
    throw new Error("SAFETY_EVIDENCE_INVALID_TYPE");
  }
  if (input.sizeBytes > 10 * 1024 * 1024) {
    throw new Error("SAFETY_EVIDENCE_TOO_LARGE");
  }

  const key = buildEvidenceStorageKey({
    userId: input.userId,
    incidentId: input.incidentId,
    fileName: input.fileName,
  });

  const uploadUrl = `https://uploads.hakwa.af/${encodeURIComponent(key)}`;
  await db
    .update(safetyIncident)
    .set({ evidenceUrl: `https://cdn.hakwa.af/${key}` })
    .where(
      and(
        eq(safetyIncident.id, input.incidentId),
        eq(safetyIncident.reporterId, input.userId),
      ),
    );

  return { uploadUrl, key };
}

export async function notifyReporterOnResolution(input: {
  incidentId: string;
  status: "resolved" | "unsubstantiated" | "driver_actioned";
}) {
  await db
    .update(safetyIncident)
    .set({ status: input.status, resolvedAt: new Date() })
    .where(eq(safetyIncident.id, input.incidentId));

  return { notified: true };
}
