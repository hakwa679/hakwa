---
description: "Task list for Wallet, Fare & Commission"
---

# Tasks: Wallet, Fare & Commission

**Feature Branch**: `005-wallet-fare-commission` **Input**: plan.md, spec.md,
data-model.md, contracts/rest-api.md **Tech Stack**: TypeScript 5.x, Drizzle
ORM, PostgreSQL, Redis pub/sub, `@hakwa/core`, `@hakwa/email`, Expo (Merchant
App, Rider App)

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fare constants and enum validation before any service code is
written

- [x] T001 Implement `calculateFare`, `splitFare`, and all fare constants
      (`BASE_FARE_FJD`, `RATE_PER_KM_FJD`, `PLATFORM_COMMISSION_RATE`,
      `MERCHANT_SHARE_RATE`, `PAYOUT_SERVICE_FEE_FJD`) in
      `pkg/core/src/fareConstants.ts`
- [x] T002 Confirm `entryTypeEnum` in `pkg/db/schema/wallet.ts` has all required
      values: `trip_credit`, `commission`, `payout_debit`,
      `payout_service_fee_debit`
- [x] T003 Confirm `holderTypeEnum` in `pkg/db/schema/wallet.ts` has
      `individual`, `merchant`, `hakwa` values
- [x] T004 Ensure Hakwa platform wallet seed row (`holderId='hakwa'`,
      `holderType='hakwa'`) exists — add to database seed script or migration

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wallet service must exist before any wallet route or real-time
update can function

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement `getMerchantBalance` in `api/src/services/walletService.ts`
      — query `SUM(amount) FROM ledgerEntry WHERE holderId = merchantId`; no
      mutable balance column
- [x] T006 [P] Implement `getLedgerPage` in `api/src/services/walletService.ts`
      — cursor-based pagination of `ledgerEntry` rows for a given holder, sorted
      newest-first
- [x] T007 [P] Implement `notifyBalanceUpdated` in
      `api/src/services/walletService.ts` — publish
      `wallet:updated:{merchantId}` event to Redis pub/sub after ledger insert
- [x] T008 Register merchant wallet routes in `api/src/index.ts` by mounting
      `api/src/routes/merchantWallet.ts`; register trip receipt routes in
      `api/src/routes/trips.ts`

**Checkpoint**: Foundation complete — wallet service, ledger paging, and balance
notification are ready

---

## Phase 3: User Story 1 — Fare Split on Trip Completion (Priority: P1) 🎯 MVP

**Goal**: Completing a trip atomically creates two ledger entries (platform
credit + merchant credit) summing to the gross fare.

**Independent Test**: Call `POST /api/driver/bookings/:tripId/complete` on an
`in_progress` trip → trip status becomes `completed` → two `ledgerEntry` rows
exist with `entryType='commission'` (7%) and `entryType='trip_credit'` (93%);
both share the same `tripId`; total equals gross fare.

- [x] T009 [US1] Update `completeTrip` transaction in
      `api/src/services/tripService.ts` — after transition to `completed`, call
      `calculateFare(actualDistanceKm)` from `@hakwa/core`, then
      `splitFare(fare)`, then atomically insert `commission` ledger entry for
      platform wallet and `trip_credit` entry for merchant wallet in same
      Drizzle transaction
- [x] T010 [US1] Validate rounding rule in `completeTrip`: merchant amount =
      `fare - platform` (never both independently rounded to avoid off-by-1-cent
      gap)
- [x] T011 [US1] After transaction commits, call
      `notifyBalanceUpdated(merchantId)` to publish Redis event

**Checkpoint**: User Story 1 complete — atomic fare split with two ledger
entries is functional

---

## Phase 4: User Story 2 — Fare Estimate Before Booking (Priority: P1)

**Goal**: Before confirming a booking, the passenger receives a fare estimate
with breakdown using shared `calculateFare` from `@hakwa/core`.

**Independent Test**: `POST /api/bookings/fare-estimate` returns
`{ estimatedFare, estimatedDistanceKm, baseFare, ratePerKm, currency }` using
`calculateFare(distanceKm)` from `@hakwa/core`; same constants as trip
completion.

- [x] T012 [US2] Update fare estimate worker in
      `pkg/workers/src/workers/fareCalculation.ts` to import and use
      `calculateFare` from `pkg/core/src/fareConstants.ts` (ensures estimate
      uses same formula as completion)
- [x] T013 [P] [US2] Update `POST /api/bookings/fare-estimate` response in
      `api/src/routes/bookings.ts` to include `baseFare` and `ratePerKm` fields
      from `@hakwa/core` constants

**Checkpoint**: User Story 2 complete — fare estimate uses shared constants
matching trip completion calculation

---

## Phase 5: User Story 3 — Merchant Wallet Balance and Ledger (Priority: P2)

