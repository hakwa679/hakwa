import { numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { ride } from "./merchant.ts";

/** 7 % of every completed trip fare goes to the Hakwa platform wallet. */
export const PLATFORM_COMMISSION_RATE = 0.07 as const;

/** Flat service fee (FJD) deducted from a merchant's payout each week. */
export const PAYOUT_SERVICE_FEE = 1.0 as const;

type TripStatus = "pending" | "active" | "completed" | "cancelled";

export const trip = pgTable("trip", {
  id: uuid("id").primaryKey().defaultRandom(),
  rideId: uuid("ride_id")
    .notNull()
    .references(() => ride.id, { onDelete: "cascade" }),
  driverId: text("driver_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<TripStatus>().default("pending"),
  /** Total fare paid by the passenger. Set when the trip is completed. */
  fare: numeric("fare", { precision: 10, scale: 2 }),
  /** fare × 0.07 — credited to the Hakwa platform wallet on completion. */
  platformCommission: numeric("platform_commission", {
    precision: 10,
    scale: 2,
  }),
  /** fare × 0.93 — credited to the merchant wallet on completion. */
  merchantAmount: numeric("merchant_amount", { precision: 10, scale: 2 }),
});

export type Trip = typeof trip.$inferSelect;
export type NewTrip = typeof trip.$inferInsert;
