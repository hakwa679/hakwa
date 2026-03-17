import db from "@hakwa/db";
import { safetyCheckIn, trip } from "@hakwa/db/schema";
import redis from "@hakwa/redis";
import { eq } from "drizzle-orm";

const COOLDOWN_SECONDS = 20 * 60;

function cooldownKey(tripId: string, type: string): string {
  return `safety:anomaly_cooldown:${tripId}:${type}`;
}

export async function createCheckInIfAllowed(input: {
  tripId: string;
  userId: string;
  type: "route_deviation" | "speed_anomaly" | "prolonged_stop";
  detail?: Record<string, unknown>;
}) {
  const key = cooldownKey(input.tripId, input.type);
  const existing = await redis.get(key);
  if (existing) {
    return { created: false, reason: "cooldown" as const };
  }

  await redis.set(key, "1", "EX", COOLDOWN_SECONDS);

  const [created] = await db
    .insert(safetyCheckIn)
    .values({
      tripId: input.tripId,
      userId: input.userId,
      type: input.type,
      status: "pending",
      anomalyDetailJson: input.detail ? JSON.stringify(input.detail) : null,
    })
    .returning({ id: safetyCheckIn.id });

  return { created: Boolean(created), checkInId: created?.id };
}

export async function detectTripAnomalies(input: {
  tripId: string;
  userId: string;
  lat: number;
  lng: number;
  speedKmh?: number;
}) {
  const [tripRow] = await db
    .select({ status: trip.status })
    .from(trip)
    .where(eq(trip.id, input.tripId))
    .limit(1);

  if (!tripRow || tripRow.status !== "in_progress") {
    return { triggered: false };
  }

  if (typeof input.speedKmh === "number" && input.speedKmh > 130) {
    return createCheckInIfAllowed({
      tripId: input.tripId,
      userId: input.userId,
      type: "speed_anomaly",
      detail: { speedKmh: input.speedKmh },
    });
  }

  return { triggered: false };
}
