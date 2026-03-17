import {
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export enum HolderType {
  INDIVIDUAL = "individual",
  MERCHANT = "merchant",
  HAKWA = "hakwa",
}

export const bankAccount = pgTable("bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  holderType: varchar("holder_type").notNull().$type<HolderType>(),
  holderId: varchar("holder_id").notNull(),
  accountNumber: varchar("account_number").notNull(),
  accountHolderName: varchar("account_holder_name").notNull(),
  backCode: varchar("bank_code").notNull(),
  swiftCode: varchar("swift_code").notNull(),
  bankName: varchar("bank_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BankAccount = typeof bankAccount.$inferSelect;
export type NewBankAccount = typeof bankAccount.$inferInsert;

export const wallet = pgTable("wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  holderType: varchar("holder_type").notNull().$type<HolderType>(),
  holderId: varchar("holder_id").notNull(),
  balance: numeric("balance", { precision: 10, scale: 2 })
    .default("0")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * T004 — A Hakwa platform wallet seed row MUST exist:
 *   holderId = 'hakwa', holderType = 'hakwa'
 * The walletService's findOrCreateWallet('hakwa', 'hakwa') handles this
 * automatically on first use.  For production seeds / migrations, insert:
 *   INSERT INTO wallet (holder_type, holder_id) VALUES ('hakwa', 'hakwa')
 *   ON CONFLICT DO NOTHING;
 */

export type Wallet = typeof wallet.$inferSelect;
export type NewWallet = typeof wallet.$inferInsert;

/**
 * entry_type enum for ledger entries.
 *
 * - trip_credit          93 % merchant earnings from a completed trip
 * - commission           7 % platform share from a completed trip
 * - payout_debit         Amount swept in a weekly payout
 * - payout_service_fee_debit  FJD 1.00 flat fee per payout
 */
export type EntryType =
  | "trip_credit"
  | "commission"
  | "payout_debit"
  | "payout_service_fee_debit";

export const ledgerEntry = pgTable("ledger_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Wallet holder: merchant.id, user.id, or 'hakwa' for the platform. */
  holderId: varchar("holder_id").notNull(),
  holderType: varchar("holder_type").notNull().$type<HolderType>(),
  entryType: varchar("entry_type").notNull().$type<EntryType>(),
  /** Positive = credit, negative = debit. */
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  /** Link to trip.id for trip-related entries. */
  tripId: uuid("trip_id"),
  /** Link to payout.id for payout-related entries. */
  payoutId: uuid("payout_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LedgerEntry = typeof ledgerEntry.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntry.$inferInsert;

// ---------------------------------------------------------------------------
// Weekly payout tables
// ---------------------------------------------------------------------------

type PayoutBatchStatus = "scheduled" | "processing" | "completed" | "failed";

/**
 * One record per weekly payout cycle. A batch sweeps all merchant wallet
 * balances out to their registered bank accounts at the end of each week.
 */
export const payoutBatch = pgTable("payout_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  weekStart: timestamp("week_start").notNull(),
  weekEnd: timestamp("week_end").notNull(),
  status: text("status")
    .notNull()
    .$type<PayoutBatchStatus>()
    .default("scheduled"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export type PayoutBatch = typeof payoutBatch.$inferSelect;
export type NewPayoutBatch = typeof payoutBatch.$inferInsert;

type PayoutStatus = "pending" | "processing" | "completed" | "failed";

/**
 * One record per merchant disbursement within a payout batch.
 * Sweeps the full merchant wallet balance to their bank account.
 */
export const payout = pgTable("payout", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => payoutBatch.id, { onDelete: "cascade" }),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallet.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  /** Flat $1.00 service fee deducted from the payout. */
  serviceFee: numeric("service_fee", { precision: 10, scale: 2 })
    .notNull()
    .default("1.00"),
  /** amount − serviceFee — the net value actually transferred to the bank. */
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().$type<PayoutStatus>().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export type Payout = typeof payout.$inferSelect;
export type NewPayout = typeof payout.$inferInsert;
