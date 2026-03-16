# Feature Specification: Weekly Merchant Payouts

**Feature Branch**: `006-weekly-merchant-payouts`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: Weekly automated payout batch job that sweeps merchant wallet
balances to registered bank accounts, with a flat service fee, batch lifecycle
management, failed payout retries, and merchant payout history

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Automated Weekly Payout Batch Runs (Priority: P1)

At the end of each week, the platform automatically creates a payout batch
covering that week. For every merchant with a non-zero wallet balance, the
system creates a payout record that sweeps their full balance to their
registered bank account, deducting a flat FJD 1.00 service fee. The batch
progresses through `scheduled → processing → completed` states.

**Why this priority**: Payouts are a contractual obligation to merchants. A
missed or incorrect payout directly damages merchant trust.

**Independent Test**: A scheduled job can create a payout batch for a given
week, process individual payout records for merchants with non-zero balances,
and reach `completed` state — independently of the merchant-facing UI.

**Acceptance Scenarios**:

1. **Given** the weekly payout schedule fires, **When** a batch is created,
   **Then** exactly one `payoutBatch` record is created for that `weekStart` —
   duplicate batch creation for the same week MUST be treated as a no-op.
2. **Given** a `payoutBatch` in `scheduled` state, **When** the batch starts
   processing, **Then** one `payout` record is created for each merchant with a
   wallet balance > FJD 1.00 (minimum after service fee), setting
   `amount = wallet balance`, `serviceFee = 1.00`, `netAmount = amount - 1.00`.
3. **Given** a `payout` record is created, **When** the debit is applied to the
   merchant wallet, **Then** a `ledgerEntry` of type `payout_debit` is written
   for the full `amount` in the same transaction.
4. **Given** all individual payouts processed (success or failure), **When** the
   batch finalises, **Then** the batch status transitions to `completed`.

---

### User Story 2 - Failed Payout Retry Within the Same Week (Priority: P1)

A payout to a merchant fails (e.g., invalid bank account). The individual payout
status is marked `failed` with the reason. Within the same batch week, the
system retries the payout. If the retry succeeds, the merchant receives their
funds; if it fails again, the failure is noted and the merchant is notified.

**Why this priority**: Failed payouts that are not retried leave merchants
without funds they have earned. Retry within the week prevents a 7-day wait
compounding to 14 days.

**Independent Test**: Marking a payout as `failed` and triggering a retry
results in a second bank transfer attempt. On success, the payout transitions to
`succeeded` and the merchant wallet is not double-debited.

**Acceptance Scenarios**:

1. **Given** a `payout` record in `failed` state within the current batch week,
   **When** the retry job runs, **Then** a new transfer attempt is made using
   the same `amount` and `netAmount`.
2. **Given** a successful retry, **When** the transfer confirms, **Then** the
   payout status transitions to `succeeded` and the merchant receives a
   notification.
3. **Given** a failed retry, **When** the transfer fails again, **Then** the
   payout status remains `failed`, the failure reason is updated, and the
   merchant is notified.
4. **Given** a new payout batch is created for the following week, **When** a
   payout is still in `failed` state from the prior week, **Then** the prior
   week's failed payout is NOT automatically re-attempted in the new batch — a
   new payout record for the new week's balance is created instead.

---

### User Story 3 - Merchant Views Payout History (Priority: P2)

A merchant opens the Merchant App and navigates to the Payouts section. They see
a list of weekly payouts showing the week period, gross amount, service fee
deducted, net amount transferred, status, and the date the funds were sent.

**Why this priority**: Merchants need to reconcile their expected bank deposits
against their Hakwa earnings. Visibility reduces "Where is my money?" support
queries.

**Independent Test**: A merchant with at least one completed payout can navigate
to Payouts and see the payout with correct amounts and status.

**Acceptance Scenarios**:

1. **Given** a merchant with processed payouts, **When** they open the Payouts
   tab, **Then** payouts are listed in reverse-chronological order showing: week
   period (e.g., "Mar 10 – Mar 16, 2026"), gross amount, service fee, net
   amount, and status (`succeeded` | `failed` | `processing`).
2. **Given** a payout with `failed` status in the list, **When** the merchant
   taps it, **Then** a detail screen shows the failure reason and confirms that
   the funds remain in their wallet balance.

---

### User Story 4 - Payout Timeline Visible on Earnings Screen (Priority: P3)

A merchant on the Earnings screen can see when the next payout will be processed
based on the weekly schedule. This is visible without navigating to a separate
settings or FAQ page.

**Why this priority**: Transparency about payment timing is a constitution
principle. Merchants should never be surprised about when they will be paid.

**Independent Test**: The Earnings screen shows a "Next payout: [date]"
indicator that reflects the actual upcoming batch schedule.

**Acceptance Scenarios**:

1. **Given** an authenticated merchant on the Earnings screen, **When** they
   view the screen, **Then** a "Next payout" line shows the date of the next
   scheduled batch.
2. **Given** the current week's batch is already in `processing` or `completed`,
   **When** the merchant views the Earnings screen, **Then** "Next payout" shows
   the following week's date, not the current week.

