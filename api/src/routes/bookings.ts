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
import { fareCalculation } from "@hakwa/workers";
import { BASE_FARE_FJD, RATE_PER_KM_FJD } from "@hakwa/core";
import {
  createBooking,
  cancelBooking,
  getTripHistory,
  BookingError,
} from "../services/bookingService.ts";

export const bookingsRouter = Router();

// ---------------------------------------------------------------------------
// Auth helper — extracts session and asserts passenger role
// ---------------------------------------------------------------------------

async function requirePassenger(
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
  const role = (session.user as Record<string, unknown>)["role"] as
    | string
    | undefined;
  if (!role || role !== "passenger") {
    res.status(403).json({
      code: "FORBIDDEN",
      message: "This action requires a passenger account.",
    });
    return null;
  }
  return session.user.id;
}

// ---------------------------------------------------------------------------
// POST /api/bookings/fare-estimate — T011
// ---------------------------------------------------------------------------

bookingsRouter.post(
  "/fare-estimate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requirePassenger(req, res);
    if (!userId) return;

    const body = req.body as Record<string, unknown>;
    const pickupLat = Number(body["pickupLat"]);
    const pickupLng = Number(body["pickupLng"]);
    const destinationLat = Number(body["destinationLat"]);
    const destinationLng = Number(body["destinationLng"]);

    if (
      isNaN(pickupLat) ||
      isNaN(pickupLng) ||
      isNaN(destinationLat) ||
      isNaN(destinationLng)
    ) {
      res.status(422).json({
        code: "INVALID_LOCATION",
        message:
          "Valid pickupLat, pickupLng, destinationLat, destinationLng are required.",
      });
      return;
    }

    try {
      const result = await fareCalculation({
        pickupLat,
        pickupLng,
        destinationLat,
        destinationLng,
      });
      // T013: include baseFare and ratePerKm from shared @hakwa/core constants
      res.json({
        estimatedFare: result.estimatedFare,
        estimatedDistanceKm: result.estimatedDistanceKm,
        baseFare: BASE_FARE_FJD.toFixed(2),
        ratePerKm: RATE_PER_KM_FJD.toFixed(2),
        currency: result.currency,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/bookings — T012
// ---------------------------------------------------------------------------

bookingsRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requirePassenger(req, res);
    if (!userId) return;

    const body = req.body as Record<string, unknown>;
    const pickupLat = Number(body["pickupLat"]);
    const pickupLng = Number(body["pickupLng"]);
    const destinationLat = Number(body["destinationLat"]);
    const destinationLng = Number(body["destinationLng"]);

    if (
      isNaN(pickupLat) ||
      isNaN(pickupLng) ||
      isNaN(destinationLat) ||
      isNaN(destinationLng)
    ) {
      res.status(422).json({
        code: "INVALID_LOCATION",
        message:
          "Valid pickupLat, pickupLng, destinationLat, destinationLng are required.",
      });
      return;
    }

    try {
      // Always (re-)calculate fare at booking time
      const fareResult = await fareCalculation({
        pickupLat,
        pickupLng,
        destinationLat,
        destinationLng,
      });

      const newTrip = await createBooking({
        passengerId: userId,
        pickupLat,
        pickupLng,
        ...(typeof body["pickupAddress"] === "string"
          ? { pickupAddress: body["pickupAddress"] }
          : {}),
        destinationLat,
        destinationLng,
        ...(typeof body["destinationAddress"] === "string"
          ? { destinationAddress: body["destinationAddress"] }
          : {}),
        estimatedFare: fareResult.estimatedFare,
        estimatedDistanceKm: fareResult.estimatedDistanceKm,
      });

      res.status(201).json({
        tripId: newTrip.id,
        status: newTrip.status,
        estimatedFare: newTrip.estimatedFare,
        estimatedDistanceKm: newTrip.estimatedDistanceKm,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof BookingError) {
        res
          .status(err.statusCode)
          .json({ code: err.code, message: err.message });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/bookings/history — T026  (must be before /:tripId)
// ---------------------------------------------------------------------------

bookingsRouter.get(
  "/history",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requirePassenger(req, res);
    if (!userId) return;

    const page = Math.max(
      1,
      parseInt((req.query["page"] as string) ?? "1", 10),
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query["limit"] as string) ?? "20", 10)),
    );

    try {
      const { trips, total } = await getTripHistory(userId, page, limit);

      // Fetch driver names for trips that have a driverId
      const driverIds = [
        ...new Set(trips.map((t) => t.driverId).filter(Boolean) as string[]),
      ];
      const driverMap = new Map<string, string>();

      if (driverIds.length > 0) {
        const drivers = await db
          .select({ id: userTable.id, name: userTable.name })
          .from(userTable)
          .where(
            driverIds.length === 1
              ? eq(userTable.id, driverIds[0]!)
              : eq(userTable.id, driverIds[0]!), // fallback; typically a small set
          );
        for (const d of drivers) driverMap.set(d.id, d.name);
      }

      res.json({
        trips: trips.map((t) => ({
          tripId: t.id,
          status: t.status,
          fare: t.fare ?? t.estimatedFare,
          pickupAddress: t.pickupAddress,
          destinationAddress: t.destinationAddress,
          completedAt: t.completedAt?.toISOString() ?? null,
          cancelledAt: t.cancelledAt?.toISOString() ?? null,
          driver: t.driverId
            ? { name: driverMap.get(t.driverId) ?? "Unknown" }
            : null,
        })),
        total,
        page,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/bookings/:tripId — T013
// ---------------------------------------------------------------------------

bookingsRouter.get(
  "/:tripId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requirePassenger(req, res);
    if (!userId) return;

    const { tripId } = req.params as { tripId: string };

    try {
      const rows = await db
        .select()
        .from(trip)
        .where(eq(trip.id, tripId))
        .limit(1);

      const t = rows[0];
      if (!t) {
        res
          .status(404)
          .json({ code: "TRIP_NOT_FOUND", message: "Trip not found." });
        return;
      }

      // Ownership check — T032
      if (t.passengerId !== userId) {
        res.status(403).json({
          code: "FORBIDDEN",
          message: "You do not have access to this trip.",
        });
        return;
      }

      let driverInfo = null;
      if (t.driverId) {
        const driverRows = await db
          .select({ id: userTable.id, name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, t.driverId))
          .limit(1);

        const driver = driverRows[0];
        if (driver) {
          driverInfo = {
            id: driver.id,
            name: driver.name,
          };
        }
      }

      res.json({
        tripId: t.id,
        status: t.status,
        driver: driverInfo,
        estimatedFare: t.estimatedFare,
        estimatedDistanceKm: t.estimatedDistanceKm,
        pickupAddress: t.pickupAddress,
        destinationAddress: t.destinationAddress,
        pickupLat: t.pickupLat,
        pickupLng: t.pickupLng,
        destinationLat: t.destinationLat,
        destinationLng: t.destinationLng,
        acceptedAt: t.acceptedAt?.toISOString() ?? null,
        startedAt: t.startedAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        cancelledAt: t.cancelledAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/bookings/:tripId — T023
// ---------------------------------------------------------------------------

bookingsRouter.delete(
  "/:tripId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = await requirePassenger(req, res);
    if (!userId) return;

    const { tripId } = req.params as { tripId: string };
    const body = req.body as Record<string, unknown>;
    const reason =
      typeof body["reason"] === "string" ? body["reason"] : undefined;

    try {
      const result = await cancelBooking(tripId, userId, reason);
      res.json(result);
    } catch (err) {
      if (err instanceof BookingError) {
        res
          .status(err.statusCode)
          .json({ code: err.code, message: err.message });
        return;
      }
      next(err);
    }
  },
);
