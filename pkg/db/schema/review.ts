import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { trip } from "./trip.ts";

export type ReviewDirection = "passenger_to_driver" | "driver_to_passenger";

export type ReviewTagDirection =
  | "both"
  | "passenger_to_driver"
  | "driver_to_passenger";

export const reviewTag = pgTable(
  "review_tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    label: varchar("label", { length: 120 }).notNull(),
    icon: varchar("icon", { length: 16 }),
    direction: text("direction").notNull().$type<ReviewTagDirection>(),
    isNegative: boolean("is_negative").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("review_tag_direction_sort_idx").on(t.direction, t.sortOrder)],
);

export const tripReview = pgTable(
  "trip_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revieweeUserId: text("reviewee_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    direction: text("direction").notNull().$type<ReviewDirection>(),
    rating: integer("rating").notNull(),
    comment: varchar("comment", { length: 280 }),
    pointsAwarded: integer("points_awarded").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    unique("trip_review_trip_direction_unique").on(t.tripId, t.direction),
    index("trip_review_trip_idx").on(t.tripId),
    index("trip_review_reviewee_idx").on(t.revieweeUserId, t.submittedAt),
    index("trip_review_reviewer_idx").on(t.reviewerUserId, t.submittedAt),
  ],
);

export const tripReviewTag = pgTable(
  "trip_review_tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripReviewId: uuid("trip_review_id")
      .notNull()
      .references(() => tripReview.id, { onDelete: "cascade" }),
    reviewTagKey: varchar("review_tag_key", { length: 64 })
      .notNull()
      .references(() => reviewTag.key, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("trip_review_tag_unique").on(t.tripReviewId, t.reviewTagKey),
    index("trip_review_tag_review_idx").on(t.tripReviewId),
    index("trip_review_tag_key_idx").on(t.reviewTagKey),
  ],
);

export type ReviewTag = typeof reviewTag.$inferSelect;
export type NewReviewTag = typeof reviewTag.$inferInsert;

export type TripReview = typeof tripReview.$inferSelect;
export type NewTripReview = typeof tripReview.$inferInsert;

export type TripReviewTag = typeof tripReviewTag.$inferSelect;
export type NewTripReviewTag = typeof tripReviewTag.$inferInsert;
