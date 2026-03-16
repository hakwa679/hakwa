# Research: Wallet, Fare & Commission

## Decision: Wallet Balance Storage Strategy

**Decision**: Wallet balance is computed on-demand as
`SUM(amount) FROM ledgerEntry WHERE holderId = <id>`. No `balance` column is
maintained on the `wallet` table. Wallet row exists as an identity anchor; the
ledger is the source of truth.

**Rationale**: Event-sourced ledger is audit-proof; recomputing balance from
immutable ledger entries means the balance can never drift from the history.
With typical merchant ledger sizes (hundreds of rows) the aggregation is fast; a
partial index on `holderId` keeps queries sub-10 ms.

**Alternatives considered**:

- Materialised `balance` column with `SELECT FOR UPDATE` +
  `UPDATE wallet SET balance = balance + amount`: Requires row lock; balance can
  theoretically drift under bugs; extra write per transaction.
- Separate balance cache in Redis: Adds cache invalidation complexity; not
  needed at Phase 1 scale.

---

## Decision: Fare Split Transaction Boundary

**Decision**: The Drizzle transaction for trip completion (spec 004
tripService.ts) already writes ledger entries atomically. This spec formalises
the constants and confirms no separate "wallet credit" step is needed — the
ledger IS the credit.

**Constants** (in `@hakwa/core`):

- `PLATFORM_COMMISSION_RATE = 0.07` (7%)
- `MERCHANT_SHARE_RATE = 0.93` (93%)
- `BASE_FARE_FJD = 2.50`
- `RATE_PER_KM_FJD = 0.85`

**Rationale**: Centralising constants in `@hakwa/core` prevents drift between
fare estimate calculation (spec 003) and actual fare split calculation (spec
004/005).

---

## Decision: Ledger Entry Types

**Decision**: `entryType` enum values for `ledgerEntry`:

- `trip_credit` — 93% merchant share from completed trip
- `commission` — 7% platform share from completed trip
- `payout_debit` — amount swept in a weekly payout (spec 006)
- `payout_service_fee_debit` — FJD 1.00 service fee deducted from payout

**Rationale**: Named entry types allow the UI to show human-readable labels
("Trip earnings", "Payout", etc.) without client-side string manipulation.

**Alternatives considered**:

- Generic `credit` / `debit` values: Ambiguous; requires secondary metadata
  column to differentiate.

---

## Decision: Wallet Balance Race Condition

**Decision**: Wallet balance is read-only (computed by SUM) so there is no
write-then-read race on the balance field itself. The `ledgerEntry` insert is
the only WRITE, and inserts are always monotonically appending — no UPDATE on
existing ledger rows. Race condition risk is eliminated by design.

**Rationale**: Immutable append-only ledger with no UPDATE on entry rows
requires no row-level lock. The `SELECT FOR UPDATE` in the spec edge case
(mentioned in the spec) is not needed because we never do a read-modify-write on
a balance column.

**Alternatives considered**:

- `SELECT FOR UPDATE` on `wallet` row: Adds serialisation point; not warranted
  when balance is derived not stored.

---

## Decision: Real-Time Wallet Balance Update

**Decision**: After ledger entry is inserted (inside trip completion tx), the
`bookingService` publishes a `wallet:updated:{merchantId}` event to Redis
pub/sub. WebSocket server relays to any connected merchant portal sessions.
Merchant sees balance update without page refresh.

**Rationale**: Aligns with constitution principle V (real-time via Redis
pub/sub, no polling).

---

## Decision: Email Receipt

**Decision**: After trip is marked `completed`, a post-commit hook dispatches a
`trip.completed` event to a Redis Stream. The `@hakwa/email` consumer picks it
up and sends a receipt email via the configured SMTP provider. Receipt is
generated from a template including pickup, destination, distance, base fare,
and total.

**Rationale**: Async email via Redis Stream decouples the email send from the
trip completion HTTP response. Trip completes fast; email sends within 30 s.

**Alternatives considered**:

- Synchronous email send inside transaction: Slows trip completion; email
  failure could block the transaction.
