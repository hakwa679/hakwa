import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { ride } from "./merchant.ts";

/** 7 % of every completed trip fare goes to the Hakwa platform wallet. */
export const PLATFORM_COMMISSION_RATE = 0.07 as const;

/** Flat service fee (FJD) deducted from a merchant's payout each week. */
export const PAYOUT_SERVICE_FEE = 1.0 as const;

export type TripStatus =
  | "pending"
  | "accepted"
  | "driver_arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "timed_out";

export const trip = pgTable("trip", {
  id: uuid("id").primaryKey().defaultRandom(),
  rideId: uuid("ride_id").references(() => ride.id, { onDelete: "cascade" }),
  driverId: text("driver_id").references(() => user.id, {
    onDelete: "cascade",
  }),
  /** The passenger who requested this trip. */
  passengerId: text("passenger_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<TripStatus>().default("pending"),

  // --- Location columns ---
  pickupLat: numeric("pickup_lat", { precision: 9, scale: 6 }).notNull(),
  pickupLng: numeric("pickup_lng", { precision: 9, scale: 6 }).notNull(),
  pickupAddress: text("pickup_address"),
  destinationLat: numeric("destination_lat", {
    precision: 9,
    scale: 6,
  }).notNull(),
  destinationLng: numeric("destination_lng", {
    precision: 9,
    scale: 6,
  }).notNull(),
  destinationAddress: text("destination_address"),

  // --- Fare columns ---
  /** Fare estimate shown to passenger at booking time. */
  estimatedFare: numeric("estimated_fare", { precision: 8, scale: 2 }),
  /** Estimated route distance at booking time. */
  estimatedDistanceKm: numeric("estimated_distance_km", {
    precision: 7,
    scale: 2,
  }),
  /** Set on trip completion from GPS trace. */
  actualDistanceKm: numeric("actual_distance_km", { precision: 7, scale: 2 }),
  /** Total fare paid by the passenger. Set when the trip is completed. */
  fare: numeric("fare", { precision: 10, scale: 2 }),
  /** fare × 0.07 — credited to the Hakwa platform wallet on completion. */
  platformCommission: numeric("platform_commission", {
    precision: 10,
    scale: 2,
  }),
  /** fare × 0.93 — credited to the merchant wallet on completion. */
  merchantAmount: numeric("merchant_amount", { precision: 10, scale: 2 }),

  // --- Lifecycle timestamps ---
  cancellationReason: text("cancellation_reason"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  acceptedAt: timestamp("accepted_at"),
});

export type Trip = typeof trip.$inferSelect;
export type NewTrip = typeof trip.$inferInsert;
