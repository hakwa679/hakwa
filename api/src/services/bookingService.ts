import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import db from "@hakwa/db";
import { trip, user as userTable } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { sendNotification } from "@hakwa/notifications";
import {
  MAX_DISPATCH_ATTEMPTS,
  DRIVER_RESPONSE_TIMEOUT_SECONDS,
  CANCELLATION_GRACE_PERIOD_SECONDS,
} from "@hakwa/core";
import { getDriverSignal, getPassengerSignal } from "./reviewService.ts";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class BookingError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export class ConflictError extends BookingError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class ForbiddenError extends BookingError {
  constructor(code: string, message: string) {
    super(403, code, message);
  }
}

export class NotFoundError extends BookingError {
  constructor(code: string, message: string) {
    super(404, code, message);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateBookingInput {
  passengerId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  destinationLat: number;
  destinationLng: number;
  destinationAddress?: string;
  estimatedFare: string;
  estimatedDistanceKm: string;
}

// ---------------------------------------------------------------------------
// Redis pub/sub helpers (T008)
// ---------------------------------------------------------------------------

export function publishBookingStatus(
  tripId: string,
  status: string,
  extra?: Record<string, unknown>,
): void {
  const payload = JSON.stringify({
    type: "status_changed",
    tripId,
    status,
    at: new Date().toISOString(),
    ...extra,
  });
  redis.publish(`booking:${tripId}:status`, payload).catch((err: unknown) => {
    console.error("[booking] redis publish status error", { tripId, err });
  });
}

export function publishDriverLocation(
  tripId: string,
  lat: number,
  lng: number,
): void {
  const payload = JSON.stringify({
    type: "location_update",
    tripId,
    lat,
    lng,
    at: new Date().toISOString(),
  });
  redis.publish(`booking:${tripId}:location`, payload).catch((err: unknown) => {
    console.error("[booking] redis publish location error", { tripId, err });
  });
}

// ---------------------------------------------------------------------------
// Haversine helper for driver proximity sorting
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// findNearestDriver — query online drivers from Redis, sort by Haversine
// ---------------------------------------------------------------------------

interface NearbyDriver {
  userId: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

async function findNearestDrivers(
  pickupLat: number,
  pickupLng: number,
): Promise<NearbyDriver[]> {
  // Scan Redis for driver location hashes — pattern driver:location:*
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(
      cursor,
      "MATCH",
      "driver:location:*",
      "COUNT",
      100,
    );
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");

  const drivers: NearbyDriver[] = [];
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (!data["lat"] || !data["lng"]) continue;
    const lat = parseFloat(data["lat"]);
    const lng = parseFloat(data["lng"]);
    const driverId = key.replace("driver:location:", "");
    drivers.push({
      userId: driverId,
      lat,
      lng,
      distanceKm: haversineKm(pickupLat, pickupLng, lat, lng),
    });
  }

  // Sort nearest-first
  drivers.sort((a, b) => a.distanceKm - b.distanceKm);
  return drivers;
}

// ---------------------------------------------------------------------------
// offerToDriver — attempt a conditional UPDATE to assign this trip
// ---------------------------------------------------------------------------

async function offerToDriver(
  tripId: string,
  driverUserId: string,
): Promise<boolean> {
  // Conditional UPDATE: only succeeds if trip is still pending
  const rows = await db
    .update(trip)
    .set({
      driverId: driverUserId,
      status: "accepted",
      acceptedAt: new Date(),
    })
    .where(and(eq(trip.id, tripId), eq(trip.status, "pending")))
    .returning({ id: trip.id });

  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// dispatchLoop — background driver matching for a pending trip
// ---------------------------------------------------------------------------

export async function dispatchLoop(tripId: string): Promise<void> {
  const tripRow = await db
    .select({
      pickupLat: trip.pickupLat,
      pickupLng: trip.pickupLng,
      passengerId: trip.passengerId,
    })
    .from(trip)
    .where(eq(trip.id, tripId))
    .limit(1);

  if (!tripRow[0]) return;

  const { pickupLat, pickupLng } = tripRow[0];
  const drivers = await findNearestDrivers(
    parseFloat(pickupLat!),
    parseFloat(pickupLng!),
  );

  const candidates = drivers.slice(0, MAX_DISPATCH_ATTEMPTS);
  let matched = false;

  for (const driver of candidates) {
    // Check the trip is still pending before offering
    const current = await db
      .select({ status: trip.status })
      .from(trip)
      .where(eq(trip.id, tripId))
      .limit(1);

    if (!current[0] || current[0].status !== "pending") break;

    const passengerSignal = await getPassengerSignal(tripRow[0].passengerId)
      .then((signal) => signal)
      .catch(() => null);

    // Notify driver of offer (fire-and-forget; driver app logic in feature 004)
    redis
      .publish(
        `driver:${driver.userId}:offer`,
        JSON.stringify({
          type: "ride_offer",
          tripId,
          passengerRating: passengerSignal,
          at: new Date().toISOString(),
        }),
      )
      .catch(() => {});

    // Wait for driver response window
    await new Promise<void>((resolve) =>
      setTimeout(resolve, DRIVER_RESPONSE_TIMEOUT_SECONDS * 1000),
    );

    // Check if this driver accepted (another process may have done it)
    const updated = await db
      .select({ status: trip.status, driverId: trip.driverId })
      .from(trip)
      .where(eq(trip.id, tripId))
      .limit(1);

    if (updated[0]?.status === "accepted") {
      matched = true;
      break;
    }

    // Try conditional UPDATE for this driver
    const accepted = await offerToDriver(tripId, driver.userId);
    if (accepted) {
      matched = true;

      // Fetch driver name for notification
      const driverRecord = await db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, driver.userId))
        .limit(1);

      const driverSignal = await getDriverSignal(driver.userId)
        .then((signal) => signal)
        .catch(() => null);

      publishBookingStatus(tripId, "accepted", {
        driverId: driver.userId,
        driverName: driverRecord[0]?.name ?? "Your driver",
        driverRating: driverSignal,
      });

      // Notify passenger
      const tripDetails = await db
        .select({ passengerId: trip.passengerId })
        .from(trip)
        .where(eq(trip.id, tripId))
        .limit(1);

      if (tripDetails[0]?.passengerId) {
        await onDriverAccepted(
          tripDetails[0].passengerId,
          tripId,
          driverRecord[0]?.name ?? "Your driver",
        ).catch(() => {});
      }

      break;
    }
  }

  if (!matched) {
    // No driver accepted — mark as timed_out
    await db
      .update(trip)
      .set({ status: "timed_out", cancelledAt: new Date() })
      .where(and(eq(trip.id, tripId), eq(trip.status, "pending")));

    publishBookingStatus(tripId, "timed_out");
  }
}

// ---------------------------------------------------------------------------
// createBooking — validate + insert trip row, start dispatch asynchronously
// ---------------------------------------------------------------------------

export async function createBooking(
  input: CreateBookingInput,
): Promise<typeof trip.$inferSelect> {
  // Guard: passenger must not have an active booking
  const existing = await db
    .select({ id: trip.id, status: trip.status })
    .from(trip)
    .where(
      and(
        eq(trip.passengerId, input.passengerId),
        or(eq(trip.status, "pending"), eq(trip.status, "accepted")),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(
      "ACTIVE_BOOKING_EXISTS",
      "You already have an active booking. Cancel it before creating a new one.",
    );
  }

  const [newTrip] = await db
    .insert(trip)
    .values({
      passengerId: input.passengerId,
      pickupLat: input.pickupLat.toString(),
      pickupLng: input.pickupLng.toString(),
      pickupAddress: input.pickupAddress,
      destinationLat: input.destinationLat.toString(),
      destinationLng: input.destinationLng.toString(),
      destinationAddress: input.destinationAddress,
      estimatedFare: input.estimatedFare,
      estimatedDistanceKm: input.estimatedDistanceKm,
      status: "pending",
    })
    .returning();

  if (!newTrip) throw new Error("Failed to create trip");

  // Start the dispatch loop asynchronously — do not block the HTTP response
  setImmediate(() => {
    dispatchLoop(newTrip.id).catch((err: unknown) => {
      console.error("[booking] dispatch loop error", {
        tripId: newTrip.id,
        err,
      });
    });
  });

  return newTrip;
}

// ---------------------------------------------------------------------------
// cancelBooking — passenger cancels a pending/accepted booking
// ---------------------------------------------------------------------------

export async function cancelBooking(
  tripId: string,
  passengerId: string,
  reason?: string,
): Promise<{ status: "cancelled"; penaltyFree: boolean }> {
  const rows = await db.select().from(trip).where(eq(trip.id, tripId)).limit(1);

  const current = rows[0];
  if (!current) {
    throw new NotFoundError("TRIP_NOT_FOUND", "Trip not found.");
  }

  if (current.passengerId !== passengerId) {
    throw new ForbiddenError(
      "NOT_BOOKING_OWNER",
      "You are not the owner of this booking.",
    );
  }

  if (
    current.status === "in_progress" ||
    current.status === "completed" ||
    current.status === "timed_out" ||
    current.status === "cancelled"
  ) {
    throw new ForbiddenError(
      "CANNOT_CANCEL",
      "Cancellation is not allowed for a trip in this state.",
    );
  }

  // Grace-period check
  let penaltyFree = true;
  if (current.acceptedAt) {
    const elapsedSeconds = (Date.now() - current.acceptedAt.getTime()) / 1000;
    penaltyFree = elapsedSeconds <= CANCELLATION_GRACE_PERIOD_SECONDS;
  }

  await db
    .update(trip)
    .set({
      status: "cancelled",
      cancellationReason: reason ?? null,
      cancelledAt: new Date(),
    })
    .where(eq(trip.id, tripId));

  publishBookingStatus(tripId, "cancelled");

  // Notify driver if one was assigned
  if (current.driverId) {
    redis
      .publish(
        `driver:${current.driverId}:offer`,
        JSON.stringify({
          type: "booking_cancelled",
          tripId,
          at: new Date().toISOString(),
        }),
      )
      .catch(() => {});
  }

  return { status: "cancelled", penaltyFree };
}

// ---------------------------------------------------------------------------
// getTripHistory — paginated completed/cancelled trips for a passenger
// ---------------------------------------------------------------------------

export async function getTripHistory(
  passengerId: string,
  page: number,
  limit: number,
): Promise<{ trips: (typeof trip.$inferSelect)[]; total: number }> {
  const offset = (page - 1) * limit;

  const [trips, countResult] = await Promise.all([
    db
      .select()
      .from(trip)
      .where(
        and(
          eq(trip.passengerId, passengerId),
          inArray(trip.status, ["completed", "cancelled"]),
        ),
      )
      .orderBy(desc(trip.cancelledAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(trip)
      .where(
        and(
          eq(trip.passengerId, passengerId),
          inArray(trip.status, ["completed", "cancelled"]),
        ),
      ),
  ]);

  return { trips, total: countResult[0]?.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Notification helpers (kept from previous stub)
// ---------------------------------------------------------------------------

export async function onBookingConfirmed(
  passengerId: string,
  bookingId: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "booking_confirmed",
    {
      channel: "push",
      title: "Booking confirmed",
      body: "Your booking has been confirmed. A driver will be assigned shortly.",
      data: { screen: "BookingStatus", bookingId },
    },
    `booking_confirmed:${bookingId}`,
  );
  await sendNotification(
    passengerId,
    "booking_confirmed",
    {
      channel: "in_app",
      title: "Booking confirmed",
      body: "Your booking has been confirmed.",
      data: { screen: "BookingStatus", bookingId },
    },
    `booking_confirmed:${bookingId}:in_app`,
  );
}

export async function onDriverAccepted(
  passengerId: string,
  tripId: string,
  driverName: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "driver_accepted",
    {
      channel: "push",
      title: "Driver on the way",
      body: `${driverName} has accepted your ride request.`,
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_accepted:${tripId}`,
  );
  await sendNotification(
    passengerId,
    "driver_accepted",
    {
      channel: "in_app",
      title: "Driver on the way",
      body: `${driverName} has accepted your ride.`,
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_accepted:${tripId}:in_app`,
  );
}

export async function onDriverEnRoute(
  passengerId: string,
  tripId: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "driver_en_route",
    {
      channel: "push",
      title: "Driver en route",
      body: "Your driver is on the way to your pickup location.",
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_en_route:${tripId}`,
  );
}

export async function onDriverArrived(
  passengerId: string,
  tripId: string,
  driverName: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "driver_arrived",
    {
      channel: "push",
      title: "Your driver has arrived",
      body: `${driverName} is waiting at your pickup location.`,
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_arrived:${tripId}`,
  );
  await sendNotification(
    passengerId,
    "driver_arrived",
    {
      channel: "in_app",
      title: "Driver arrived",
      body: "Your driver is outside.",
      data: { screen: "ActiveTrip", tripId },
    },
    `driver_arrived:${tripId}:in_app`,
  );
}
