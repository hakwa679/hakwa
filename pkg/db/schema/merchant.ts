import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

export const merchant = pgTable("merchant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
});
export type Merchant = typeof merchant.$inferSelect;
export type NewMerchant = typeof merchant.$inferInsert;

export enum OperatorType {
  Driver = "driver",
  Captain = "captain",
  Pilot = "pilot",
  Biker = "biker",
}

export const operator = pgTable("operator", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchant.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().$type<OperatorType>(),
});
export type Operator = typeof operator.$inferSelect;
export type NewOperator = typeof operator.$inferInsert;

export const ride = pgTable("ride", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchant.id, { onDelete: "cascade" }),
  operatorId: uuid("operator_id").references(() => operator.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }),
});
export type Ride = typeof ride.$inferSelect;
export type NewRide = typeof ride.$inferInsert;
