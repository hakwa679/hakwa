import { and, desc, eq, lt, sql } from "drizzle-orm";
import db from "@hakwa/db";
import { ledgerEntry, HolderType, type EntryType } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { sendNotification } from "@hakwa/notifications";
import { nextPayoutDate } from "@hakwa/core";

// ---------------------------------------------------------------------------
// T005 — getMerchantBalance
// Balance is computed on-demand from the ledger; no mutable balance column.
// ---------------------------------------------------------------------------

export interface WalletBalance {
  balance: string;
  currency: "FJD";
  pendingPayoutAmount: string;
  lastPayoutAt: string | null;
  nextPayoutAt: string;
}

export async function getMerchantBalance(
  merchantId: string,
): Promise<WalletBalance> {
  const [row] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(${ledgerEntry.amount}), 0)::text`,
    })
    .from(ledgerEntry)
    .where(
      and(
        eq(ledgerEntry.holderId, merchantId),
        eq(ledgerEntry.holderType, HolderType.MERCHANT),
      ),
    );

  // Pending payout amount = sum of all positive (credit) entries not yet swept
  // (i.e. the current positive balance). If balance is negative due to fees,
  // return "0.00" as pending.
  const balanceNum = parseFloat(row?.balance ?? "0");
  const pendingPayoutAmount = balanceNum > 0 ? balanceNum.toFixed(2) : "0.00";

  // Last payout: most recent payout_debit entry
  const [lastPayout] = await db
    .select({ createdAt: ledgerEntry.createdAt })
    .from(ledgerEntry)
    .where(
      and(
        eq(ledgerEntry.holderId, merchantId),
        eq(ledgerEntry.holderType, HolderType.MERCHANT),
        eq(ledgerEntry.entryType, "payout_debit" as EntryType),
      ),
    )
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(1);

  return {
    balance: balanceNum.toFixed(2),
    currency: "FJD",
    pendingPayoutAmount,
    lastPayoutAt: lastPayout?.createdAt?.toISOString() ?? null,
    nextPayoutAt: nextPayoutDate(new Date()).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// T006 — getLedgerPage
// Cursor-based pagination of ledger entries for a given holder, newest-first.
// ---------------------------------------------------------------------------

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  trip_credit: "Trip earnings",
  commission: "Platform commission",
  payout_debit: "Weekly payout",
  payout_service_fee_debit: "Payout service fee",
};

export interface LedgerItem {
  id: string;
  entryType: EntryType;
  amount: string;
  label: string;
  tripId: string | null;
  payoutId: string | null;
  createdAt: string;
}

export interface LedgerPage {
  items: LedgerItem[];
  nextCursor: string | null;
}

export async function getLedgerPage(
  holderId: string,
  holderType: HolderType,
  cursor: string | undefined,
  limit: number,
): Promise<LedgerPage> {
  const conditions = [
    eq(ledgerEntry.holderId, holderId),
    eq(ledgerEntry.holderType, holderType),
    ...(cursor ? [lt(ledgerEntry.createdAt, new Date(cursor))] : []),
  ];

  const rows = await db
    .select({
      id: ledgerEntry.id,
      entryType: ledgerEntry.entryType,
      amount: ledgerEntry.amount,
      tripId: ledgerEntry.tripId,
      payoutId: ledgerEntry.payoutId,
      createdAt: ledgerEntry.createdAt,
    })
    .from(ledgerEntry)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return {
    items: items.map((row) => ({
      id: row.id,
      entryType: row.entryType as EntryType,
      amount: row.amount,
      label: ENTRY_TYPE_LABELS[row.entryType as EntryType] ?? row.entryType,
      tripId: row.tripId,
      payoutId: row.payoutId,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore
      ? (items[items.length - 1]?.createdAt.toISOString() ?? null)
      : null,
  };
}

// ---------------------------------------------------------------------------
// T007 — notifyBalanceUpdated
// Publishes a wallet:updated:{merchantId} event to Redis pub/sub after a
// ledger insert, so WebSocket clients receive a real-time balance notification.
// ---------------------------------------------------------------------------

export interface BalanceUpdatedPayload {
  balance: string;
  delta: string;
  entryType: EntryType;
  tripId: string | null;
}

export async function notifyBalanceUpdated(
  merchantId: string,
  payload: BalanceUpdatedPayload,
): Promise<void> {
  const channel = `wallet:updated:${merchantId}`;
  await redis.publish(
    channel,
    JSON.stringify({ type: "balance_updated", ...payload }),
  );
}

// ---------------------------------------------------------------------------
// Re-export onWalletCredited for notification consumers (spec 008)
// ---------------------------------------------------------------------------

export { sendNotification };

/** T014 (spec 008 compat) — notify a user when their wallet receives a credit. */
export async function onWalletCredited(
  userId: string,
  amount: string,
  currencyCode: string,
  referenceId: string,
): Promise<void> {
  const displayAmount = `${currencyCode} ${amount}`;

  await sendNotification(
    userId,
    "wallet_credited",
    {
      channel: "push",
      title: "Wallet credited",
      body: `${displayAmount} has been added to your Hakwa wallet.`,
      data: { screen: "Wallet", referenceId },
    },
    `wallet_credited:${referenceId}`,
  );
  await sendNotification(
    userId,
    "wallet_credited",
    {
      channel: "in_app",
      title: "Wallet credited",
      body: `Your wallet was topped up with ${displayAmount}.`,
      data: { screen: "Wallet", referenceId },
    },
    `wallet_credited:${referenceId}:in_app`,
  );
}
