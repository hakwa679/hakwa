import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { ride } from "./merchant.ts";

export const trip = pgTable("trip", {
  id: uuid("id").primaryKey().defaultRandom(),
  rideId: uuid("ride_id")
    .notNull()
    .references(() => ride.id, { onDelete: "cascade" }),
  driverId: text("driver_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
