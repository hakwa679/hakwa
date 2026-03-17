# Research: Taxi Booking — Passenger

_Phase 0 output for `003-taxi-booking-passenger`_

---

## 1. Booking State Machine

**Decision**: Booking lifecycle states live on the `trip` table as a `status`
column. The extended set of states is:

```
pending → accepted → driver_arrived → in_progress → completed
pending → cancelled   (passenger cancels before acceptance)
pending → timed_out   (no driver accepts within timeout window)
accepted → cancelled  (passenger or driver cancels before start)
```

**Rationale**:

- The existing `trip` table already has a `status` column
  (`pending | active | completed | cancelled`). The states are expanded to
  include `accepted`, `driver_arrived`, and `in_progress` for the full
  passenger-visible lifecycle.
- `timed_out` is a terminal state distinct from `cancelled` so analytics can
  differentiate deliberate cancellations from supply shortages.

**Concurrency guard** (Principle VIII):

All status transitions use conditional UPDATE:

```sql
UPDATE trip SET status = 'accepted' WHERE id = $id AND status = 'pending' RETURNING *;
```

A zero-row result returns `409 Conflict` to the caller.

---

## 2. Fare Estimation

**Decision**: Fare is calculated in `@hakwa/workers` using a simple distance-
based formula: `baseFare + (distanceKm × ratePerKm)`. Constants stored in
`@hakwa/core`.

```ts
export const BASE_FARE_FJD = 2.5 as const;
export const RATE_PER_KM_FJD = 0.85 as const;
```

**Rationale**:

- CPU-bound calculation must run in a worker thread per Principle X, though for
  Phase 1 the formula is trivial. Having the calculation in the worker pool
  keeps the architecture correct for when surge pricing is added.
- Distance is computed from the routing service (`@hakwa/map` `getRoute()` using
  OSRM/Valhalla). The worker receives pickup + destination coordinates and
  returns estimated distance + fare.
- Fare is shown to the passenger before booking creation. The same calculation
  runs again at trip completion using actual GPS distance from driver trace.

---

## 3. Driver Matching / Dispatch Algorithm

**Decision**: Phase 1 uses a simple proximity-based dispatch: query available
drivers ordered by Haversine distance to pickup, select the nearest, dispatch
with a 30-second response window. If no acceptance, try the next driver (up to 5
attempts before marking `timed_out`).

**Rationale**:

- Fiji geography is small; a radius-based nearest-driver query covering the
  whole island is acceptable at Phase 1 scale.
- The dispatch loop runs in a background worker job (not in the HTTP request
  handler) initiated after `POST /api/bookings`. The passenger receives
  `status: 'pending'` immediately in the HTTP response; real-time status updates
  arrive via WebSocket.
- Driver location is sourced from `driverLocation` Redis hashes
  (`driver:location:{driverId}`) updated every 5 seconds by the Driver App.

---

## 4. Real-Time Status Updates

**Decision**: Booking status changes are published to Redis channel
`booking:{bookingId}:status` and delivered to the passenger's WebSocket
connection.

**Rationale**:

- Principle V mandates Redis pub/sub for real-time delivery; no DB polling.
- The passenger's WebSocket client subscribes on booking creation and
  unsubscribes on terminal state (`completed`, `cancelled`, `timed_out`).
- Driver location updates are published to `booking:{bookingId}:location` at
  5-second intervals during `accepted` and `in_progress` states.

---

## 5. Booking Cancellation

**Decision**: Passengers can cancel from `pending` or `accepted` states only.
Cancellation from `in_progress` is not permitted (trip is underway).

**Rationale**:

- Allowing cancellation after trip starts creates fare disputes and driver trust
  issues.
- A `cancellationReason` field on the `trip` table capture the reason for future
  analytics.
- When the passenger cancels an `accepted` booking, the driver receives a
  WebSocket push notification.

---
