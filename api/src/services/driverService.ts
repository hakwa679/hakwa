import { and, eq } from "drizzle-orm";
import db from "@hakwa/db";
import { trip, user as userTable } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { sendNotification } from "@hakwa/notifications";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class DriverServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DriverServiceError";
  }
}

export class ConflictError extends DriverServiceError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class ForbiddenError extends DriverServiceError {
  constructor(code: string, message: string) {
    super(403, code, message);
  }
}

export class GoneError extends DriverServiceError {
  constructor(code: string, message: string) {
    super(410, code, message);
  }
}

export class NotFoundError extends DriverServiceError {
  constructor(code: string, message: string) {
    super(404, code, message);
  }
}

// ---------------------------------------------------------------------------
// toggleAvailability — go online / offline
// ---------------------------------------------------------------------------

/**
 * Set the driver's availability status.
 *
 * Rules:
 * - Cannot go `offline` while `on_trip` (409).
 * - Any other transition is allowed.
 */
export async function toggleAvailability(
  userId: string,
  status: "available" | "offline",
): Promise<void> {
  if (status === "offline") {
    const [current] = await db
      .select({ availabilityStatus: userTable.availabilityStatus })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (current?.availabilityStatus === "on_trip") {
      throw new ConflictError(
        "CANNOT_GO_OFFLINE",
        "You cannot go offline while you are on a trip.",
      );
    }
  }

  await db
    .update(userTable)
    .set({ availabilityStatus: status })
    .where(eq(userTable.id, userId));
}

// ---------------------------------------------------------------------------
// acceptBooking — conditional UPDATE to prevent double-acceptance (T007)
// ---------------------------------------------------------------------------

export interface AcceptBookingResult {
  tripId: string;
  passengerId: string;
  pickupAddress: string | null;
  pickupLat: string;
  pickupLng: string;
  estimatedFare: string | null;
  status: "accepted";
}

/**
 * Atomically accept a trip for a driver.
 *
 * Uses a conditional UPDATE (`WHERE status = 'pending'`) — zero rows
 * updated means the trip was already accepted by another driver → 409.
 */
export async function acceptBooking(
  tripId: string,
  driverId: string,
): Promise<AcceptBookingResult> {
  // Check offer has not expired (trip must still be pending)
  const [current] = await db
    .select({
      status: trip.status,
      passengerId: trip.passengerId,
      pickupAddress: trip.pickupAddress,
      pickupLat: trip.pickupLat,
      pickupLng: trip.pickupLng,
      estimatedFare: trip.estimatedFare,
    })
    .from(trip)
    .where(eq(trip.id, tripId))
    .limit(1);

  if (!current) {
    throw new NotFoundError("TRIP_NOT_FOUND", "Trip not found.");
  }

  if (current.status === "cancelled" || current.status === "timed_out") {
    throw new GoneError(
      "OFFER_EXPIRED",
      "The booking offer has expired or been cancelled.",
    );
  }

  if (current.status !== "pending") {
    throw new ConflictError(
      "ALREADY_ACCEPTED",
      "This booking has already been accepted by another driver.",
    );
  }

  // Conditional UPDATE — only succeeds if status is still 'pending'
  const rows = await db
    .update(trip)
    .set({
      driverId,
      status: "accepted",
      acceptedAt: new Date(),
    })
    .where(and(eq(trip.id, tripId), eq(trip.status, "pending")))
    .returning({ id: trip.id });

  if (rows.length === 0) {
    throw new ConflictError(
      "ALREADY_ACCEPTED",
      "This booking has already been accepted by another driver.",
    );
  }

  // Mark driver as on_trip
  await db
    .update(userTable)
    .set({ availabilityStatus: "on_trip" })
    .where(eq(userTable.id, driverId));

  return {
    tripId,
    passengerId: current.passengerId,
    pickupAddress: current.pickupAddress ?? null,
    pickupLat: current.pickupLat,
    pickupLng: current.pickupLng,
    estimatedFare: current.estimatedFare ?? null,
    status: "accepted",
  };
}

// ---------------------------------------------------------------------------
// declineBooking — stay available, forward booking back to dispatch
// ---------------------------------------------------------------------------

/**
 * Driver declines a dispatch offer. Driver remains `available`.
 * Publishes a decline event so the dispatch loop can move to next driver.
 */
export async function declineBooking(
  tripId: string,
  driverId: string,
): Promise<void> {
  // Publish decline event so the dispatch loop can re-offer to next driver
  redis
    .publish(
      `booking:${tripId}:status`,
      JSON.stringify({
        type: "driver_declined",
        tripId,
        driverId,
        at: new Date().toISOString(),
      }),
    )
    .catch((err: unknown) => {
      console.error("[driver] redis publish decline error", {
        tripId,
        driverId,
        err,
      });
    });
}

// ---------------------------------------------------------------------------
// advanceTripStatus — conditional UPDATE for lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * Advance trip status for driver lifecycle events (arrive, start).
 * Uses conditional UPDATE: `WHERE status = <from> AND driverId = <driverId>`.
 * Returns the updated trip row.
 */
export async function advanceTripStatus(
  tripId: string,
  driverId: string,
  action: "arrive" | "start",
): Promise<typeof trip.$inferSelect> {
  const now = new Date();

  if (action === "arrive") {
    const rows = await db
      .update(trip)
      .set({ status: "driver_arrived" })
      .where(
        and(
          eq(trip.id, tripId),
          eq(trip.driverId, driverId),
          eq(trip.status, "accepted"),
        ),
      )
      .returning();

    if (rows.length === 0) {
      throw new ConflictError(
        "INVALID_TRANSITION",
        "Cannot mark arrived — trip is not in 'accepted' state or is not assigned to you.",
      );
    }
    return rows[0]!;
  }

  // action === "start"
  const rows = await db
    .update(trip)
    .set({ status: "in_progress", startedAt: now })
    .where(
      and(
        eq(trip.id, tripId),
        eq(trip.driverId, driverId),
        eq(trip.status, "driver_arrived"),
      ),
    )
    .returning();

  if (rows.length === 0) {
    throw new ConflictError(
      "INVALID_TRANSITION",
      "Cannot start trip — trip is not in 'driver_arrived' state or is not assigned to you.",
    );
  }
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// notifyPassengerOfStatus — send push + in-app notification
// ---------------------------------------------------------------------------

export async function notifyPassengerOfStatus(
  passengerId: string,
  tripId: string,
  event: "driver_accepted" | "driver_arrived",
  driverName?: string,
): Promise<void> {
  const messages: Record<
    typeof event,
    { title: string; body: string; screen: string }
  > = {
    driver_accepted: {
      title: "Driver on the way!",
      body: driverName
        ? `${driverName} accepted your booking and is heading to you.`
        : "A driver accepted your booking and is on the way.",
      screen: "ActiveTrip",
    },
    driver_arrived: {
      title: "Driver arrived",
      body: "Your driver is at the pickup location.",
      screen: "ActiveTrip",
    },
  };

  const msg = messages[event];

  await sendNotification(
    passengerId,
    event,
    {
      channel: "push",
      title: msg.title,
      body: msg.body,
      data: { screen: msg.screen, tripId },
    },
    `${event}:${tripId}:passenger`,
  );

  await sendNotification(
    passengerId,
    event,
    {
      channel: "in_app",
      title: msg.title,
      body: msg.body,
      data: { screen: msg.screen, tripId },
    },
    `${event}:${tripId}:passenger:in_app`,
  );
}
