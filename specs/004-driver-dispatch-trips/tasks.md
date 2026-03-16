---
description: "Task list for Driver Dispatch & Trips"
---

# Tasks: Driver Dispatch & Trips

**Feature Branch**: `004-driver-dispatch-trips` **Input**: plan.md, spec.md,
data-model.md, contracts/rest-api.md **Tech Stack**: TypeScript 5.x, Drizzle
ORM, PostgreSQL, Redis pub/sub, WebSocket (`ws`), `@hakwa/workers`,
`@hakwa/map`, `@hakwa/notifications`, Expo (Driver App)

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes before any service code is written

- [ ] T001 Add `availabilityStatusEnum` (`'offline' | 'available' | 'on_trip'`)
      and `availabilityStatus` column to `user` table in
      `pkg/db/schema/auth-schema.ts`
- [ ] T002 Add `driverId`, `acceptedAt`, `actualFare` columns to `trip` table in
      `pkg/db/schema/trip.ts` (supplements spec 003 columns)
- [ ] T003 Run `db-push` to apply schema and confirm `user.availabilityStatus`
      and all `trip` driver columns exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Location service, trip service, and driver service must exist
before any route can function

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Implement `updateDriverLocation` in
      `api/src/services/locationService.ts` — write to Redis hash
      `driver:{userId}:loc` (TTL 60 s); if driver has active trip, publish to
      `booking:{tripId}:location` pub/sub channel
- [ ] T005 Implement `completeTrip` in `api/src/services/tripService.ts` —
      single Drizzle transaction: update trip status to `completed`, compute
      `actualFare` from `actualDistanceKm`, insert two `ledgerEntry` rows
      (platform 7%, merchant 93%), insert gamification points entry
- [ ] T006 [P] Implement `toggleAvailability`, `acceptBooking`,
      `declineBooking`, and `advanceTripStatus` in
      `api/src/services/driverService.ts`
- [ ] T007 [P] Implement `acceptBooking` concurrency guard in `driverService.ts`
      — use conditional
      `UPDATE trip SET status='accepted', driverId=? WHERE id=? AND status='pending'`;
      throw `ConflictError` if zero rows updated
- [ ] T008 Implement WebSocket offer delivery in `api/src/websocket.ts` —
      subscribe to `driver:{userId}:offer` Redis channel; push booking offer
      payload to connected driver client
- [ ] T009 Register driver routes in `api/src/index.ts` by mounting
      `api/src/routes/driver.ts`

**Checkpoint**: Foundation complete — location service, atomic accept, trip
completion transaction, and offer WebSocket are operational

---

## Phase 3: User Story 1 — Go Online and Receive a Booking Request (Priority: P1) 🎯 MVP

**Goal**: Driver can toggle availability, appear in dispatch pool, and receive
booking offer with pickup details and fare.

**Independent Test**: `PATCH /api/driver/availability` with `status=available`
returns `204`; dispatch loop in spec 003 delivers offer to Redis
`driver:{userId}:offer`; WebSocket pushes offer card to driver app.

- [ ] T010 [US1] Implement `PATCH /api/driver/availability` in
      `api/src/routes/driver.ts` — block `offline` transition when
      `status = 'on_trip'` (`409`); update `user.availabilityStatus`
- [ ] T011 [US1] Implement `POST /api/driver/location` in
      `api/src/routes/driver.ts` — call `updateDriverLocation`, return `204`
- [ ] T012 [P] [US1] Build `AvailabilityScreen.tsx` in
      `apps/mobile/driver/src/screens/AvailabilityScreen.tsx` — online/offline
      toggle with current status indicator, location permission request
- [ ] T013 [US1] Implement `useDriverOfferWebSocket` hook in
      `apps/mobile/driver/src/hooks/useDriverOfferWebSocket.ts` — connect to
      WebSocket, listen on `driver:{userId}:offer` channel, expose
      `currentOffer` state
- [ ] T014 [US1] Build `OfferScreen.tsx` in
      `apps/mobile/driver/src/screens/OfferScreen.tsx` — booking offer card
      showing pickup address, estimated distance to pickup, fare estimate, and
      30-second countdown timer; auto-dismiss on expiry

**Checkpoint**: User Story 1 complete — driver can go online and receive booking
offers

---

## Phase 4: User Story 2 — Accept a Booking and Navigate to Pickup (Priority: P1)

**Goal**: Driver accepts a booking atomically, sees pickup navigation, and marks
arrival.

**Independent Test**: `POST /api/driver/bookings/:tripId/accept` transitions
trip to `accepted` and returns pickup details; second accept from another driver
returns `409`; `PATCH /api/driver/bookings/:tripId/arrived` transitions to
`driver_arrived`.

- [ ] T015 [US2] Implement `POST /api/driver/bookings/:tripId/accept` in
      `api/src/routes/driver.ts` — call `acceptBooking` (conditional UPDATE),
      publish `accepted` status event to `booking:{tripId}:status`, notify
      passenger via `@hakwa/notifications`, return pickup details
- [ ] T016 [US2] Implement `POST /api/driver/bookings/:tripId/decline` in
      `api/src/routes/driver.ts` — forward booking to next driver in dispatch
      loop (via Redis), return `204`
- [ ] T017 [US2] Implement `PATCH /api/driver/bookings/:tripId/arrived` in
      `api/src/routes/driver.ts` — transition to `driver_arrived` (conditional
      UPDATE WHERE `driverId = session.userId`), publish status event, notify
      passenger
