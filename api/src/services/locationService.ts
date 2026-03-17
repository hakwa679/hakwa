import { and, eq, or } from "drizzle-orm";
import db from "@hakwa/db";
import { trip } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";

/** TTL in seconds for driver location hashes in Redis. */
const DRIVER_LOCATION_TTL_SECONDS = 60;

/**
 * Write the driver's current GPS position to the Redis location hash and,
 * if the driver has an active trip, publish a location update to the
 * booking pub/sub channel so the passenger app can track in real-time.
 *
 * Key pattern: `driver:{userId}:loc`
 * Pub/sub channel: `booking:{tripId}:location`
 */
export async function updateDriverLocation(
  userId: string,
  lat: number,
  lng: number,
  heading: number,
): Promise<void> {
  const key = `driver:${userId}:loc`;

  await redis.hset(key, {
    lat: lat.toString(),
    lng: lng.toString(),
    heading: heading.toString(),
    updatedAt: new Date().toISOString(),
  });
  await redis.expire(key, DRIVER_LOCATION_TTL_SECONDS);

  // If the driver is actively on a trip, publish their location so the
  // passenger WebSocket receives real-time position updates.
  const activeTripRow = await db
    .select({ id: trip.id })
    .from(trip)
    .where(
      and(
        eq(trip.driverId, userId),
        or(
          eq(trip.status, "accepted"),
          eq(trip.status, "driver_arrived"),
          eq(trip.status, "in_progress"),
        ),
      ),
    )
    .limit(1);

  if (activeTripRow[0]) {
    const tripId = activeTripRow[0].id;
    const payload = JSON.stringify({
      type: "location_update",
      tripId,
      lat,
      lng,
      heading,
      at: new Date().toISOString(),
    });
    redis
      .publish(`booking:${tripId}:location`, payload)
      .catch((err: unknown) => {
        console.error("[location] redis publish error", {
          userId,
          tripId,
          err,
        });
      });
  }
}
