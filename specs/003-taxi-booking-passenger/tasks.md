---
description: "Task list for Taxi Booking — Passenger"
---

# Tasks: Taxi Booking — Passenger

**Feature Branch**: `003-taxi-booking-passenger` **Input**: plan.md, spec.md,
data-model.md, contracts/rest-api.md **Tech Stack**: TypeScript 5.x, Drizzle
ORM, PostgreSQL, Redis pub/sub, WebSocket (`ws`), `@hakwa/workers`,
`@hakwa/map`, Expo (Rider App)

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes and constants before any service code is written

- [ ] T001 Extend `trip` table with `passengerId`, `pickupLat`, `pickupLng`,
      `pickupAddress`, `destinationLat`, `destinationLng`, `destinationAddress`,
      `estimatedFare`, `estimatedDistanceKm`, `actualDistanceKm`,
      `cancellationReason`, `startedAt`, `completedAt`, `cancelledAt` columns in
      `pkg/db/schema/trip.ts`
- [ ] T002 Update `TripStatus` enum in `pkg/db/schema/trip.ts` to include:
      `pending`, `accepted`, `driver_arrived`, `in_progress`, `completed`,
      `cancelled`, `timed_out`
- [ ] T003 Export updated `trip` schema from `pkg/db/schema/index.ts`
- [ ] T004 [P] Create `pkg/core/src/fareConstants.ts` with `BASE_FARE_FJD` and
      `RATE_PER_KM_FJD`
- [ ] T005 Run `db-push` to apply schema changes and confirm all new columns
      exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fare worker, booking service, and WebSocket plumbing must exist
before any booking route functions

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Implement `fareCalculation` worker in
      `pkg/workers/src/workers/fareCalculation.ts` — accept
      `{ pickupLat, pickupLng, destinationLat, destinationLng }`, call OSRM via
      `@hakwa/map` for route distance, compute `baseFare + distanceFare`, return
      `{ estimatedFare, estimatedDistanceKm, breakdown }`
- [ ] T007 Implement `createBooking`, `dispatchLoop`, `findNearestDriver`, and
      `offerToDriver` in `api/src/services/bookingService.ts` — dispatch loop
      tries up to 5 nearest drivers sequentially via conditional
      `UPDATE … WHERE status = 'pending'`
- [ ] T008 [P] Implement Redis pub/sub publisher helper in
      `api/src/services/bookingService.ts` — publish to
      `booking:{tripId}:status` and `booking:{tripId}:location` channels using
      `@hakwa/redis`
- [ ] T009 [P] Implement WebSocket subscription handler in
      `api/src/websocket.ts` — subscribe to `booking:{id}:status` and
      `booking:{id}:location` Redis channels; push messages to connected
      passenger WebSocket client
- [ ] T010 Register booking routes in `api/src/index.ts` by mounting
      `api/src/routes/bookings.ts`

**Checkpoint**: Foundation complete — fare calculation, dispatch loop, and
WebSocket pub/sub are operational

---

## Phase 3: User Story 1 — Request a Taxi Ride (Priority: P1) 🎯 MVP

**Goal**: Passenger can get a fare estimate, create a booking, and see real-time
driver matching status.

**Independent Test**: `POST /api/bookings/fare-estimate` returns fare and
distance; `POST /api/bookings` creates trip with `status=pending`; WebSocket
`booking:{id}:status` channel delivers `accepted` event when driver matches.

- [ ] T011 [US1] Implement `POST /api/bookings/fare-estimate` in
      `api/src/routes/bookings.ts` — dispatch to `fareCalculation` worker,
      return `{ estimatedFare, estimatedDistanceKm, currency, breakdown }`
- [ ] T012 [US1] Implement `POST /api/bookings` in `api/src/routes/bookings.ts`
      — validate no active booking exists (`409 ACTIVE_BOOKING_EXISTS`), create
      trip row with `status=pending`, start `dispatchLoop` asynchronously
- [ ] T013 [US1] Implement `GET /api/bookings/:tripId` in
      `api/src/routes/bookings.ts` — return trip status, driver info (if
      matched), and location
- [ ] T014 [P] [US1] Build `BookingScreen.tsx` in
      `apps/mobile/rider/src/screens/BookingScreen.tsx` — map with pickup pin
      (auto-detected via device GPS), destination search input, fare estimate
      card, "Book ride" button
- [ ] T015 [US1] Build `SearchingScreen.tsx` in
      `apps/mobile/rider/src/screens/SearchingScreen.tsx` — "Searching for
      driver" animation, "Cancel" button, connects to WebSocket for status
      updates
- [ ] T016 [US1] Handle `no_drivers` / `timed_out` state in
      `SearchingScreen.tsx` — show "No drivers available — try again shortly"
      message and return to `BookingScreen`

**Checkpoint**: User Story 1 complete — fare estimate, booking creation, and
driver matching are functional

---

## Phase 4: User Story 2 — Live Trip Tracking (Priority: P1)

**Goal**: Passenger sees driver location on a map updating every ≤ 5 s and
receives status banners for each trip phase.

**Independent Test**: WebSocket channel `booking:{id}:location` delivers driver
GPS updates; `booking:{id}:status` delivers `driver_arrived`, `in_progress`, and
`completed` events; passenger map updates without app refresh.

- [ ] T017 [US2] Build `ActiveTripScreen.tsx` in
      `apps/mobile/rider/src/screens/ActiveTripScreen.tsx` — `@hakwa/map`
      component showing driver pin + route polyline, status banner overlay,
      subscribes to `booking:{id}:location` WebSocket channel
