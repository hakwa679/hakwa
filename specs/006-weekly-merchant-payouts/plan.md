# Implementation Plan: Weekly Merchant Payouts

**Branch**: `006-weekly-merchant-payouts` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from
`/specs/006-weekly-merchant-payouts/spec.md`

---

## Summary

Automated weekly payout batch runs every Monday at 00:00 Fiji time (UTC+12). The
`payoutBatch` table has a `UNIQUE (weekStart)` constraint ensuring exactly-once
creation. For each merchant with wallet balance > FJD 1.00, a `payout` row is
created and the gross balance is debited from the ledger atomically. The bank
transfer is attempted via the `BankTransferService` interface (stubbed for Phase
1). Failed payouts are retried within the same batch week. Merchants view payout
history via `/api/merchant/payouts`. The next payout date is surfaced on the
earnings screen.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `@hakwa/db`, `@hakwa/workers`, `@hakwa/core`,
`@hakwa/notifications`, `@hakwa/errors`  
**Storage**: PostgreSQL (`payoutBatch`, `payout`, `ledgerEntry`)  
**Testing**: Vitest + Drizzle in-memory; mock `BankTransferService`; idempotency
test for duplicate weekStart  
**Target Platform**: Node.js API (cron job); React Native Expo (Merchant App);
React + Vite (Merchant Portal)  
**Performance Goals**: Full batch processing (100 merchants) < 2 min; individual
payout < 5 s  
**Constraints**: Exactly-one batch per week; ledger debit atomic with payout
status transition; minimum transfer threshold FJD 1.00  
**Scale/Scope**: Phase 1 — hundreds of merchants; processed sequentially (no
parallel bank calls)

---

## Constitution Check

- [x] **I. Package-First** — Payout processor in `@hakwa/workers`; bank transfer
      interface in `@hakwa/core`; `nextPayoutDate()` utility in `@hakwa/core`.
- [x] **II. Type Safety** — `payoutBatchStatusEnum`, `payoutStatusEnum` pgEnums;
      `Payout = typeof payout.$inferSelect`; `BankTransferService` interface.
- [x] **III. Security** — Merchant can only view their own payouts; internal
      batch endpoints protected by internal auth (not public-facing); bank
      account ID is snapshotted at creation to prevent field-tampering
      mid-batch.
- [x] **IV. Schema Contract** — `payoutBatchStatusEnum`, `payoutStatusEnum`
      confirmed in `pkg/db/schema/wallet.ts`; `db-push` before worker code.
- [x] **VIII. Concurrency Safety** — `UNIQUE (weekStart)` +
      `onConflictDoNothing()` prevents duplicate batches; payout debit written
      atomically with status transition using Drizzle transaction.
- [x] **IX. Webhook-First** — Post-payout notification dispatched via
      `@hakwa/notifications` (async); no synchronous email blocking the worker.
- [x] **X. Worker-Thread Concurrency** — Batch processor runs in
      `@hakwa/workers` pool; no blocking work on API event loop.
- [x] **XI. Unified Error Handling** — Worker errors caught per-payout;
      individual failure does not abort batch; `ConflictError` from
      `@hakwa/errors` for invalid state transitions.
- [x] **XII. Frontend Architecture** — Merchant app uses `@hakwa/api-client`
      hook `usePayoutHistory`; next payout date from API response.
- [x] **XIII. Shared-First Reuse** — `PAYOUT_SERVICE_FEE_FJD` constant from
      `@hakwa/core`; `nextPayoutDate()` shared between API response and display.
- [x] **XIV. Notification System** — `@hakwa/notifications` push on payout
      succeeded/failed.
- [x] **XVI. UX Principles** — "Next payout: [date]" visible on Earnings screen
      without settings navigation; failed payout detail explains "funds remain
      in wallet".

---

## Project Structure

### Documentation (this feature)

```text
specs/006-weekly-merchant-payouts/
├── plan.md          ← this file
├── research.md      ← idempotency, worker processing, state machines, threshold, debit timing
├── data-model.md    ← payoutBatch/payout schema confirmation, state machines, ledger entries
├── quickstart.md    ← enum confirm → bank stub → payout worker → cron → verify
└── contracts/
    └── rest-api.md  ← merchant payout history, detail, internal batch endpoints
```

### Source Code

```text
pkg/
├── core/src/
│   ├── bankTransfer.ts          ← BankTransferService interface + stub
│   └── fareConstants.ts         ← PAYOUT_SERVICE_FEE_FJD (already defined)
└── workers/src/workers/
    └── payoutProcessor.ts       ← processBatch(batchId): iterate merchants, debit ledger, call bank

api/
└── src/
    ├── jobs/
    │   └── weeklyPayout.ts      ← scheduleWeeklyPayout(weekStart) + cron registration
    └── routes/
        ├── merchantPayouts.ts   ← GET /payouts, GET /payouts/:id
        └── internal/
            └── payouts.ts       ← POST /batches, POST /batches/:id/process, POST /:id/retry
```
