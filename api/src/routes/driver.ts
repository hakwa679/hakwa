import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { and, desc, eq, lt } from "drizzle-orm";
import db from "@hakwa/db";
import { ledgerEntry, trip, user as userTable } from "@hakwa/db/schema";
import { getSessionFromRequest } from "@hakwa/auth";
import { requireRole } from "../middleware/requireRole.ts";
import {
  toggleAvailability,
  acceptBooking,
  declineBooking,
  advanceTripStatus,
  notifyPassengerOfStatus,
  DriverServiceError,
} from "../services/driverService.ts";
import {
  completeTrip,
  TripServiceError,
  onTripStarted,
  onTripCompleted,
} from "../services/tripService.ts";
import { updateDriverLocation } from "../services/locationService.ts";
import { publishBookingStatus } from "../services/bookingService.ts";

export const driverRouter = Router();

// All driver routes require the "driver" role
driverRouter.use(requireRole("driver"));

// ---------------------------------------------------------------------------
// Auth helper — returns session.user.id or short-circuits
// ---------------------------------------------------------------------------

async function getDriverId(
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
// Error normaliser — converts service errors to HTTP responses
// ---------------------------------------------------------------------------

function handleServiceError(
  err: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof DriverServiceError || err instanceof TripServiceError) {
    res.status(err.statusCode).json({ code: err.code, message: err.message });
    return;
  }
  next(err);
}

// ---------------------------------------------------------------------------
// PATCH /api/driver/availability — T010
// ---------------------------------------------------------------------------

driverRouter.patch(
  "/availability",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const body = req.body as Record<string, unknown>;
    const status = body["status"];

    if (status !== "available" && status !== "offline") {
      res.status(422).json({
        code: "INVALID_STATUS",
        message: "status must be 'available' or 'offline'.",
      });
      return;
    }

    try {
      await toggleAvailability(driverId, status);
      res.status(204).send();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/driver/location — T011
// ---------------------------------------------------------------------------

driverRouter.post(
  "/location",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const body = req.body as Record<string, unknown>;
    const lat = Number(body["lat"]);
    const lng = Number(body["lng"]);
    const heading = Number(body["heading"] ?? 0);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(422).json({
        code: "INVALID_LOCATION",
        message: "Valid lat and lng are required.",
      });
      return;
    }

    try {
      await updateDriverLocation(driverId, lat, lng, heading);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/driver/bookings/:tripId/accept — T015
// ---------------------------------------------------------------------------

driverRouter.post(
  "/bookings/:tripId/accept",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      const result = await acceptBooking(tripId, driverId);

      // Notify passenger
      publishBookingStatus(tripId, "accepted", { driverId });

      const [driverNameRow] = await db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, driverId))
        .limit(1);

      await notifyPassengerOfStatus(
        result.passengerId,
        tripId,
        "driver_accepted",
        driverNameRow?.name,
      ).catch(() => {});

      res.json({
        tripId: result.tripId,
        passengerId: result.passengerId,
        pickupAddress: result.pickupAddress,
        pickupLat: Number(result.pickupLat),
        pickupLng: Number(result.pickupLng),
        estimatedFare: result.estimatedFare,
        status: "accepted",
      });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/driver/bookings/:tripId/decline — T016
// ---------------------------------------------------------------------------

driverRouter.post(
  "/bookings/:tripId/decline",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      await declineBooking(tripId, driverId);
      res.status(204).send();
    } catch (err) {
      handleServiceError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/driver/trips/:tripId/arrive — T017
// ---------------------------------------------------------------------------

driverRouter.patch(
  "/trips/:tripId/arrive",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      const updatedTrip = await advanceTripStatus(tripId, driverId, "arrive");

      publishBookingStatus(tripId, "driver_arrived");

      await notifyPassengerOfStatus(
        updatedTrip.passengerId,
        tripId,
        "driver_arrived",
      ).catch(() => {});

      res.json({
        tripId,
        status: "driver_arrived",
        arrivedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/driver/trips/:tripId/start — T020
// ---------------------------------------------------------------------------

driverRouter.patch(
  "/trips/:tripId/start",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      const updatedTrip = await advanceTripStatus(tripId, driverId, "start");

      publishBookingStatus(tripId, "in_progress");

      // Notify passenger trip has started
      await onTripStarted(updatedTrip.passengerId, driverId, tripId).catch(
        () => {},
      );

      res.json({
        tripId,
        status: "in_progress",
        startedAt:
          updatedTrip.startedAt?.toISOString() ?? new Date().toISOString(),
        dropoffAddress: updatedTrip.destinationAddress,
        dropoffLat: Number(updatedTrip.destinationLat),
        dropoffLng: Number(updatedTrip.destinationLng),
      });
    } catch (err) {
      handleServiceError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/driver/trips/:tripId/complete — T021
// ---------------------------------------------------------------------------

driverRouter.patch(
  "/trips/:tripId/complete",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const { tripId } = req.params as { tripId: string };
    const body = req.body as Record<string, unknown>;
    const actualDistanceKm = Number(body["actualDistanceKm"]);

    if (isNaN(actualDistanceKm) || actualDistanceKm < 0) {
      res.status(422).json({
        code: "INVALID_DISTANCE",
        message: "actualDistanceKm must be a non-negative number.",
      });
      return;
    }

    try {
      const result = await completeTrip(tripId, driverId, actualDistanceKm);

      publishBookingStatus(tripId, "completed");

      // Fetch passenger ID for notification
      const [tripRow] = await db
        .select({ passengerId: trip.passengerId })
        .from(trip)
        .where(eq(trip.id, tripId))
        .limit(1);

      if (tripRow) {
        await onTripCompleted(
          tripRow.passengerId,
          driverId,
          tripId,
          `FJD ${result.actualFare}`,
        ).catch(() => {});
      }

      // Mark driver as available again
      await db
        .update(userTable)
        .set({ availabilityStatus: "available" })
        .where(eq(userTable.id, driverId));

      res.json(result);
    } catch (err) {
      handleServiceError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/driver/earnings — T026
// ---------------------------------------------------------------------------

driverRouter.get(
  "/earnings",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const driverId = await getDriverId(req, res);
    if (!driverId) return;

    const query = req.query as Record<string, string | undefined>;
    const cursor = query["cursor"];
    const limit = Math.min(Number(query["limit"] ?? 20), 100);

    try {
      const whereConditions = [
        eq(ledgerEntry.holderId, driverId),
        eq(ledgerEntry.entryType, "trip_credit"),
        ...(cursor ? [lt(ledgerEntry.createdAt, new Date(cursor))] : []),
      ];

      const rows = await db
        .select({
          ledgerEntryId: ledgerEntry.id,
          amount: ledgerEntry.amount,
          description: ledgerEntry.description,
          createdAt: ledgerEntry.createdAt,
        })
        .from(ledgerEntry)
        .where(and(...whereConditions))
        .orderBy(desc(ledgerEntry.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);

      res.json({
        items: items.map((row) => ({
          ledgerEntryId: row.ledgerEntryId,
          driverEarnings: row.amount,
          date: row.createdAt?.toISOString(),
          description: row.description,
        })),
        nextCursor: hasMore
          ? (items[items.length - 1]?.createdAt?.toISOString() ?? null)
          : null,
      });
    } catch (err) {
      next(err);
    }
  },
);
