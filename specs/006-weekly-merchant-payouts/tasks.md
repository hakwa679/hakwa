---
description: "Task list for Weekly Merchant Payouts"
---

# Tasks: Weekly Merchant Payouts

**Feature Branch**: `006-weekly-merchant-payouts` **Input**: plan.md, spec.md,
data-model.md, contracts/rest-api.md **Tech Stack**: TypeScript 5.x, Drizzle
ORM, PostgreSQL, `@hakwa/workers`, `@hakwa/notifications`, `@hakwa/core`, Expo
(Merchant App)

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All paths relative to repo root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm schema enum values and bank transfer stub before worker
code is written

- [X] T001 Confirm `payoutBatchStatusEnum` values (`scheduled`, `processing`,
      `completed`) in `pkg/db/schema/wallet.ts`
- [X] T002 Confirm `payoutStatusEnum` values (`pending`, `processing`,
      `succeeded`, `failed`) in `pkg/db/schema/wallet.ts`
- [X] T003 Implement `BankTransferService` interface and Phase 1 stub in
      `pkg/core/src/bankTransfer.ts` — stub records attempt, returns
      `{ success: true }` (no real bank API)
- [X] T004 Implement `nextPayoutDate(now: Date): Date` utility in
      `pkg/core/src/payoutSchedule.ts` — returns the next Monday 00:00 Fiji time
      (UTC+12); accounts for "already processing this week" case

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Payout processor worker and weekly cron must exist before
end-to-end batch testing

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement `processBatch(batchId)` in
      `pkg/workers/src/workers/payoutProcessor.ts` — for each merchant with
      balance > `PAYOUT_SERVICE_FEE_FJD`: create `payout` row, atomically write
      `payout_debit` + `payout_service_fee_debit` ledger entries in same Drizzle
      transaction, call `BankTransferService`, update payout status to
      `succeeded` or `failed`
- [X] T006 [P] Implement idempotent batch creation in
      `api/src/jobs/weeklyPayout.ts` —
      `INSERT INTO payoutBatch (weekStart, status) VALUES (monday, 'scheduled') ON CONFLICT (weekStart) DO NOTHING`;
      return existing batch ID if already exists
- [X] T007 [P] Implement cron registration in `api/src/jobs/weeklyPayout.ts` —
      schedule `processBatch` every Monday 00:00 Fiji time using a Node.js cron
      library
- [X] T008 Register internal payout routes in `api/src/index.ts` by mounting
      `api/src/routes/internal/payouts.ts` (protected — not public-facing)

**Checkpoint**: Foundation complete — payout worker, idempotent batch creation,
and cron scheduler are operational

---

## Phase 3: User Story 1 — Automated Weekly Payout Batch Runs (Priority: P1) 🎯 MVP

**Goal**: Cron creates exactly one batch per week, processes all eligible
merchants, writes atomic ledger debits, and transitions batch to `completed`.

**Independent Test**: Trigger `POST /api/internal/batches` for a given
`weekStart` twice → only one `payoutBatch` row exists;
`POST /api/internal/batches/:id/process` creates `payout` rows for merchants
with balance > 1.00; two `ledgerEntry` rows per payout (`payout_debit` +
`payout_service_fee_debit`) exist; batch status becomes `completed`.

- [X] T009 [US1] Implement `POST /api/internal/payouts/batches` in
      `api/src/routes/internal/payouts.ts` — create batch for given `weekStart`
      using idempotent insert; return `{ batchId, status, weekStart }`
- [X] T010 [US1] Implement `POST /api/internal/payouts/batches/:batchId/process`
      in `api/src/routes/internal/payouts.ts` — transition batch to
      `processing`, dispatch `processBatch(batchId)` to worker pool, wait for
      completion, transition to `completed`
- [X] T011 [US1] Skip merchants with balance ≤ `PAYOUT_SERVICE_FEE_FJD` in
      `payoutProcessor.ts` — no payout row created; balance carries forward
      naturally
- [X] T012 [US1] Snapshot `bankAccountId` at payout creation time in
      `payoutProcessor.ts` — store snapshot so mid-batch account updates don't
      affect current payout

**Checkpoint**: User Story 1 complete — automated weekly batch with exactly-once
guarantee and atomic ledger debits is functional

---

## Phase 4: User Story 2 — Failed Payout Retry (Priority: P1)

**Goal**: Failed payouts can be retried within the same batch week; successful
retry transitions to `succeeded`; failed retry updates failure reason; no
double-debit.

**Independent Test**: `POST /api/internal/payouts/:payoutId/retry` on a `failed`
payout triggers a new bank transfer attempt; on success, `payout.status` =
`succeeded`; on failure, `payout.status` = `failed` with updated
`failureReason`; ledger entry count unchanged (no new debit added on retry).

