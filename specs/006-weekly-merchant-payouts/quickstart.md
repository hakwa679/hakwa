# Quickstart: Weekly Merchant Payouts

## Prerequisites

- Spec 005 schema changes applied (`db-push` already run).
- `payoutBatch`, `payout`, `ledgerEntry`, `wallet`, `bankAccount` tables exist.
- `@hakwa/workers`, `@hakwa/redis`, `@hakwa/notifications`, `@hakwa/errors`
  packages built.

---

## Step 1: Confirm Schema Enums

Verify `pkg/db/schema/wallet.ts` has the correct enum values:

```typescript
// pkg/db/schema/wallet.ts
export const payoutBatchStatusEnum = pgEnum("payout_batch_status", [
  "scheduled",
  "processing",
  "completed",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "processing",
  "succeeded",
  "failed",
]);
```

Apply if changed:

```bash
cd pkg/db && npm run db-push
```

---

## Step 2: Bank Transfer Stub

```typescript
// pkg/core/src/bankTransfer.ts
export interface BankTransferResult {
  success: boolean;
  reference?: string;
  failureReason?: string;
}

export interface BankTransferService {
  transfer(params: {
    merchantId: string;
    bankAccountId: string;
    amount: number;
    reference: string;
  }): Promise<BankTransferResult>;
}

// Stub for development
export const stubBankTransferService: BankTransferService = {
  async transfer() {
    return { success: true, reference: `stub-${Date.now()}` };
  },
};
```

---

## Step 3: Payout Worker

```typescript
// pkg/workers/src/workers/payoutProcessor.ts
import { db } from "@hakwa/db";
import { payoutBatch, payout, ledgerEntry, wallet } from "@hakwa/db/schema";
import { eq, and, gt, sum } from "drizzle-orm";
import { PAYOUT_SERVICE_FEE_FJD } from "@hakwa/core";
import { stubBankTransferService } from "@hakwa/core/bankTransfer";

export async function processBatch(batchId: string): Promise<void> {
  // Transition batch to processing
  await db
    .update(payoutBatch)
    .set({ status: "processing" })
    .where(
      and(eq(payoutBatch.id, batchId), eq(payoutBatch.status, "scheduled")),
    );

  // Find all merchants with balance > PAYOUT_SERVICE_FEE_FJD
  const merchants = await db
    .select({
      holderId: ledgerEntry.holderId,
      balance: sum(ledgerEntry.amount),
    })
    .from(ledgerEntry)
    .where(eq(ledgerEntry.holderType, "merchant"))
    .groupBy(ledgerEntry.holderId)
    .having(({ balance }) => gt(balance, String(PAYOUT_SERVICE_FEE_FJD)));

  for (const merchant of merchants) {
    const balance = Number(merchant.balance);
    const netAmount = +(balance - PAYOUT_SERVICE_FEE_FJD).toFixed(2);

    // Get bank account
    // ... (look up merchant.bankAccountId)

    // Create payout row + debit ledger entry in transaction
    const [newPayout] = await db.transaction(async (tx) => {
      const [po] = await tx
        .insert(payout)
        .values({
          batchId,
          merchantId: merchant.holderId,
          amount: String(balance),
          serviceFee: String(PAYOUT_SERVICE_FEE_FJD),
          netAmount: String(netAmount),
          status: "processing",
        })
        .returning();

      await tx.insert(ledgerEntry).values({
        holderId: merchant.holderId,
        holderType: "merchant",
        entryType: "payout_debit",
        amount: String(-balance),
        payoutId: po.id,
        description: "Weekly payout sweep",
      });

      return [po];
    });

    // Attempt bank transfer
    const result = await stubBankTransferService.transfer({
      merchantId: merchant.holderId,
      bankAccountId: newPayout.bankAccountId,
      amount: newPayout.netAmount,
      reference: newPayout.id,
    });

    await db
      .update(payout)
      .set(
        result.success
          ? { status: "succeeded", completedAt: new Date() }
          : { status: "failed", failureReason: result.failureReason },
      )
      .where(eq(payout.id, newPayout.id));
  }

  // Mark batch completed
  await db
    .update(payoutBatch)
    .set({
      status: "completed",
      completedAt: new Date(),
      merchantCount: merchants.length,
    })
    .where(eq(payoutBatch.id, batchId));
}
```

---

## Step 4: Cron Schedule

```typescript
// api/src/jobs/weeklyPayout.ts
import { db } from "@hakwa/db";
import { payoutBatch } from "@hakwa/db/schema";
import { workerPool } from "@hakwa/workers";

export async function scheduleWeeklyPayout(weekStart: string): Promise<void> {
  const [batch] = await db
    .insert(payoutBatch)
    .values({ weekStart, status: "scheduled" })
    .onConflictDoNothing()
    .returning();

  if (!batch) return; // Already exists — no-op

  await workerPool.run("payoutProcessor", { batchId: batch.id });
}
```

Register with node-cron (or similar):

```typescript
// api/src/index.ts
import cron from "node-cron";
import { scheduleWeeklyPayout } from "./jobs/weeklyPayout";

// Every Monday at 00:00 Fiji time = Sunday 12:00 UTC
cron.schedule("0 12 * * 0", () => {
  const weekStart = previousMondayFiji();
  scheduleWeeklyPayout(weekStart);
});
```

---

## Step 5: Verify

```bash
# 1. Manually trigger a batch for testing
POST /internal/payouts/batches { "weekStart": "2026-03-10" }
# → 201 Created

# 2. Process the batch
POST /internal/payouts/batches/:batchId/process
# → 202

# 3. Check merchant payout history
GET /api/merchant/payouts
# → items[0].status = "succeeded", netAmount = "<balance - 1.00>"

# 4. Verify ledger debit was written
GET /api/merchant/wallet/ledger
# → items[0].entryType = "payout_debit", amount = "-<balance>"

# 5. Test idempotency — run batch creation again for same weekStart
POST /internal/payouts/batches { "weekStart": "2026-03-10" }
# → 200 (no-op, returns existing batch)
```