- [ ] T018 [P] [US2] Build `NavigationScreen.tsx` in
      `apps/mobile/driver/src/screens/NavigationScreen.tsx` — `@hakwa/map`
      component with driving directions to pickup; "I've Arrived" button; start
      background location updates every 5 s
- [ ] T019 [US2] Start GPS location reporting loop on accept in
      `apps/mobile/driver/src/screens/NavigationScreen.tsx` — call
      `POST /api/driver/location` every 5 s while on trip; stop on trip
      completion or cancellation

**Checkpoint**: User Story 2 complete — booking acceptance, atomic conflict
rejection, and pickup navigation are functional

---

## Phase 5: User Story 3 — Start and Complete a Trip (Priority: P1)

**Goal**: Driver starts trip, navigates to destination, and completes trip
triggering atomic fare split.

**Independent Test**: `PATCH /api/driver/bookings/:tripId/start` transitions to
`in_progress`; `POST /api/driver/bookings/:tripId/complete` transitions to
`completed` and creates two `ledgerEntry` rows (platform 7%, merchant 93%) in
the same transaction.

- [ ] T020 [US3] Implement `PATCH /api/driver/bookings/:tripId/start` in
      `api/src/routes/driver.ts` — transition to `in_progress` (conditional
      UPDATE WHERE `status='driver_arrived' AND driverId=?`), publish status
      event
- [ ] T021 [US3] Implement `POST /api/driver/bookings/:tripId/complete` in
      `api/src/routes/driver.ts` — call `completeTrip` transaction service (trip
      status + ledger entries + gamification points + gamification event
      publish), publish `completed` status event, notify passenger
- [ ] T022 [US3] Update `NavigationScreen.tsx` to show "Start trip" button on
      `driver_arrived` state and "Complete trip" button on `in_progress` state
- [ ] T023 [US3] Show post-completion earnings summary in `NavigationScreen.tsx`
      — gross fare and net earnings (93%) — before returning to
      `AvailabilityScreen`

**Checkpoint**: User Story 3 complete — trip lifecycle and atomic fare split are
functional

---

## Phase 6: User Story 4 — Decline or Ignore a Booking Request (Priority: P2)

**Goal**: Driver can decline or let expire a booking offer and remain in the
`available` pool.

**Independent Test**: `POST /api/driver/bookings/:tripId/decline` returns `204`
and driver `availabilityStatus` remains `available`; expired offer clears from
`OfferScreen` and driver stays online.

- [ ] T024 [US4] Confirm decline route in `api/src/routes/driver.ts` does not
      change driver `availabilityStatus` (driver stays `available`)
- [ ] T025 [US4] Implement offer expiry handling in `OfferScreen.tsx` — when
      countdown reaches 0, dismiss card and call
      `POST /api/driver/bookings/:tripId/decline` automatically; show brief
      "Request expired" toast

**Checkpoint**: User Story 4 complete — decline and auto-expiry both leave
driver in available pool

---

## Phase 7: User Story 5 — View Earnings History (Priority: P3)

**Goal**: Driver can view paginated list of completed trips with net earnings.

**Independent Test**: `GET /api/driver/earnings` returns paginated ledger
entries for the current driver with gross fare and net earnings;
`EarningsScreen` renders the list.

- [ ] T026 [US5] Implement `GET /api/driver/earnings` in
      `api/src/routes/driver.ts` — query `ledgerEntry` table for
      `holderType='driver'` rows belonging to the current user, join with `trip`
      for destination/date, paginate newest-first
- [ ] T027 [P] [US5] Build `EarningsScreen.tsx` in
      `apps/mobile/driver/src/screens/EarningsScreen.tsx` — FlatList of trips
      with destination, date, gross fare, and net earnings (93% share); "Load
      more" pagination

**Checkpoint**: User Story 5 complete — earnings history is functional

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Validate concurrency: concurrent accept attempts on same `tripId`
      from two drivers — second must receive `409 ConflictError` — audit
      conditional UPDATE in `driverService.ts`
- [ ] T029 [P] Validate driver cannot go offline when
      `availabilityStatus = 'on_trip'` — `PATCH /api/driver/availability` must
      return `409` in this state
- [ ] T030 [P] Driver GPS location only published to `booking:{tripId}:location`
      when driver has an active trip — validate `locationService.ts` guard
- [ ] T031 [P] Verify all driver routes return `403` for non-driver roles via
      `requireRole('driver')` middleware check

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (Foundation) → Phase 3–7 (User Stories)
Spec 003 trip schema must be applied before spec 004 schema additions
US1 (online + offer) → US2 (accept + navigate) → US3 (start + complete) [sequential trip flow]
US4 (decline) independent of US2/US3 after Phase 2
US5 (earnings) depends on US3 (needs completed trips)
```

## Parallel Execution Examples

- T004 + T006 can run in parallel (location service vs driver service)
- T012 + T013 + T014 can run in parallel (separate screen/hook files)
- T018 + T019 can run in parallel (screen UI vs location loop)
- T026 + T027 can run in parallel (route vs screen)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T014) — driver online + receive
  offers
- **MVP+**: Add Phase 4 + Phase 5 (T015–T023) — accept, navigate, complete trip
- **Full P2**: Add Phase 6 (T024–T025) — decline and offer expiry
- **Complete**: Add Phase 7 + Polish (T026–T031)

**Total tasks**: 31 | **Parallelizable**: 12 | **User stories**: 5