**Goal**: Merchant can view current balance and paginated ledger; balance
updates in real time after trip completion without manual refresh.

**Independent Test**: `GET /api/merchant/wallet/balance` returns
`{ balance, currency, pendingPayoutAmount, lastPayoutAt }`;
`GET /api/merchant/wallet/ledger` returns paginated entries with `entryType`,
`amount`, `label`, `tripId`, `createdAt`; a new trip completion updates balance
via WebSocket without page reload.

- [x] T014 [US3] Implement `GET /api/merchant/wallet/balance` in
      `api/src/routes/merchantWallet.ts` — call `getMerchantBalance`, return
      `{ balance, currency, pendingPayoutAmount, lastPayoutAt }`
- [x] T015 [US3] Implement `GET /api/merchant/wallet/ledger` in
      `api/src/routes/merchantWallet.ts` — call `getLedgerPage` with cursor +
      limit params, return paginated items with human-readable `label` per
      `entryType`
- [x] T016 [US3] Subscribe to `wallet:updated:{merchantId}` WebSocket channel in
      `api/src/websocket.ts` — push `{ type: 'balance_updated' }` event to
      connected merchant client
- [x] T017 [P] [US3] Build `WalletScreen.tsx` in
      `apps/mobile/merchant/src/screens/WalletScreen.tsx` — balance display,
      ledger FlatList with cursor pagination, real-time refresh on WebSocket
      `balance_updated` event using `@hakwa/api-client` hook
- [x] T018 [P] [US3] Build `WalletPage.tsx` in
      `apps/web/src/merchant/WalletPage.tsx` — equivalent wallet view for
      Merchant Web Portal

**Checkpoint**: User Story 3 complete — merchant wallet with real-time balance
and ledger is functional

---

## Phase 6: User Story 4 — Passenger Trip Receipt (Priority: P2)

**Goal**: After a trip completes, the passenger can view an in-app receipt and
optionally request an emailed copy.

**Independent Test**: `GET /api/trips/:tripId/receipt` verifies
`trip.passengerId === session.userId` and returns full fare breakdown;
`POST /api/trips/:tripId/receipt/email` enqueues to Redis Stream `emails:outbox`
and returns `202 Accepted`.

- [x] T019 [US4] Implement `GET /api/trips/:tripId/receipt` in
      `api/src/routes/trips.ts` — verify passenger ownership, return
      `{ pickup, destination, distanceKm, baseFare, totalFare, currency, completedAt, driverName }`
- [x] T020 [US4] Implement `POST /api/trips/:tripId/receipt/email` in
      `api/src/routes/trips.ts` — verify ownership, push receipt payload to
      Redis Stream `emails:outbox` via `@hakwa/redis`, return `202 Accepted`
- [x] T021 [P] [US4] Update `TripSummaryScreen.tsx` in
      `apps/mobile/rider/src/screens/TripSummaryScreen.tsx` — display receipt
      details (pickup, destination, distance, fare breakdown) fetched from
      `GET /api/trips/:tripId/receipt`
- [x] T022 [P] [US4] Add "Email receipt" button in `TripSummaryScreen.tsx` and
      `TripReceiptScreen.tsx` — calls `POST /api/trips/:tripId/receipt/email`,
      shows success/error toast

**Checkpoint**: User Story 4 complete — in-app receipt and email receipt request
are functional

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T023 [P] Validate `calculateFare` throws on `distanceKm <= 0` —
      non-positive distance must not create a zero-fare ledger entry
- [x] T024 [P] Validate atomicity: simulate DB failure at ledger INSERT and
      confirm trip status rolls back to `in_progress` — no partial money
      movement
- [x] T025 [P] Confirm `GET /api/merchant/wallet/balance` returns
      `403 ForbiddenError` if requesting user is not the merchant matching the
      wallet

---

## Dependencies

```
Phase 1 (Constants) → Phase 2 (Service) → Phase 3–6 (User Stories)
US1 (fare split) depends on spec 004 trip completion flow
US2 (fare estimate) depends on spec 003 booking creation flow
US3 (merchant wallet) depends on US1 (needs completed trips to show)
US4 (receipt) depends on US1 (needs completed trip)
```

## Parallel Execution Examples

- T005 + T006 + T007 can run in parallel (different service functions)
- T014 + T015 can run in parallel (different route handlers)
- T017 + T018 can run in parallel (mobile vs web screen)
- T021 + T022 can run in parallel (different screen components)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T011) — atomic fare split on
  completion
- **MVP+**: Add Phase 4 (T012–T013) — shared fare estimate constants
- **Full P2**: Add Phase 5 + 6 (T014–T022) — merchant wallet UI + passenger
  receipts
- **Complete**: Add Polish (T023–T025)

**Total tasks**: 25 | **Parallelizable**: 10 | **User stories**: 4
