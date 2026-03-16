# Implementation Plan: Driver Dispatch & Trips

**Branch**: `004-driver-dispatch-trips` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from `/specs/004-driver-dispatch-trips/spec.md`

---

## Summary

Driver-side dispatch flow: drivers toggle availability, receive booking offers
via push notification + WebSocket, accept atomically (conditional UPDATE to
prevent double-acceptance), navigate to pickup, and progress the trip through
`accepted → driver_arrived → in_progress → completed`. At completion, actual
fare is calculated from real distance and a single Drizzle transaction writes
the trip completion, two ledger entries (platform + merchant), and a
gamification points entry. Location updates stream to passengers via Redis
pub/sub. Earnings history is paginated from `ledgerEntry`.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `@hakwa/db`, `@hakwa/redis`, `@hakwa/workers`,
`@hakwa/notifications`, `@hakwa/errors`, `@hakwa/core`  
**Storage**: PostgreSQL (`user.availabilityStatus`; `trip` extended); Redis
(driver location hashes, offer TTL hashes, booking channels)  
**Testing**: Vitest + Supertest; mock Redis pub/sub; Drizzle in-memory for
transaction tests  
**Target Platform**: Node.js API; React Native Expo (Driver App at
`apps/mobile/driver/`)  
**Performance Goals**: Accept response < 300 ms; location publish < 100 ms;
completion transaction < 1 s  
**Constraints**: Fare split must be atomic with trip completion; driver cannot
go offline while `on_trip`; offers expire in 30 s  
**Scale/Scope**: Phase 1 — Fiji taxi; hundreds of concurrent driver sessions

---

## Constitution Check

- [x] **I. Package-First** — Trip completion logic in
      `api/src/services/tripService.ts`; location service in
      `api/src/services/locationService.ts`; gamification insert via `@hakwa/db`
      schema.
- [x] **II. Type Safety** — `AvailabilityStatus` pgEnum; `TripStatus` union;
      `$inferSelect` return types; no `any`.
- [x] **III. Security** — Driver can only act on trips where
      `driverId = session.userId`; `requireRole('driver')` middleware on all
      routes; location only published when driver has active trip.
- [x] **IV. Schema Contract** — `availabilityStatusEnum` defined in
      `pkg/db/schema/auth-schema.ts`; `db-push` applied before service code.
- [x] **V. Real-Time** — Location publishes to Redis
      `booking:{tripId}:location`; status changes publish to
      `booking:{tripId}:status`; WebSocket offer delivery via
      `driver:{userId}:offer`; no DB polling.
- [x] **VI. Redis Package** — All Redis ops via `@hakwa/redis`; TTL-based offer
      expiry; no raw `ioredis` calls outside package.
- [x] **VIII. Concurrency Safety** — Accept uses conditional UPDATE
      (`AND status = 'pending'`); completion uses
      (`AND status = 'in_progress' AND driver_id = $id`); 409 on zero rows.
- [x] **X. Worker-Thread Concurrency** — Fare calculation on completion uses
      pre-computed formula in service layer; heavy OSRM calls (if any) offloaded
      to `@hakwa/workers`.
- [x] **XI. Unified Error Handling** — `ConflictError`, `ForbiddenError`,
      `GoneError` from `@hakwa/errors`; single Express error middleware.
- [x] **XII. Frontend Architecture** — Driver app uses `@hakwa/api-client`
      hooks; WebSocket offer hook; Expo SecureStore session; no hardcoded URLs.
- [x] **XIV. Notification System** — `@hakwa/notifications` push on booking
      offer, passenger arrival confirmation, and trip completion.
- [x] **XVI. UX Principles** — 30-second countdown timer on offer card;
      optimistic status transitions; earnings shown immediately post-completion.
- [x] **XVII. Mapping** — Driver navigation screen via `@hakwa/map`; OSRM
      directions to pickup and dropoff; no Google Maps / Mapbox.
- [x] **XVIII. Official Documentation First** — OSRM route API, Redis Streams
      (`XADD`/`XREADGROUP`) commands, and Expo Location API verified against
      official docs before implementation.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-driver-dispatch-trips/
├── plan.md          ← this file
├── research.md      ← availability storage, offer delivery, accept concurrency, fare split atomicity
├── data-model.md    ← user.availabilityStatus, Redis structures, earnings view
├── quickstart.md    ← schema extension → location service → trip completion tx → routes → verify
└── contracts/
    └── rest-api.md  ← availability, location, accept/decline, lifecycle, earnings
```

### Source Code

```text
pkg/
└── db/schema/auth-schema.ts     ← availabilityStatusEnum + user.availabilityStatus column

api/
└── src/
    ├── services/
    │   ├── locationService.ts   ← updateDriverLocation → Redis hash + pub/sub publish
    │   ├── tripService.ts       ← completeTrip (db transaction: trip + ledger + points)
    │   └── driverService.ts     ← availability toggle, accept/decline, lifecycle transitions
    └── routes/
        └── driver.ts            ← all /api/driver/* routes

apps/
└── mobile/
    └── driver/src/screens/
        ├── AvailabilityScreen.tsx  ← online/offline toggle
        ├── OfferScreen.tsx         ← booking offer card with countdown timer
        ├── NavigationScreen.tsx    ← @hakwa/map driving directions
        └── EarningsScreen.tsx      ← paginated earnings list
```
