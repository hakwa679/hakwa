# Implementation Plan: Taxi Booking — Passenger

**Branch**: `003-taxi-booking-passenger` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from
`/specs/003-taxi-booking-passenger/spec.md`

---

## Summary

Passenger-side taxi booking flow: fare estimation, booking creation, real-time
driver matching, live trip tracking, and cancellation. The `trip` table is
extended with passenger, location, and fare columns. Driver dispatch runs in a
background loop (up to 5 nearest-driver attempts). Real-time status and location
updates are delivered via Redis pub/sub → WebSocket. Fare calculation is
offloaded to `@hakwa/workers`.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `@hakwa/db`, `@hakwa/redis`, `@hakwa/workers`,
`@hakwa/map`, `@hakwa/errors`, `ws`  
**Storage**: PostgreSQL (`trip` extended); Redis (driver locations, booking
pub/sub channels)  
**Testing**: Vitest + Supertest; WebSocket integration tests with `ws` client  
**Target Platform**: Node.js API; React Native Expo (Rider App); React + Vite
(Rider Web Portal)  
**Project Type**: Monorepo — Express API + real-time WebSocket server + mobile +
web  
**Performance Goals**: Fare estimate < 2 s; booking creation < 500ms; driver
match notification < 2 s; location updates ≤ 5 s intervals  
**Constraints**: No DB polling for real-time events; cancellation locked after
`in_progress`; duplicate bookings prevented  
**Scale/Scope**: Phase 1 — Fiji taxi; up to 10k passengers, hundreds of
concurrent trips

---

## Constitution Check

- [x] **I. Package-First** — Fare calculation in `@hakwa/workers`; booking
      service in `api/src/services/bookingService.ts`; map routing via
      `@hakwa/map`.
- [x] **II. Type Safety** — `TripStatus` as union type; `trip.$inferSelect` for
      response types; worker message schemas validated.
- [x] **III. Security** — Passenger can only cancel their own booking
      (passengerId check); no location data exposed for unrelated trips; session
      auth on all endpoints.
- [x] **IV. Schema Contract** — Trip extensions defined in
      `pkg/db/schema/trip.ts` first; `db-push` before service code.
- [x] **V. Real-Time** — Booking status changes published to Redis
      `booking:{id}:status`; driver location to `booking:{id}:location`;
      WebSocket fan-out; no DB polling.
- [x] **VI. Redis Package** — All Redis operations via `@hakwa/redis`;
      `REDIS_URL` env var; driver location hashes use Redis.
- [x] **VIII. Concurrency Safety** — Trip status transitions use conditional
      UPDATE (`AND status = <expected>`); `409 Conflict` on zero-row result;
      dispatch loop handles driver double-acceptance.
- [x] **IX. Webhook-First** — No external webhooks in booking flow; internal
      post-commit events (notification dispatch) via Redis Streams.
- [x] **X. Worker-Thread Concurrency** — Fare calculation and route computation
      in `@hakwa/workers` pool; no CPU-bound work on event loop.
- [x] **XI. Unified Error Handling** — `ConflictError`, `ForbiddenError`,
      `ValidationError` from `@hakwa/errors`; single Express error middleware.
- [x] **XII. Frontend Architecture** — Rider App uses `@hakwa/api-client`
      TanStack Query hooks; WebSocket hook from `@hakwa/api-client`; no
      hardcoded URLs.
- [x] **XIII. Shared-First Reuse** — Booking service in `api/src/services/`; map
      primitives in `@hakwa/map`; fare constants in `@hakwa/core`.
- [x] **XIV. Notification System** — Driver acceptance, arrival, and trip
      completion trigger notifications via `@hakwa/notifications`.
- [x] **XV. UI Design System** — Map screen uses `@hakwa/map` component; status
      banners use `@hakwa/tokens`; motion respects `prefers-reduced-motion`.
- [x] **XVI. UX Principles** — Fare shown before booking; skeleton on
      "searching" screen; optimistic status transitions; offline banner; fare
      shown before booking.
- [x] **XVII. Mapping** — All map UI via `@hakwa/map`; OSM tiles from env var;
      Nominatim geocoding; OSRM routing; no Google Maps or Mapbox.

---

## Project Structure

### Documentation (this feature)

```text
specs/003-taxi-booking-passenger/
├── plan.md          ← this file
├── research.md      ← state machine, fare formula, dispatch algo, real-time design
├── data-model.md    ← trip table extension + Redis structures
├── quickstart.md    ← schema → fare worker → booking service → WebSocket handler
└── contracts/
    └── rest-api.md  ← fare-estimate, create/cancel booking, history, WebSocket events
```

### Source Code

```text
pkg/
├── db/schema/trip.ts            ← extended TripStatus + passenger/location/fare columns
├── core/src/fareConstants.ts    ← BASE_FARE_FJD, RATE_PER_KM_FJD
└── workers/src/workers/
    └── fareCalculation.ts       ← route distance + fare calculation worker

api/
└── src/
    ├── services/
    │   └── bookingService.ts    ← createBooking, dispatchLoop, findNearestDriver, offerToDriver
    └── routes/
        └── bookings.ts          ← POST /fare-estimate, POST /, GET /:id, DELETE /:id, GET /history

apps/
└── mobile/
    └── rider/src/screens/
        ├── BookingScreen.tsx    ← map + pickup/destination + fare estimate
        ├── SearchingScreen.tsx  ← "Searching for driver" + cancel
        ├── ActiveTripScreen.tsx ← live driver location map + status banners
        └── TripSummaryScreen.tsx ← fare + rating prompt
```

**Structure Decision**: Option 3 (Mobile + API). Booking logic in
`api/src/services/bookingService.ts`. Dispatch runs as a `setImmediate` loop
within the API process for Phase 1; can be extracted to a dedicated worker
process at scale.
