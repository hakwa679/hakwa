import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

export const merchant = pgTable("merchant", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  tin: varchar("tin", { length: 50 }).notNull(),
  businessRegistrationNumber: varchar("business_registration_number", {
    length: 50,
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Merchant = typeof merchant.$inferSelect;
export type NewMerchant = typeof merchant.$inferInsert;

export const merchantBase = pgTable("merchant_base", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchant.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  location: text("location").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type MerchantBase = typeof merchantBase.$inferSelect;
export type NewMerchantBase = typeof merchantBase.$inferInsert;

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
  type: varchar("type", { length: 50 })
    .notNull()
    .$type<OperatorType>()
    .default(OperatorType.Driver),
});
export type Operator = typeof operator.$inferSelect;
export type NewOperator = typeof operator.$inferInsert;

export enum RideType {
  MotorVehicle = "motor_vehicle",
  Bicycle = "bicycle",
  Boat = "boat",
  Airplane = "airplane",
  Ferry = "ferry",
  Motorcycle = "motorcycle",
  Scooter = "scooter",
}
export const ride = pgTable("ride", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 50 })
    .notNull()
    .$type<RideType>()
    .default(RideType.MotorVehicle),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchant.id, { onDelete: "cascade" }),
  operatorId: uuid("operator_id").references(() => operator.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Ride = typeof ride.$inferSelect;
export type NewRide = typeof ride.$inferInsert;
