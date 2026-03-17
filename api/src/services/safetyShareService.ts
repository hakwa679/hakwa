import { randomBytes } from "node:crypto";
import db from "@hakwa/db";
import { trip, tripShare } from "@hakwa/db/schema";
import redis from "@hakwa/redis";
import { and, eq, lt } from "drizzle-orm";

function makeToken(): string {
  return randomBytes(24).toString("base64url");
}

function ensureShareOwner(
  userId: string,
  row: { passengerId: string; driverId: string | null },
): void {
  if (row.passengerId !== userId && row.driverId !== userId) {
    throw new Error("SAFETY_INVALID_TRIP");
  }
}

export async function createOrRotateTripShare(userId: string, tripId: string) {
  const [tripRow] = await db
    .select({
      id: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      completedAt: trip.completedAt,
      status: trip.status,
    })
    .from(trip)
    .where(eq(trip.id, tripId))
    .limit(1);

  if (!tripRow) {
    throw new Error("SAFETY_INVALID_TRIP");
  }

  ensureShareOwner(userId, tripRow);

  await db
    .update(tripShare)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(tripShare.tripId, tripId), eq(tripShare.status, "active")));

  const token = makeToken();
  const expiresAt = tripRow.completedAt
    ? new Date(tripRow.completedAt.getTime() + 15 * 60_000)
    : new Date(Date.now() + 2 * 60 * 60_000);

  const [created] = await db
    .insert(tripShare)
    .values({
      tripId,
      createdBy: userId,
      token,
      status: "active",
      expiresAt,
    })
    .returning({
      id: tripShare.id,
      token: tripShare.token,
      expiresAt: tripShare.expiresAt,
    });

  if (!created) {
    throw new Error("SAFETY_SHARE_CREATE_FAILED");
  }

  return {
    id: created.id,
    token: created.token,
    shareUrl: `https://hakwa.af/safety/share/${created.token}`,
    status: "active" as const,
    expiresAt: created.expiresAt.toISOString(),
  };
}

export async function revokeTripShare(userId: string, tripId: string) {
  const [tripRow] = await db
    .select({ passengerId: trip.passengerId, driverId: trip.driverId })
    .from(trip)
    .where(eq(trip.id, tripId))
    .limit(1);

  if (!tripRow) {
    throw new Error("SAFETY_INVALID_TRIP");
  }

  ensureShareOwner(userId, tripRow);

  const updated = await db
    .update(tripShare)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(tripShare.tripId, tripId), eq(tripShare.status, "active")))
    .returning({ id: tripShare.id });

  return { revoked: updated.length > 0, status: "revoked" as const };
}

export async function getPublicTripShare(token: string) {
  const [share] = await db
    .select({
      id: tripShare.id,
      tripId: tripShare.tripId,
      status: tripShare.status,
      expiresAt: tripShare.expiresAt,
    })
    .from(tripShare)
    .where(eq(tripShare.token, token))
    .limit(1);

  if (!share) {
    throw new Error("SAFETY_SHARE_NOT_FOUND");
  }

  if (share.status !== "active" || share.expiresAt.getTime() <= Date.now()) {
    throw new Error("SAFETY_SHARE_EXPIRED");
  }

  const [tripRow] = await db
    .select({ id: trip.id, status: trip.status })
    .from(trip)
    .where(eq(trip.id, share.tripId))
    .limit(1);

  const loc = await redis.hgetall(`share:trip:${share.tripId}:loc`);
  const lat = loc["lat"] ? Number(loc["lat"]) : null;
  const lng = loc["lng"] ? Number(loc["lng"]) : null;

  return {
    tripId: share.tripId,
    status: tripRow?.status ?? "in_progress",
    driver: {
      firstName: "Driver",
      vehiclePlate: "UNKNOWN",
    },
    location:
      lat !== null && lng !== null
        ? {
            lat,
            lng,
          }
        : null,
  };
}

export async function listActiveTripSharesToExpire(now = new Date()) {
  return db
    .select({ id: tripShare.id })
    .from(tripShare)
    .where(and(eq(tripShare.status, "active"), lt(tripShare.expiresAt, now)));
}

export async function expireTripShares(now = new Date()): Promise<number> {
  const rows = await db
    .update(tripShare)
    .set({ status: "expired" })
    .where(and(eq(tripShare.status, "active"), lt(tripShare.expiresAt, now)))
    .returning({ id: tripShare.id });

  return rows.length;
}
