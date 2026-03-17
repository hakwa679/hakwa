# Research: Weekly Merchant Payouts

## Decision: Batch Idempotency — Unique Constraint on weekStart

**Decision**: The `payoutBatch` table has a `UNIQUE (weekStart)` constraint. The
cron job uses an INSERT with `ON CONFLICT DO NOTHING` (Drizzle
`onConflictDoNothing()`). If the scheduler fires twice in the same week the
second call produces zero rows, and the job exits cleanly.

**Rationale**: Exactly-once batch creation without application-level locking.
The DB constraint is the authority; application does not need a distributed
lock.

**Alternatives considered**:

- Redis distributed lock with TTL: Works but adds failure modes (lock never
  released, clock drift). The DB constraint eliminates the need.
- `SELECT` then `INSERT` with app-level check: TOCTOU race; unique constraint is
  safer.

---

## Decision: Worker-Thread Based Batch Processing

**Decision**: The batch processor runs inside `@hakwa/workers` as a long-running
task. The main API triggers it by posting to the `payouts` worker queue. The
worker processes each merchant payout sequentially (not in parallel) to avoid
overwhelming the bank transfer API.

**Rationale**: CPU-bound ledger aggregation is safely moved off the event loop.
Sequential processing caps concurrent bank API calls. The `PayoutBatch` state
machine (`scheduled → processing → completed`) is driven by the worker.

**Alternatives considered**:

- Parallel merchant processing: Could theoretically be faster but risks bank API
  rate limits; not needed for Phase 1 scale.
- Out-of-process cron (separate Docker container): Over-engineered for Phase 1;
  the worker pool is sufficient.

---

## Decision: Payout State Machine

**Decision**:

```
payoutBatch:  scheduled → processing → completed
payout:       pending → processing → succeeded | failed
```

A `failed` payout is retried within the same batch week by a separate retry job.
The retry creates a new transfer attempt and updates the existing `payout` row
(`status = succeeded` or updates `failureReason`). No new `payout` row is
created on retry — the same row is updated.

**Rationale**: Re-using the same payout row avoids double-debit risk. The ledger
debit was already written when the payout row was created; retrying the bank
transfer does not write another debit.

**Alternatives considered**:

- New payout row on retry: Risk of double ledger debit; requires compensating
  transaction to reverse original debit first — complex.

---

## Decision: Minimum Payout Threshold

**Decision**: Skip merchants with `walletBalance ≤ PAYOUT_SERVICE_FEE_FJD`
(i.e., balance ≤ 1.00 FJD). No payout row is created; balance carries forward.
The threshold is enforced in the worker, not in the DB constraint.

**Rationale**: A zero-net-amount bank transfer provides no benefit to the
merchant and wastes a bank API call. The FJD 1.00 service fee makes any balance
≤ 1.00 non-payable.

---

## Decision: Ledger Debit Timing

**Decision**: The `payout_debit` ledger entry is written in the same Drizzle
transaction that transitions the `payout` row to `processing`. This freezes the
merchant balance at that point. If the bank transfer later fails, no
compensating ledger credit is written automatically — the balance remains frozen
until a manual admin credit or the payout is retried and succeeds.

**Rationale**: Writing the debit at processing-time prevents a merchant from
spending the funds between payout creation and bank transfer confirmation. On
Phase 1 volumes, manual resolution of stuck payouts is acceptable; automated
reversal is a Phase 2 enhancement.

**Alternatives considered**:

- Write debit only on success: Merchant can continue accumulating balance while
  payout is in-flight; risk of over-paying.
- Write debit at batch creation: Too early; batch may not process for hours.

---

## Decision: Bank Transfer Integration

**Decision**: Phase 1 uses a stub `BankTransferService` interface. The actual
provider (ANZ Pacific, BSP, or Fiji bank API) is wired in at deployment time via
env var `BANK_TRANSFER_PROVIDER`. The stub always returns `succeeded` in
development.

**Rationale**: Decouples payout logic from bank provider selection. Phase 1
scope does not include a specific bank API; the stub lets the entire payout flow
be tested end-to-end without a live bank.

---

## Decision: Payout Schedule

**Decision**: Payouts run every Monday at 00:00 Fiji time (UTC+12), covering the
previous Mon–Sun week. `weekStart = previousMonday` in ISO date format.

**Rationale**: Aligns with standard weekly pay periods in Fiji. The `weekStart`
uniqueness constraint is based on ISO date string (e.g., `"2026-03-10"`).
