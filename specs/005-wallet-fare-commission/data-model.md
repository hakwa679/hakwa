# Data Model: Wallet, Fare & Commission

## Existing Schema (from `pkg/db/schema/wallet.ts`)

The wallet tables are already defined. This spec documents the canonical usage
and required enum values. No new tables are needed.

### `wallet` table

| Column       | Type               | Description                           |
| ------------ | ------------------ | ------------------------------------- |
| `id`         | `uuid` PK          | Wallet identity                       |
| `holderId`   | `uuid`             | References `user.id` or `merchant.id` |
| `holderType` | `holder_type` enum | `individual \| merchant \| hakwa`     |
| `createdAt`  | `timestamp`        | Creation time                         |

> Balance =
> `SELECT SUM(amount) FROM ledger_entry WHERE holder_id = wallet.holder_id`

The Hakwa platform wallet uses `holderId = 'hakwa'` (constant) and
`holderType = 'hakwa'`.

---

### `ledgerEntry` table

| Column        | Type               | Description                              |
| ------------- | ------------------ | ---------------------------------------- |
| `id`          | `uuid` PK          | Entry identity                           |
| `holderId`    | `uuid`             | Wallet holder                            |
| `holderType`  | `holder_type` enum | `individual \| merchant \| hakwa`        |
| `entryType`   | `entry_type` enum  | See below                                |
| `amount`      | `numeric(10,2)`    | Positive = credit, negative = debit      |
| `tripId`      | `uuid` nullable    | Link to `trip.id` (for trip entries)     |
| `payoutId`    | `uuid` nullable    | Link to `payout.id` (for payout entries) |
| `description` | `text`             | Human-readable label                     |
| `createdAt`   | `timestamp`        | Insertion time                           |

**`entry_type` enum values** (extend schema if not already present):

| Value                      | Description                               |
| -------------------------- | ----------------------------------------- |
| `trip_credit`              | 93% merchant earnings from completed trip |
| `commission`               | 7% platform share from completed trip     |
| `payout_debit`             | Amount swept in weekly payout             |
| `payout_service_fee_debit` | FJD 1.00 service fee per payout           |

---

## Fare Constants (`@hakwa/core`)

```typescript
// pkg/core/src/fareConstants.ts
export const BASE_FARE_FJD = 2.5;
export const RATE_PER_KM_FJD = 0.85;
export const PLATFORM_COMMISSION_RATE = 0.07; // 7%
export const MERCHANT_SHARE_RATE = 0.93; // 93%
export const PAYOUT_SERVICE_FEE_FJD = 1.0;

export function calculateFare(distanceKm: number): number {
  if (distanceKm <= 0) throw new Error("Distance must be positive");
  return +(BASE_FARE_FJD + RATE_PER_KM_FJD * distanceKm).toFixed(2);
}

export function splitFare(fare: number): {
  platform: number;
  merchant: number;
} {
  const platform = +(fare * PLATFORM_COMMISSION_RATE).toFixed(2);
  const merchant = +(fare - platform).toFixed(2);
  return { platform, merchant };
}
```

---

## Fare Estimate vs Actual Fare

|               | Fare Estimate (booking creation)       | Actual Fare (trip completion)         |
| ------------- | -------------------------------------- | ------------------------------------- |
| **Source**    | OSRM route distance (via `@hakwa/map`) | `actualDistanceKm` reported by driver |
| **Formula**   | `calculateFare(estimatedDistanceKm)`   | `calculateFare(actualDistanceKm)`     |
| **Stored in** | `trip.estimatedFare`                   | `trip.actualFare`                     |
| **Used for**  | Display to passenger before confirming | Ledger entries on completion          |

---

## Wallet Balance Query

```sql
-- Merchant wallet balance
SELECT COALESCE(SUM(amount), 0) AS balance
FROM ledger_entry
WHERE holder_id = $merchantId
  AND holder_type = 'merchant';

-- Platform wallet balance
SELECT COALESCE(SUM(amount), 0) AS balance
FROM ledger_entry
WHERE holder_type = 'hakwa';
```

---

## Trip Receipt Data

Receipt is generated from the `trip` record at completion:

| Field                 | Source                      |
| --------------------- | --------------------------- |
| Pickup address        | `trip.pickupAddress`        |
| Destination           | `trip.dropoffAddress`       |
| Distance              | `trip.actualDistanceKm` km  |
| Base fare             | `BASE_FARE_FJD`             |
| Rate per km           | `RATE_PER_KM_FJD`           |
| Total charged         | `trip.actualFare`           |
| Platform fee (hidden) | 7% (not shown to passenger) |
