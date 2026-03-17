# Quickstart: Taxi Booking — Passenger

_Phase 1 output for `003-taxi-booking-passenger`_

---

## Prerequisites

1. Specs 001 (auth) and 002 (merchant onboarding) deployed — passengers have
   accounts; at least one approved merchant with a vehicle exists.
2. PostgreSQL, Redis running; env vars set.
3. `@hakwa/map` package available (OSRM/Valhalla routing endpoint configured).
4. `@hakwa/workers` pool running.

---

## Step 1 — Extend the Trip Schema

Add passenger, location, and fare columns to `pkg/db/schema/trip.ts`:

```ts
export type TripStatus =
  | "pending"
  | "accepted"
  | "driver_arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "timed_out";

export const trip = pgTable("trip", {
  id: uuid("id").primaryKey().defaultRandom(),
  rideId: uuid("ride_id")
    .notNull()
    .references(() => ride.id, { onDelete: "cascade" }),
  driverId: text("driver_id").references(() => user.id, {
    onDelete: "set null",
  }),
  passengerId: text("passenger_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<TripStatus>().default("pending"),
  pickupLat: numeric("pickup_lat", { precision: 9, scale: 6 }).notNull(),
  pickupLng: numeric("pickup_lng", { precision: 9, scale: 6 }).notNull(),
  pickupAddress: text("pickup_address"),
  destinationLat: numeric("destination_lat", {
    precision: 9,
    scale: 6,
  }).notNull(),
  destinationLng: numeric("destination_lng", {
    precision: 9,
    scale: 6,
  }).notNull(),
  destinationAddress: text("destination_address"),
  estimatedFare: numeric("estimated_fare", { precision: 8, scale: 2 }),
  estimatedDistanceKm: numeric("estimated_distance_km", {
    precision: 7,
    scale: 2,
  }),
  actualDistanceKm: numeric("actual_distance_km", { precision: 7, scale: 2 }),
  fare: numeric("fare", { precision: 10, scale: 2 }),
  platformCommission: numeric("platform_commission", {
    precision: 10,
    scale: 2,
  }),
  merchantAmount: numeric("merchant_amount", { precision: 10, scale: 2 }),
  cancellationReason: text("cancellation_reason"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

```bash
npm run db-push
```

---

## Step 2 — Fare Estimate Worker Task

In `pkg/workers/src/workers/fareCalculation.ts`:

```ts
import { getRoute } from "@hakwa/map";
import { BASE_FARE_FJD, RATE_PER_KM_FJD } from "@hakwa/core";
import { parentPort, workerData } from "worker_threads";

const { pickupLat, pickupLng, destinationLat, destinationLng } = workerData;
const route = await getRoute({
  from: [pickupLat, pickupLng],
  to: [destinationLat, destinationLng],
});
const distanceKm = route.distanceMeters / 1000;
const fare = BASE_FARE_FJD + distanceKm * RATE_PER_KM_FJD;
parentPort!.postMessage({
  distanceKm: distanceKm.toFixed(2),
  fare: fare.toFixed(2),
});
```

---

## Step 3 — Booking Service and Dispatch Loop

`api/src/services/bookingService.ts`:

```ts
export async function createBooking(payload: CreateBookingPayload) {
  // 1. Calculate fare estimate via worker
  const estimate = await workerPool.run("fareCalculation", payload);
  // 2. Insert trip with status = 'pending'
  const [trip] = await db
    .insert(tripTable)
    .values({ ...payload, ...estimate, status: "pending" })
    .returning();
  // 3. Start dispatch loop asynchronously
  setImmediate(() => dispatchLoop(trip.id));
  return trip;
}

async function dispatchLoop(tripId: string) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const driver = await findNearestAvailableDriver(tripId);
    if (!driver) break;
    const accepted = await offerToDriver(tripId, driver.id);
    if (accepted) return; // dispatch complete
  }
  // No driver accepted — mark timed_out
  await db
    .update(tripTable)
    .set({ status: "timed_out", cancelledAt: new Date() })
    .where(and(eq(tripTable.id, tripId), eq(tripTable.status, "pending")));
  await redis.publish(
    `booking:${tripId}:status`,
    JSON.stringify({ type: "status_changed", status: "timed_out" }),
  );
}
```

---

## Step 4 — WebSocket Subscription Handler

In `api/src/websocket.ts`, handle `subscribe` messages:

```ts
case "subscribe": {
  if (msg.channel === "trip") {
    client.tripSubscriptions.add(msg.tripId);
    redis.subscribe(`booking:${msg.tripId}:status`);
    redis.subscribe(`booking:${msg.tripId}:location`);
  }
  break;
}
```

On Redis message, broadcast to all client connections subscribed to that tripId.

---

## Step 5 — Verify End-to-End

1. `POST /api/bookings/fare-estimate` → receive fare + distance.
2. `POST /api/bookings` → `{ status: 'pending' }`.
3. Connect WebSocket, send `subscribe` for trip.
4. Simulate driver acceptance (trigger via spec 004 driver routes).
5. Observe `trip.status_changed` WebSocket event → `accepted`.
6. Observe `trip.location_update` events every 5 s.
7. Simulate trip completion → `trip.completed` event with final fare.
8. `DELETE /api/bookings/:tripId` from `pending` → `cancelled`.
