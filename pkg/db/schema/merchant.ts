import {
  boolean,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

export type LicenseType = "licensed" | "unlicensed";
export type MerchantStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "rejected"
  | "suspended_pending_review";

export const merchant = pgTable("merchant", {
  id: uuid("id").primaryKey().defaultRandom(),
  // --- 002-merchant-onboarding additions ---
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  licenseType: text("license_type").notNull().$type<LicenseType>(),
  status: text("status").notNull().default("draft").$type<MerchantStatus>(),
  nationalId: varchar("national_id", { length: 50 }),
  phone: varchar("phone", { length: 30 }),
  // --- pre-existing columns (made nullable for unlicensed support) ---
  name: varchar("name", { length: 255 }).notNull(),
  tin: varchar("tin", { length: 50 }),
  businessRegistrationNumber: varchar("business_registration_number", {
    length: 50,
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
export type Merchant = typeof merchant.$inferSelect;
export type NewMerchant = typeof merchant.$inferInsert;

// ---------------------------------------------------------------------------
// vehicle — physical vehicles owned by a merchant
// ---------------------------------------------------------------------------
export const vehicle = pgTable(
  "vehicle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    make: varchar("make", { length: 80 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    year: smallint("year").notNull(),
    registrationPlate: varchar("registration_plate", { length: 20 })
      .notNull()
      .unique(),
    seatingCapacity: smallint("seating_capacity").notNull(),
    color: varchar("color", { length: 40 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("vehicle_merchant_id_idx").on(t.merchantId)],
);
export type Vehicle = typeof vehicle.$inferSelect;
export type NewVehicle = typeof vehicle.$inferInsert;

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
