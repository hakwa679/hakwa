# Data Model: Weekly Merchant Payouts

## Existing Schema (from `pkg/db/schema/wallet.ts`)

The payout tables are already defined. This spec documents the canonical state
machine, required enum values, and query patterns. No new tables are needed.

---

### `payoutBatch` table

| Column          | Type                       | Description                                        |
| --------------- | -------------------------- | -------------------------------------------------- |
| `id`            | `uuid` PK                  | Batch identity                                     |
| `weekStart`     | `date`                     | Monday ISO date of covered week (UNIQUE)           |
| `status`        | `payout_batch_status` enum | `scheduled \| processing \| completed`             |
| `merchantCount` | `integer`                  | Number of payouts in batch (updated at completion) |
| `totalAmount`   | `numeric(12,2)`            | Sum of all payout gross amounts                    |
| `createdAt`     | `timestamp`                | When batch was created                             |
| `completedAt`   | `timestamp` nullable       | When batch reached `completed`                     |

**Unique constraint**: `UNIQUE (weekStart)` — enforces exactly-once batch per
week.

---

### `payout` table

| Column          | Type                         | Description                                          |
| --------------- | ---------------------------- | ---------------------------------------------------- |
| `id`            | `uuid` PK                    | Payout identity                                      |
| `batchId`       | `uuid` FK → `payoutBatch.id` | Parent batch                                         |
| `merchantId`    | `uuid` FK → `merchant.id`    | Receiving merchant                                   |
| `bankAccountId` | `uuid` FK → `bankAccount.id` | Snapshot of merchant's bank account at creation time |
| `amount`        | `numeric(10,2)`              | Gross wallet balance swept                           |
| `serviceFee`    | `numeric(10,2)`              | Flat `1.00` FJD                                      |
| `netAmount`     | `numeric(10,2)`              | `amount - serviceFee`                                |
| `status`        | `payout_status` enum         | `pending \| processing \| succeeded \| failed`       |
| `failureReason` | `text` nullable              | Error from bank API on failure                       |
| `processedAt`   | `timestamp` nullable         | When bank transfer was attempted                     |
| `completedAt`   | `timestamp` nullable         | When status reached `succeeded`                      |
| `createdAt`     | `timestamp`                  | When payout row was created                          |

---

## State Machines

### `payoutBatch.status`

```
scheduled → processing → completed
```

### `payout.status`

```
pending → processing → succeeded
                    ↘ failed → (retry updates same row) → succeeded | failed
```

---

## Minimum Payout Logic

```
IF merchantBalance <= PAYOUT_SERVICE_FEE_FJD (1.00)
  THEN skip — no payout row created, balance carries forward
```

---

## Ledger Entries Created Per Payout

When payout transitions `pending → processing`:

| Entry       | `holderId`   | `holderType` | `entryType`                | `amount`                                            |
| ----------- | ------------ | ------------ | -------------------------- | --------------------------------------------------- |
| Gross debit | `merchantId` | `merchant`   | `payout_debit`             | `-amount` (negative)                                |
| Service fee | `hakwa`      | `hakwa`      | `payout_service_fee_debit` | `-1.00` collected from merchant as platform revenue |

> Wait — clarification: the service fee is taken from the merchant payout, so it
> is a debit to the merchant. The Hakwa platform receives it. Model as:
>
> - Merchant debit: `-amount` (full balance sweep)
> - Hakwa credit: `+serviceFee` (platform keeps FJD 1.00)

The merchant net amount sent to bank `= amount - serviceFee`.

---

## Next Payout Date Query

```typescript
// Returns the next Monday at 00:00 Fiji time (UTC+12) after now
export function nextPayoutDate(): Date {
  const now = new Date();
  const fijiOffset = 12 * 60; // Fiji UTC+12
  const fijiNow = new Date(now.getTime() + fijiOffset * 60_000);
  const dayOfWeek = fijiNow.getUTCDay(); // 0=Sun, 1=Mon
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(fijiNow);
  nextMonday.setUTCDate(fijiNow.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return new Date(nextMonday.getTime() - fijiOffset * 60_000); // back to UTC
}
```
