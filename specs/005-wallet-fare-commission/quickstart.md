# Quickstart: Wallet, Fare & Commission

## Prerequisites

- Specs 003 & 004 schema changes applied (`db-push` already run).
- `ledgerEntry` table exists in `pkg/db/schema/wallet.ts`.
- `@hakwa/core` package exists at `pkg/core/`.

---

## Step 1: Add Fare Constants to `@hakwa/core`

```typescript
// pkg/core/src/fareConstants.ts
export const BASE_FARE_FJD = 2.5;
export const RATE_PER_KM_FJD = 0.85;
export const PLATFORM_COMMISSION_RATE = 0.07;
export const MERCHANT_SHARE_RATE = 0.93;
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

Export from `pkg/core/index.ts`:

```typescript
export * from "./src/fareConstants";
```

---

## Step 2: Confirm `entryType` Enum in Schema

```typescript
// pkg/db/schema/wallet.ts — add values if missing
export const entryTypeEnum = pgEnum("entry_type", [
  "trip_credit",
  "commission",
  "payout_debit",
  "payout_service_fee_debit",
]);
```

Apply if changed:

```bash
cd pkg/db && npm run db-push
```

---

## Step 3: Wallet Service

```typescript
// api/src/services/walletService.ts
import { db } from "@hakwa/db";
import { ledgerEntry } from "@hakwa/db/schema";
import { eq, sum } from "drizzle-orm";
import { redis } from "@hakwa/redis";

export async function getMerchantBalance(merchantId: string): Promise<number> {
  const result = await db
    .select({ balance: sum(ledgerEntry.amount) })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.holderId, merchantId));
  return Number(result[0]?.balance ?? 0);
}

export async function getLedgerPage(
  holderId: string,
  cursor: string | undefined,
  limit: number,
) {
  // cursor-based: id > cursor, ordered by id DESC, limited
  const rows = await db.query.ledgerEntry.findMany({
    where: cursor
      ? (entry, { and, eq, gt }) =>
          and(eq(entry.holderId, holderId), gt(entry.id, cursor))
      : (entry, { eq }) => eq(entry.holderId, holderId),
    orderBy: (entry, { desc }) => [desc(entry.createdAt)],
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  return {
    items: rows.slice(0, limit),
    nextCursor: hasMore ? rows[limit - 1].id : null,
  };
}

export async function notifyBalanceUpdated(
  merchantId: string,
  delta: number,
  entryType: string,
  tripId: string,
) {
  const balance = await getMerchantBalance(merchantId);
  await redis.publish(
    `wallet:updated:${merchantId}`,
    JSON.stringify({
      balance: balance.toFixed(2),
      delta: delta.toFixed(2),
      entryType,
      tripId,
    }),
  );
}
```

---

## Step 4: Receipt Route

```typescript
// api/src/routes/trips.ts (add to existing trip routes)
router.get("/:tripId/receipt", requireAuth, async (req, res) => {
  const trip = await db.query.trip.findFirst({
    where: (t, { eq }) => eq(t.id, req.params.tripId),
  });
  if (!trip) throw new NotFoundError("Trip not found");
  if (trip.passengerId !== req.user.id) throw new ForbiddenError();
  if (trip.status !== "completed")
    throw new ConflictError("Trip not completed");

  res.json({
    tripId: trip.id,
    pickupAddress: trip.pickupAddress,
    dropoffAddress: trip.dropoffAddress,
    actualDistanceKm: trip.actualDistanceKm,
    baseFare: BASE_FARE_FJD.toFixed(2),
    ratePerKm: RATE_PER_KM_FJD.toFixed(2),
    totalFare: trip.actualFare,
    currency: "FJD",
    completedAt: trip.completedAt,
  });
});

router.post("/:tripId/receipt/email", requireAuth, async (req, res) => {
  // publish to Redis Stream for @hakwa/email consumer
  await redis.xadd("emails:outbox", "*", {
    type: "trip_receipt",
    tripId: req.params.tripId,
    userId: req.user.id,
  });
  res.status(202).json({ queued: true });
});
```

---

## Step 5: Verify

```bash
# 1. Confirm fare constants
node -e "const { calculateFare, splitFare } = require('@hakwa/core'); console.log(calculateFare(7.2), splitFare(calculateFare(7.2)))"
# → 8.62 { platform: 0.6, merchant: 8.02 }   (note: rounding)

# 2. Complete a trip and check ledger
PATCH /api/driver/trips/:tripId/complete { "actualDistanceKm": 7.2 }
GET  /api/merchant/wallet/balance
# → { balance: "8.02", ... }

GET /api/merchant/wallet/ledger
# → items[0].entryType = "trip_credit", amount = "8.02"

# 3. Get receipt
GET /api/trips/:tripId/receipt
# → totalFare = "8.62"

# 4. Email receipt
POST /api/trips/:tripId/receipt/email
# → 202 { queued: true }
```
