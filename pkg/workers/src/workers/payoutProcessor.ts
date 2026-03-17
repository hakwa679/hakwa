import { and, eq, gt, sql } from "drizzle-orm";
import db from "@hakwa/db";
import {
  bankAccount,
  HolderType,
  ledgerEntry,
  merchant,
  payout,
  payoutBatch,
} from "@hakwa/db/schema";
import {
  PAYOUT_SERVICE_FEE_FJD,
  stubBankTransferService,
  type BankTransferService,
} from "@hakwa/core";
import { sendNotification } from "@hakwa/notifications";

/**
 * Payout processor — handles merchant payout lifecycle events.
 *
 * Notification integration: T015 (payout_processed, payout_failed).
 * Actual payout calculation and disbursement logic is in feature 006.
 */

function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface EligibleMerchant {
  merchantId: string;
  balance: string;
  bankAccountId: string;
  merchantUserId: string;
}

async function getEligibleMerchants(): Promise<EligibleMerchant[]> {
  const rows = await db
    .select({
      merchantId: merchant.id,
      merchantUserId: merchant.userId,
      bankAccountId: bankAccount.id,
      balance: sql<string>`COALESCE(SUM(${ledgerEntry.amount}), 0)::numeric(10,2)::text`,
    })
    .from(merchant)
    .innerJoin(
      bankAccount,
      and(
        eq(bankAccount.holderType, HolderType.MERCHANT),
        eq(bankAccount.holderId, merchant.id),
      ),
    )
    .leftJoin(
      ledgerEntry,
      and(
        eq(ledgerEntry.holderId, merchant.id),
        eq(ledgerEntry.holderType, HolderType.MERCHANT),
      ),
    )
    .groupBy(merchant.id, merchant.userId, bankAccount.id)
    .having(
      gt(
        sql`COALESCE(SUM(${ledgerEntry.amount}), 0)::numeric(10,2)`,
        String(PAYOUT_SERVICE_FEE_FJD),
      ),
    );

  return rows;
}

export async function processBatch(
  batchId: string,
  bankTransferService: BankTransferService = stubBankTransferService,
): Promise<void> {
  await db
    .update(payoutBatch)
    .set({ status: "processing" })
    .where(
      and(eq(payoutBatch.id, batchId), eq(payoutBatch.status, "scheduled")),
    );

  const merchants = await getEligibleMerchants();
  let processedCount = 0;
  let totalAmount = 0;

  for (const candidate of merchants) {
    const grossAmount = toAmount(candidate.balance);
    if (grossAmount <= PAYOUT_SERVICE_FEE_FJD) {
      continue;
    }

    const serviceFee = PAYOUT_SERVICE_FEE_FJD;
    const netAmount = +(grossAmount - serviceFee).toFixed(2);

    const payoutRow = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(payout)
        .values({
          batchId,
          merchantId: candidate.merchantId,
          bankAccountId: candidate.bankAccountId,
          amount: grossAmount.toFixed(2),
          serviceFee: serviceFee.toFixed(2),
          netAmount: netAmount.toFixed(2),
          status: "processing",
          processedAt: new Date(),
        })
        .returning();

      if (!created) {
        throw new Error("Failed to create payout row");
      }

      await tx.insert(ledgerEntry).values({
        holderId: candidate.merchantId,
        holderType: HolderType.MERCHANT,
        entryType: "payout_debit",
        amount: (-grossAmount).toFixed(2),
        payoutId: created.id,
        description: "Weekly payout sweep",
      });

      await tx.insert(ledgerEntry).values({
        holderId: "hakwa",
        holderType: HolderType.HAKWA,
        entryType: "payout_service_fee_debit",
        amount: serviceFee.toFixed(2),
        payoutId: created.id,
        description: "Weekly payout service fee",
      });

      return created;
    });

    const transferResult = await bankTransferService.transfer({
      merchantId: candidate.merchantId,
      bankAccountId: candidate.bankAccountId,
      amount: netAmount,
      reference: payoutRow.id,
    });

    if (transferResult.success) {
      await db
        .update(payout)
        .set({
          status: "succeeded",
          failureReason: null,
          completedAt: new Date(),
        })
        .where(eq(payout.id, payoutRow.id));

      await onPayoutProcessed(
        candidate.merchantUserId,
        payoutRow.id,
        payoutRow.netAmount,
        "FJD",
      );
    } else {
      await db
        .update(payout)
        .set({
          status: "failed",
          failureReason: transferResult.failureReason ?? "Transfer failed",
        })
        .where(eq(payout.id, payoutRow.id));

      await onPayoutFailed(
        candidate.merchantUserId,
        payoutRow.id,
        transferResult.failureReason ?? "Transfer failed",
      );
    }

    processedCount += 1;
    totalAmount += grossAmount;
  }

  await db
    .update(payoutBatch)
    .set({
      status: "completed",
      merchantCount: processedCount,
      totalAmount: totalAmount.toFixed(2),
      completedAt: new Date(),
    })
    .where(eq(payoutBatch.id, batchId));
}

