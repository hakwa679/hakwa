# Implementation Plan: Wallet, Fare & Commission

**Branch**: `005-wallet-fare-commission` | **Date**: 2026-03-17 | **Spec**:
[spec.md](spec.md)  
**Input**: Feature specification from
`/specs/005-wallet-fare-commission/spec.md`

---

## Summary

Formalises the fare formula, commission split, and wallet ledger system. Fare
constants (`BASE_FARE_FJD = 2.50`, `RATE_PER_KM_FJD = 0.85`,
`PLATFORM_COMMISSION_RATE = 0.07`) live in `@hakwa/core` and are shared by fare
estimation (spec 003) and trip completion (spec 004). Wallet balance is computed
from the ledger on-demand — no mutable balance column. The completion
transaction inserts both ledger entries atomically. Merchants see a real-time
balance update via Redis pub/sub. Passengers can retrieve a receipt and request
an email copy (async via Redis Stream).

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: `@hakwa/db`, `@hakwa/redis`, `@hakwa/core`,
`@hakwa/email`, `@hakwa/errors`  
**Storage**: PostgreSQL (`ledgerEntry`, `wallet`); Redis (balance pub/sub, email
outbox Stream)  
**Testing**: Vitest unit tests for `calculateFare`/`splitFare`; integration
tests for ledger insertion and balance query  
**Target Platform**: Node.js API; React Native Expo (Merchant App, Rider App);
React + Vite (Merchant Portal, Rider Portal)  
**Performance Goals**: Balance query < 100 ms; fare calculation < 1 ms (pure
function); email queue < 50 ms  
**Constraints**: No mutable balance column; ledger rows are immutable; fare
split must be atomic with trip completion  
**Scale/Scope**: Phase 1 — typical merchants accumulate hundreds of ledger rows;
partial-index on `holderId` ensures query performance

---

## Constitution Check

- [x] **I. Package-First** — Fare constants and utility functions in
      `pkg/core/`; wallet service in `api/src/services/walletService.ts`.
- [x] **II. Type Safety** — `entryTypeEnum` pgEnum;
      `LedgerEntry = typeof ledgerEntry.$inferSelect`; `calculateFare` validates
      input.
- [x] **III. Security** — Receipt endpoint verifies
      `trip.passengerId === req.user.id`; wallet endpoint verifies merchant
      ownership.
- [x] **IV. Schema Contract** — `entryTypeEnum` values defined in
      `pkg/db/schema/wallet.ts`; `db-push` before API code.
- [x] **V. Real-Time** — Post-completion ledger insert triggers Redis pub/sub
      `wallet:updated:{merchantId}`; WebSocket relays to merchant session; no
      polling.
- [x] **VI. Redis Package** — All Redis pub/sub and `xadd` calls via
      `@hakwa/redis` wrapper.
- [x] **VIII. Concurrency Safety** — Ledger is append-only; no `UPDATE` on
      ledger rows; balance derived from immutable history — no race condition
      possible.
- [x] **IX. Webhook-First** — Email receipt is async via Redis Stream
      `emails:outbox`; consumer in `@hakwa/email` processes independently.
- [x] **XI. Unified Error Handling** — `ForbiddenError`, `NotFoundError`,
      `ConflictError` from `@hakwa/errors`.
- [x] **XII. Frontend Architecture** — Merchant portal uses TanStack Query
      `useWalletBalance`, `useWalletLedger` hooks; real-time refresh via
      WebSocket event.
- [x] **XIII. Shared-First Reuse** — `calculateFare` / `splitFare` shared
      between fare-estimate worker and trip completion service.
- [x] **XVI. UX Principles** — Real-time balance update on merchant wallet
      screen; receipt available immediately after trip completes.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-wallet-fare-commission/
├── plan.md          ← this file
├── research.md      ← balance strategy, fare constants, ledger entry types, race condition analysis
├── data-model.md    ← wallet + ledgerEntry schema, fare constants, balance query
├── quickstart.md    ← constants setup → enum confirm → wallet service → receipt route → verify
└── contracts/
    └── rest-api.md  ← fare-estimate context, merchant wallet, receipt, email, WebSocket
```

### Source Code

```text
pkg/
├── core/src/fareConstants.ts    ← calculateFare, splitFare, constants
└── db/schema/wallet.ts          ← entryTypeEnum values confirmed (trip_credit, commission, payout_debit, payout_service_fee_debit)

api/
└── src/
    ├── services/
    │   └── walletService.ts     ← getMerchantBalance, getLedgerPage, notifyBalanceUpdated
    └── routes/
        ├── trips.ts             ← GET /:tripId/receipt, POST /:tripId/receipt/email
        └── merchantWallet.ts    ← GET /balance, GET /ledger
```
