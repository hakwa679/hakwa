# Quickstart: Driver Dispatch & Trips

## Prerequisites

- Spec 003 (Taxi Booking — Passenger) schema changes applied (`db-push` already
  run).
- `@hakwa/db`, `@hakwa/redis`, `@hakwa/workers`, `@hakwa/notifications`,
  `@hakwa/errors` packages built.

---

## Step 1: Extend the `user` Schema

Add `availabilityStatus` column to the `user` table.

```typescript
// pkg/db/schema/auth-schema.ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const availabilityStatusEnum = pgEnum('availability_status', [
  'offline',
  'available',
  'on_trip',
]);

// Inside the user table definition, add:
availabilityStatus: availabilityStatusEnum('availability_status')
  .default('offline')
  .notNull(),
```

Apply the schema:

```bash
cd pkg/db && npm run db-push
```

Add an index for dispatch queries (run once, after push):

```sql
CREATE INDEX IF NOT EXISTS idx_users_availability
  ON "user" (availability_status)
  WHERE availability_status = 'available';
```

---

## Step 2: Location Reporting Service

```typescript
// api/src/services/locationService.ts
import { redis } from "@hakwa/redis";

export async function updateDriverLocation(
  userId: string,
  tripId: string | null,
  lat: number,
  lng: number,
  heading: number,
): Promise<void> {
  const key = `driver:${userId}:loc`;
  await redis.hset(key, {
    lat: String(lat),
    lng: String(lng),
    heading: String(heading),
    updatedAt: new Date().toISOString(),
  });
  await redis.expire(key, 60);

  if (tripId) {
    await redis.publish(
      `booking:${tripId}:location`,
      JSON.stringify({ lat, lng, heading }),
    );
  }
}
```

---

## Step 3: Trip Completion Transaction

```typescript
// api/src/services/tripService.ts
import { db } from "@hakwa/db";
import { trip, ledgerEntry, pointsLedger } from "@hakwa/db/schema";
import { eq, and } from "drizzle-orm";
import { ConflictError } from "@hakwa/errors";
import { PLATFORM_COMMISSION_RATE } from "@hakwa/core";

export async function completeTrip(
  tripId: string,
  driverId: string,
  actualDistanceKm: number,
): Promise<{ actualFare: number; driverEarnings: number }> {
  const BASE_FARE = 2.5;
  const RATE_PER_KM = 0.85;
  const actualFare = +(BASE_FARE + RATE_PER_KM * actualDistanceKm).toFixed(2);
  const platformFee = +(actualFare * PLATFORM_COMMISSION_RATE).toFixed(2);
  const driverEarnings = +(actualFare - platformFee).toFixed(2);

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(trip)
      .set({
        status: "completed",
        actualDistanceKm: String(actualDistanceKm),
        actualFare: String(actualFare),
        completedAt: new Date(),
      })
      .where(
        and(
          eq(trip.id, tripId),
          eq(trip.driverId, driverId),
          eq(trip.status, "in_progress"),
        ),
      )
      .returning({ id: trip.id });

    if (!updated) throw new ConflictError("Invalid trip state for completion");

    // Ledger entries (platform + merchant)
    await tx.insert(ledgerEntry).values([
      {
        holderId: "hakwa",
        holderType: "hakwa",
        entryType: "commission",
        amount: String(platformFee),
        tripId,
        description: "Platform commission",
      },
      {
        holderId: driverId,
        holderType: "merchant",
        entryType: "trip_credit",
        amount: String(driverEarnings),
        tripId,
        description: "Trip earnings",
      },
    ]);

    // Gamification points
    await tx
      .insert(pointsLedger)
      .values({
        userId: driverId,
        sourceAction: "trip_completed",
        points: 10,
        description: `Trip ${tripId} completed`,
      });
  });

  return { actualFare, driverEarnings };
}
```

---

## Step 4: Driver Routes

Register routes under `/api/driver`:

```typescript
// api/src/routes/driver.ts
import { Router } from "express";
import { requireRole } from "../middleware/auth";
import {
  updateAvailability,
  reportLocation,
  acceptBooking,
  declineBooking,
  arriveAtPickup,
  startTrip,
  completeTrip,
  getEarnings,
} from "../services/driverService";

const router = Router();
router.use(requireRole("driver"));

router.patch("/availability", updateAvailability);
router.post("/location", reportLocation);
router.post("/bookings/:tripId/accept", acceptBooking);
router.post("/bookings/:tripId/decline", declineBooking);
router.patch("/trips/:tripId/arrive", arriveAtPickup);
router.patch("/trips/:tripId/start", startTrip);
router.patch("/trips/:tripId/complete", completeTrip);
router.get("/earnings", getEarnings);

export default router;
```

Mount in `api/src/index.ts`:

```typescript
app.use("/api/driver", driverRouter);
```

---

## Step 5: Verify

```bash
# 1. Driver goes online
PATCH /api/driver/availability  { "status": "available" }
# → 204

# 2. Simulate dispatch offer (internal: booking service publishes to Redis)
# Driver app receives WebSocket event: booking_offer

# 3. Driver accepts
POST /api/driver/bookings/:tripId/accept
# → 200 with pickup details

# 4. Lifecycle
PATCH /api/driver/trips/:tripId/arrive   # → driver_arrived
PATCH /api/driver/trips/:tripId/start    # → in_progress
PATCH /api/driver/trips/:tripId/complete { "actualDistanceKm": 7.2 }
# → 200 with driverEarnings

# 5. Check earnings
GET /api/driver/earnings
# → paginated list of ledger entries
```