export async function retryFailedPayout(
  payoutId: string,
  bankTransferService: BankTransferService = stubBankTransferService,
): Promise<{ payoutId: string; status: "succeeded" | "failed" }> {
  const [existing] = await db
    .select({
      id: payout.id,
      merchantId: payout.merchantId,
      bankAccountId: payout.bankAccountId,
      netAmount: payout.netAmount,
      status: payout.status,
    })
    .from(payout)
    .where(eq(payout.id, payoutId))
    .limit(1);

  if (!existing) {
    throw new Error("Payout not found");
  }
  if (existing.status !== "failed") {
    throw new Error("Only failed payouts can be retried");
  }

  const [merchantRow] = await db
    .select({ userId: merchant.userId })
    .from(merchant)
    .where(eq(merchant.id, existing.merchantId))
    .limit(1);

  const transferResult = await bankTransferService.transfer({
    merchantId: existing.merchantId,
    bankAccountId: existing.bankAccountId,
    amount: toAmount(existing.netAmount),
    reference: existing.id,
  });

  if (transferResult.success) {
    await db
      .update(payout)
      .set({
        status: "succeeded",
        failureReason: null,
        completedAt: new Date(),
        processedAt: new Date(),
      })
      .where(eq(payout.id, existing.id));

    if (merchantRow) {
      await onPayoutProcessed(
        merchantRow.userId,
        existing.id,
        existing.netAmount,
        "FJD",
      );
    }
    return { payoutId: existing.id, status: "succeeded" };
  }

  const failureReason = transferResult.failureReason ?? "Transfer failed";
  await db
    .update(payout)
    .set({
      status: "failed",
      failureReason,
      processedAt: new Date(),
    })
    .where(eq(payout.id, existing.id));

  if (merchantRow) {
    await onPayoutFailed(merchantRow.userId, existing.id, failureReason);
  }
  return { payoutId: existing.id, status: "failed" };
}

/**
 * T015a — notify a merchant when their weekly payout has been processed
 * successfully and funds are on their way.
 */
export async function onPayoutProcessed(
  merchantUserId: string,
  payoutId: string,
  amount: string,
  currencyCode: string,
): Promise<void> {
  const displayAmount = `${currencyCode} ${amount}`;

  await sendNotification(
    merchantUserId,
    "payout_processed",
    {
      channel: "push",
      title: "Payout sent",
      body: `Your payout of ${displayAmount} has been processed.`,
      data: { screen: "PayoutHistory", payoutId },
    },
    `payout_processed:${payoutId}`,
  );
  await sendNotification(
    merchantUserId,
    "payout_processed",
    {
      channel: "in_app",
      title: "Payout processed",
      body: `${displayAmount} is on its way to your bank account.`,
      data: { screen: "PayoutHistory", payoutId },
    },
    `payout_processed:${payoutId}:in_app`,
  );
  await sendNotification(
    merchantUserId,
    "payout_processed",
    {
      channel: "email",
      title: "Your Hakwa payout has been sent",
      body: `Your payout of ${displayAmount} has been successfully processed.`,
      data: { payoutId, amount, currencyCode },
    },
    `payout_processed:${payoutId}:email`,
  );
}

/**
 * T015b — notify a merchant when their payout has failed so they can
 * take corrective action (update banking details, contact support).
 */
export async function onPayoutFailed(
  merchantUserId: string,
  payoutId: string,
  reason: string,
): Promise<void> {
  await sendNotification(
    merchantUserId,
    "payout_failed",
    {
      channel: "push",
      title: "Payout failed",
      body: "Your payout could not be processed. Please check your banking details.",
      data: { screen: "PayoutHistory", payoutId, reason },
    },
    `payout_failed:${payoutId}`,
  );
  await sendNotification(
    merchantUserId,
    "payout_failed",
    {
      channel: "in_app",
      title: "Payout failed",
      body: "There was an issue with your payout. Tap to find out more.",
      data: { screen: "PayoutHistory", payoutId, reason },
    },
    `payout_failed:${payoutId}:in_app`,
  );
  await sendNotification(
    merchantUserId,
    "payout_failed",
    {
      channel: "email",
      title: "Action required: your Hakwa payout failed",
      body: `We were unable to process your payout. Reason: ${reason}. Please update your banking details or contact support.`,
      data: { payoutId, reason },
    },
    `payout_failed:${payoutId}:email`,
  );
}