- [ ] T018 [US2] Implement status banner transitions in `ActiveTripScreen.tsx` —
      `accepted` → "Driver en route", `driver_arrived` → "Your driver has
      arrived" (with vibration), `in_progress` → "On the way to [destination]",
      `completed` → navigate to `TripSummaryScreen`
- [ ] T019 [US2] Build `TripSummaryScreen.tsx` in
      `apps/mobile/rider/src/screens/TripSummaryScreen.tsx` — final fare
      display, driver name/vehicle, rating prompt
- [ ] T020 [US2] Create `useBookingWebSocket` hook in
      `apps/mobile/rider/src/hooks/useBookingWebSocket.ts` — manage WebSocket
      connection lifecycle, reconnect on disconnect, expose `status` and
      `driverLocation` state

**Checkpoint**: User Story 2 complete — live trip tracking with real-time status
banners is functional

---

## Phase 5: User Story 3 — View Fare Estimate Breakdown (Priority: P2)

**Goal**: Passenger sees a clear fare breakdown (base fare + distance component)
before confirming booking.

**Independent Test**: `POST /api/bookings/fare-estimate` response includes
`breakdown.baseFare` and `breakdown.distanceFare`; `BookingScreen` renders the
breakdown card before the "Book ride" button is active.

- [ ] T021 [P] [US3] Add fare breakdown card component in
      `apps/mobile/rider/src/components/FareBreakdownCard.tsx` — shows total,
      base fare, distance fare, and currency label
- [ ] T022 [P] [US3] Integrate `FareBreakdownCard` into `BookingScreen.tsx` —
      render after pickup + destination selected; disable "Book ride" until
      estimate loaded

**Checkpoint**: User Story 3 complete — transparent fare breakdown shown before
booking

---

## Phase 6: User Story 4 — Cancel a Booking (Priority: P2)

**Goal**: A `pending` or `accepted` booking can be cancelled before
`in_progress`; grace-period cancellations are penalty-free.

**Independent Test**: `DELETE /api/bookings/:tripId` with `status=pending`
returns `200`; repeat on `in_progress` trip returns
`403 CANCELLATION_NOT_ALLOWED`.

- [ ] T023 [US4] Implement `DELETE /api/bookings/:tripId` in
      `api/src/routes/bookings.ts` — verify `passengerId === session.userId`;
      reject if `status = 'in_progress'` (`403`); transition to `cancelled`,
      publish to `booking:{id}:status`, notify driver via `@hakwa/notifications`
- [ ] T024 [US4] Add cancellation grace-period logic in `bookingService.ts` — if
      `acceptedAt` < 30 s ago, flag as penalty-free; else apply cancellation
      policy (store policy in `@hakwa/core` constants)
- [ ] T025 [US4] Integrate "Cancel booking" button in `SearchingScreen.tsx` and
      `ActiveTripScreen.tsx` — show confirmation dialog with grace-period /
      policy explanation; hide button when `status = 'in_progress'`

**Checkpoint**: User Story 4 complete — pre-trip cancellation with grace period
is functional

---

## Phase 7: User Story 5 — View Trip History (Priority: P3)

**Goal**: Passenger can browse past trips in reverse-chronological order and
view individual trip receipts.

**Independent Test**: `GET /api/bookings/history` returns list of `completed`
and `cancelled` trips for the current passenger; each item includes fare, route,
and driver name.

- [ ] T026 [US5] Implement `GET /api/bookings/history` in
      `api/src/routes/bookings.ts` — return paginated list of `completed` and
      `cancelled` trips for `session.userId`, sorted newest-first
- [ ] T027 [P] [US5] Build `TripHistoryScreen.tsx` in
      `apps/mobile/rider/src/screens/TripHistoryScreen.tsx` — FlatList with trip
      rows (destination, date, fare), "Load more" pagination
- [ ] T028 [P] [US5] Build `TripReceiptScreen.tsx` in
      `apps/mobile/rider/src/screens/TripReceiptScreen.tsx` — shows
      pickup/destination address, distance, fare breakdown, driver name

**Checkpoint**: User Story 5 complete — trip history and receipt views are
functional

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T029 [P] Offline banner in `BookingScreen.tsx` — detect network state and
      show "You're offline" message blocking booking creation
- [ ] T030 [P] Skeleton loaders in `SearchingScreen.tsx` while dispatch loop
      runs (not an empty screen)
- [ ] T031 [P] Validate concurrency safety of dispatch loop in
      `bookingService.ts` —
      `UPDATE trip SET status='accepted', driverId=? WHERE id=? AND status='pending'`
      conditional update returns 0 rows on double-acceptance
- [ ] T032 [P] Ensure no driver location or booking details are exposed for
      trips not belonging to the requesting passenger — audit
      `GET /api/bookings/:tripId` middleware ownership check

---

## Dependencies

```
Phase 1 (Schema) → Phase 2 (Foundation) → Phase 3–7 (User Stories)
US1 (booking request) → US2 (live tracking) [needs accepted booking]
US3 (fare breakdown) is an enhancement of US1 — can be built in parallel after Phase 3 starts
US4 (cancellation) depends on US1 booking creation
US5 (history) independent after Phase 2
```

## Parallel Execution Examples

- T006 + T007 can run in parallel (worker vs service)
- T008 + T009 can run in parallel (publish vs subscribe)
- T014 + T015 can run in parallel (different screens)
- T021 + T022 can run in parallel (component vs integration)
- T027 + T028 can run in parallel (different screens)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T016) — fare estimate + booking
  creation + driver matching
- **MVP+**: Add Phase 4 (T017–T020) — live trip tracking
- **Full P2**: Add Phase 5 + 6 (T021–T025) — fare breakdown + cancellation
- **Complete**: Add Phase 7 + Polish (T026–T032)

**Total tasks**: 32 | **Parallelizable**: 14 | **User stories**: 5