---

### Edge Cases

- What if a merchant's wallet balance is exactly FJD 1.00 (equal to the service
  fee)? The net amount would be zero. System MUST skip this merchant — no payout
  record is created and the balance carries forward to the next week.
- What if a merchant's wallet balance is less than FJD 1.00? Same as above —
  skip and carry forward.
- What if the scheduler fires twice in the same week (e.g., a clock drift or
  restart)? The unique constraint on `payoutBatch(weekStart)` enforces
  exactly-once batch creation. The duplicate fire is treated as a no-op.
- What if the bank transfer API is unavailable when the batch runs? All payouts
  in the batch are marked `failed` with a system error reason and queued for
  retry.
- What if a merchant updates their bank account details on the same day a payout
  batch runs? The payout uses the bank account on record at the moment the
  `payout` record is created. The updated details take effect for the next
  week's batch.
- What if the platform has no merchant with a non-zero balance this week? A
  batch record is still created (for auditing purposes) but with zero individual
  payout records; it completes immediately.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST run a scheduled job once per week that creates exactly
  one `payoutBatch` record per week (identified by `weekStart` and `weekEnd`).
  The uniqueness of `weekStart` MUST be enforced at the database level.
- **FR-002**: Duplicate batch creation for the same `weekStart` MUST be handled
  as a no-op — the scheduler MUST catch the unique-violation and log it without
  raising an unhandled error.
- **FR-003**: The batch job MUST create one `payout` record for each merchant
  whose wallet balance exceeds FJD 1.00 (the service fee). Merchants with
  balances ≤ FJD 1.00 are skipped; their balance carries forward.
- **FR-004**: Each `payout` record MUST store: `amount` (full wallet balance at
  time of payout), `serviceFee` (FJD 1.00), `netAmount` (amount − serviceFee),
  `status` (`scheduled` | `processing` | `succeeded` | `failed`), and the target
  bank account details snapshotted at creation time.
- **FR-005**: The service fee (FJD 1.00) MUST be stored as a named constant, not
  a magic number.
- **FR-006**: When a payout debit is applied to a merchant wallet, a
  `ledgerEntry` of type `payout_debit` for the full `amount` MUST be written in
  the same database transaction as the payout status update.
- **FR-007**: Failed individual payouts (status `failed`) MUST be retried within
  the same batch week. Retries MUST NOT double-debit the merchant wallet.
- **FR-008**: Payout retry attempts MUST be logged with the target bank account,
  attempt timestamp, HTTP/API status, and error reason for each attempt.
- **FR-009**: A `payout` record that fails and is not recovered within its batch
  week MUST NOT be automatically retried in the following week's batch. The
  following week creates a fresh payout for that week's balance.
- **FR-010**: Merchants MUST be notified via in-app notification and email when
  a payout succeeds or fails.
- **FR-011**: Merchants MUST be able to view their full payout history: each
  payout with week period, gross, fee, net, status, and dispatch date.
- **FR-012**: The next scheduled payout date MUST be surfaced on the merchant
  Earnings screen without requiring navigation to settings.
- **FR-013**: The platform (Hakwa) wallet balance is NOT subject to the weekly
  sweep and MUST NOT be included in payout batch processing.

### Key Entities

- **PayoutBatch**: One record per week. Holds `weekStart`, `weekEnd`, `status`
  (`scheduled` | `processing` | `completed` | `failed`), total merchant count,
  and total amount disbursed.
- **Payout**: One record per merchant per week (if balance > fee threshold).
  Holds `batchId`, `merchantId`, `amount`, `serviceFee`, `netAmount`, `status`,
  snapshotted bank account details, and failure reason.
- **LedgerEntry** (shared with Wallet spec): The debit entry created when a
  payout is applied to the merchant wallet.

### Assumptions

- The payout cadence (weekly) and service fee ($1.00) are named constants. They
  can be changed with a code update but do not require a database migration.
- The bank transfer itself (actual funds movement to the merchant's bank) is
  performed via an external banking/payment API. The API integration is out of
  scope for this spec. The payout record status tracks the API response.
- Payout batches run at a fixed time on a fixed day each week (e.g., every
  Monday at 02:00 Fiji time). The exact schedule is a named constant.
- Merchants with `under_review` or `rejected` status are excluded from payout
  processing — only `active` merchants receive payouts.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero duplicate `payoutBatch` records created for the same week
  across all scheduler redundancy tests.
- **SC-002**: 100% of merchants with wallet balance > FJD 1.00 at batch time
  have a `payout` record created in the corresponding batch — zero missed
  payouts.
- **SC-003**: Every payout debit has a corresponding `ledgerEntry` record in the
  same transaction — zero orphaned payout debits in data integrity tests.
- **SC-004**: Failed payouts are retried within the same batch week, with zero
  double-debits on the merchant wallet confirmed by automated tests.
- **SC-005**: Merchants receive a payout success/failure notification within 5
  minutes of the transfer status being updated.