- [X] T013 [US2] Implement `POST /api/internal/payouts/:payoutId/retry` in
      `api/src/routes/internal/payouts.ts` — validate payout is `failed` and
      belongs to current or prior batch week; call `BankTransferService` only
      (no new ledger debit); update status to `succeeded` or `failed` with
      reason
- [X] T014 [US2] Validate no double-debit on retry in `payoutProcessor.ts` —
      retry path MUST NOT create new ledger entries; only the initial
      `pending → processing` transition inserts debit entries
- [X] T015 [US2] Notify merchant of retry outcome via `@hakwa/notifications` —
      success notification "Your payout of FJD [amount] succeeded" or failure
      notification with failure reason

**Checkpoint**: User Story 2 complete — failed payout retry with no double-debit
is functional

---

## Phase 5: User Story 3 — Merchant Views Payout History (Priority: P2)

**Goal**: Merchant sees paginated list of completed payouts with week, amounts,
and status; tapping a failed payout shows the failure reason.

**Independent Test**: `GET /api/merchant/payouts` returns payout list sorted
newest-first with `weekPeriod`, `amount`, `serviceFee`, `netAmount`, `status`;
`GET /api/merchant/payouts/:payoutId` returns detail with `failureReason` for
failed payouts.

- [X] T016 [US3] Implement `GET /api/merchant/payouts` in
      `api/src/routes/merchantPayouts.ts` — return paginated payouts for
      requesting merchant, sorted newest-first, with computed `weekPeriod` label
      (e.g., "Mar 10 – Mar 16, 2026")
- [X] T017 [US3] Implement `GET /api/merchant/payouts/:payoutId` in
      `api/src/routes/merchantPayouts.ts` — return payout detail including
      `failureReason` and message "funds remain in your wallet balance" for
      `failed` status
- [X] T018 [P] [US3] Build `PayoutsScreen.tsx` in
      `apps/mobile/merchant/src/screens/PayoutsScreen.tsx` — FlatList of payouts
      with week period, net amount, status badge; "Load more" pagination
- [X] T019 [P] [US3] Build `PayoutDetailScreen.tsx` in
      `apps/mobile/merchant/src/screens/PayoutDetailScreen.tsx` — full payout
      detail with gross amount, service fee, net amount, failure reason (if
      failed), "Funds remain in your wallet" note

**Checkpoint**: User Story 3 complete — merchant payout history and detail are
functional

---

## Phase 6: User Story 4 — Next Payout Date on Earnings Screen (Priority: P3)

**Goal**: Merchant earnings screen shows "Next payout: [date]" without
navigating to settings.

**Independent Test**: `GET /api/merchant/wallet/balance` response includes
`nextPayoutAt` field from `nextPayoutDate()` utility; `EarningsScreen` renders
the date.

- [X] T020 [US4] Update `GET /api/merchant/wallet/balance` in
      `api/src/routes/merchantWallet.ts` — include `nextPayoutAt` field computed
      from `nextPayoutDate(now)`
- [X] T021 [US4] Add "Next payout" date row to `EarningsScreen.tsx` in
      `apps/mobile/merchant/src/screens/EarningsScreen.tsx` (if exists) or
      `WalletScreen.tsx` — display `nextPayoutAt` in human-readable format

**Checkpoint**: User Story 4 complete — next payout date is visible on earnings
screen

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Idempotency test: trigger batch creation twice for same
      `weekStart` and confirm only one `payoutBatch` row exists in database
- [ ] T023 [P] Validate merchant cannot view other merchants' payouts —
      `GET /api/merchant/payouts` must filter by
      `merchantId = session.merchantId`
- [ ] T024 [P] Validate batch processes zero-balance merchants correctly — no
      payout row created, no ledger entries, batch still reaches `completed`

---

## Dependencies

```
Phase 1 (Enums + Stub) → Phase 2 (Worker + Cron) → Phase 3–6 (User Stories)
US1 (batch creation) → US2 (retry) [needs failed payouts to retry]
US3 (payout history) depends on US1 (needs completed payouts)
US4 (next payout date) independent after Phase 2
Spec 005 ledger infrastructure must be in place before payout debits can be written
```

## Parallel Execution Examples

- T006 + T007 can run in parallel (batch creation vs cron scheduling)
- T018 + T019 can run in parallel (different screen files)

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + Phase 3 (T001–T012) — automated batch with atomic
  ledger debits
- **MVP+**: Add Phase 4 (T013–T015) — failed payout retry
- **Full P2**: Add Phase 5 (T016–T019) — merchant payout history UI
- **Complete**: Add Phase 6 + Polish (T020–T024)

**Total tasks**: 24 | **Parallelizable**: 8 | **User stories**: 4
