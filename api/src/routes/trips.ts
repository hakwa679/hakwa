import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { trip, user as userTable } from "@hakwa/db/schema";
import { getSessionFromRequest } from "@hakwa/auth";
import { redis } from "@hakwa/redis";
import { BASE_FARE_FJD, RATE_PER_KM_FJD } from "@hakwa/core";
import {
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../services/merchantService.ts";

export const tripsRouter = Router();

// ---------------------------------------------------------------------------
// Auth helper — returns session.user.id or short-circuits
// ---------------------------------------------------------------------------

async function requireAuth(
  req: Request,
  res: Response,
): Promise<string | null> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return null;
  }
  return session.user.id;
}

// ---------------------------------------------------------------------------
// T019 — GET /api/trips/:tripId/receipt
// Returns full fare breakdown for a completed trip.
// Caller must be the passenger of the trip (ownership check).
// ---------------------------------------------------------------------------

tripsRouter.get(
  "/:tripId/receipt",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      const [tripRow] = await db
        .select({
          id: trip.id,
          passengerId: trip.passengerId,
          status: trip.status,
          pickupAddress: trip.pickupAddress,
          destinationAddress: trip.destinationAddress,
          actualDistanceKm: trip.actualDistanceKm,
          fare: trip.fare,
          completedAt: trip.completedAt,
          driverId: trip.driverId,
        })
        .from(trip)
        .where(eq(trip.id, tripId))
        .limit(1);

      if (!tripRow) {
        next(new NotFoundError("Trip not found."));
        return;
      }

      // Ownership check — T025 equivalence
      if (tripRow.passengerId !== userId) {
        next(
          new ForbiddenError(
            "FORBIDDEN",
            "You are not the passenger of this trip.",
          ),
        );
        return;
      }

      if (tripRow.status !== "completed") {
        next(
          new ConflictError("TRIP_NOT_COMPLETED", "Trip is not yet completed."),
        );
        return;
      }

      // Resolve driver name
      let driverName: string | null = null;
      if (tripRow.driverId) {
        const [driver] = await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, tripRow.driverId))
          .limit(1);
        driverName = driver?.name ?? null;
      }

      res.json({
        tripId: tripRow.id,
        pickupAddress: tripRow.pickupAddress ?? null,
        dropoffAddress: tripRow.destinationAddress ?? null,
        actualDistanceKm: tripRow.actualDistanceKm ?? null,
        baseFare: BASE_FARE_FJD.toFixed(2),
        ratePerKm: RATE_PER_KM_FJD.toFixed(2),
        totalFare: tripRow.fare ?? null,
        currency: "FJD",
        completedAt: tripRow.completedAt?.toISOString() ?? null,
        driverName,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// T020 — POST /api/trips/:tripId/receipt/email
// Enqueues a receipt email to Redis Stream `emails:outbox`.
// Returns 202 Accepted. Caller must be the passenger of the trip.
// ---------------------------------------------------------------------------

tripsRouter.post(
  "/:tripId/receipt/email",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      const [tripRow] = await db
        .select({
          id: trip.id,
          passengerId: trip.passengerId,
          status: trip.status,
          pickupAddress: trip.pickupAddress,
          destinationAddress: trip.destinationAddress,
          actualDistanceKm: trip.actualDistanceKm,
          fare: trip.fare,
          completedAt: trip.completedAt,
        })
        .from(trip)
        .where(eq(trip.id, tripId))
        .limit(1);

      if (!tripRow) {
        next(new NotFoundError("Trip not found."));
        return;
      }

      if (tripRow.passengerId !== userId) {
        next(
          new ForbiddenError(
            "FORBIDDEN",
            "You are not the passenger of this trip.",
          ),
        );
        return;
      }

      if (tripRow.status !== "completed") {
        next(
          new ConflictError("TRIP_NOT_COMPLETED", "Trip is not yet completed."),
        );
        return;
      }

      // Resolve passenger email
      const [passengerRow] = await db
        .select({ email: userTable.email, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

      if (!passengerRow) {
        next(new NotFoundError("User not found."));
        return;
      }

      // Push receipt payload to Redis Stream `emails:outbox`
      await redis.xadd(
        "emails:outbox",
        "*",
        "type",
        "trip_receipt",
        "to",
        passengerRow.email,
        "name",
        passengerRow.name,
        "tripId",
        tripRow.id,
        "pickupAddress",
        tripRow.pickupAddress ?? "",
        "destinationAddress",
        tripRow.destinationAddress ?? "",
        "totalFare",
        tripRow.fare ?? "0",
        "currency",
        "FJD",
        "completedAt",
        tripRow.completedAt?.toISOString() ?? "",
      );

      res.status(202).json({ message: "Receipt email queued." });
    } catch (err) {
      next(err);
    }
  },
);
