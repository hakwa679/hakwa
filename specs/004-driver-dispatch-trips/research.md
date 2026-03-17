# Research: Driver Dispatch & Trips

## Decision: Driver Availability State Storage

**Decision**: Store driver availability as a column `availabilityStatus` on the
`user` table (or a separate `driverProfile` table if it doesn't exist). Use
`offline | available | on_trip` values backed by a Drizzle pgEnum.

**Rationale**: Availability is a live operational flag, not a profile attribute.
A single column is queryable with an index and avoids a junction table. Keeping
it on the user row means the dispatch query (nearest `available` drivers) does
not need a join.

**Alternatives considered**:

- Redis-only presence: Fast reads but no durational persistence across server
  restarts; hard to audit; would require a sync-back mechanism.
- Separate `driverState` table: Over-engineered for Phase 1; adds a join to
  every dispatch query.

---

## Decision: Dispatch Offer Delivery

**Decision**: Push the booking offer to the driver via WebSocket
(`driver:{userId}:offer` channel) AND via `@hakwa/notifications` push
notification. The driver app responds over the REST endpoint within 30 s.

**Rationale**: Push notifications wake the app when backgrounded; WebSocket
delivers the card immediately when the app is foregrounded. Both are needed for
reliable delivery. The offer includes tripId, pickup coords, pickup address,
distance to pickup (km), and estimated fare.

**Alternatives considered**:

- WebSocket only: Driver app must be foregrounded. Misses backgrounded drivers.
- Push notification only: No immediate in-app interactivity; requires deep link
  round-trip.

---

## Decision: Accept / Decline Concurrency

**Decision**: Use a conditional UPDATE protecting against double-acceptance:

```sql
UPDATE trip
SET status = 'accepted', driver_id = $driverId, accepted_at = now()
WHERE id = $tripId AND status = 'pending'
RETURNING id;
```

Zero rows returned → 409 Conflict. The `dispatchLoop` in `bookingService.ts`
listens for the Redis `booking:{id}:status` channel: when status becomes
`accepted` it stops offering to other drivers.

**Rationale**: Single-row optimistic lock without advisory locks. Proven
concurrency pattern common to booking and ticketing systems.

**Alternatives considered**:

- `SELECT FOR UPDATE` row lock: Heavier; holds a transaction lock across network
  round-trips; not needed here since the transition is a single UPDATE.
- Application-level mutex (Redis SETNX): Works but adds a Redis round-trip and
  requires TTL management.

---

## Decision: Trip Completion — Fare Split Atomicity

**Decision**: The `PATCH /api/driver/trips/:tripId/complete` handler executes in
a Drizzle transaction that:

1. Computes actual fare from `actualDistanceKm` (supplied by driver).
2. Updates `trip` status to `completed`, sets `actualFare`, `completedAt`.
3. Inserts two `ledgerEntry` rows (platform 7%, merchant 93%).
4. Inserts into `pointsLedger` for trip-completion gamification.

All four writes are in one transaction. If any step fails the trip status is
rolled back, ensuring wallets are never credited for an incomplete trip.

**Rationale**: Financial data cannot be in a partially-written state. The
transaction boundary is the minimal scope needed.

**Alternatives considered**:

- Separate wallet credit step: Allows gaps between status update and credit;
  risky under failure.
- Saga / outbox pattern: Over-engineered for Phase 1; useful only with separate
  microservices.

---

## Decision: Location Reporting

**Decision**: Driver app POSTs location updates to `POST /api/driver/location`
(lat, lng, heading) on a 5-second interval while `availabilityStatus` is
`available` or `on_trip`. The handler writes to Redis hash `driver:{userId}:loc`
and, if the driver has an active trip, publishes to `booking:{tripId}:location`.

**Rationale**: REST POST is simpler to implement reliably in React Native
background tasks than a persistent WebSocket uplink. The 5-second interval
balances freshness vs battery. Redis hash write is O(1).

**Alternatives considered**:

- WebSocket uplink from driver: More complex to maintain connection in
  background mode on iOS; requires reconnect logic.
- Direct DB write: Creates heavy write load; Redis is the correct layer for
  ephemeral location data.

---

## Decision: Earnings History Pagination

**Decision**: `GET /api/driver/earnings` returns paginated ledger entries where
`holder_type = merchant` and `entry_type = trip_credit`, joined to the trip
record for context. Cursor-based pagination using `ledgerEntry.id`.

**Rationale**: Unbounded result sets are prohibited by constitution principle
II. Using `ledgerEntry` directly avoids building a separate earnings table.

**Alternatives considered**:

- Denormalised earnings table: Redundant; the ledger is the source of truth.
- Offset pagination: Non-deterministic when new entries arrive; cursor is
  preferred.
