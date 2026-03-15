import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const bankAccount = pgTable("bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
});

export type BankAccount = typeof bankAccount.$inferSelect;
export type NewBankAccount = typeof bankAccount.$inferInsert;

export const wallet = pgTable("wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
});

export type Wallet = typeof wallet.$inferSelect;
export type NewWallet = typeof wallet.$inferInsert;

type LedgerEntryType = "credit" | "debit";
export const ledgerEntry = pgTable("ledger_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallet.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  type: text("type").notNull().$type<LedgerEntryType>(),
  date: timestamp("date").defaultNow().notNull(),
});

export type LedgerEntry = typeof ledgerEntry.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntry.$inferInsert;

export const payout = pgTable("payout", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallet.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  status: text("status").notNull(),
  date: timestamp("date").defaultNow().notNull(),
});
