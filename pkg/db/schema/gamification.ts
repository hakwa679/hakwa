import {
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

// ---------------------------------------------------------------------------
// Enums & constants
// ---------------------------------------------------------------------------

export type GamificationActor = "passenger" | "operator";

export type PointsSourceAction =
  | "trip_completed"
  | "referral_signup"
  | "referral_trip"
  | "streak_bonus"
  | "badge_awarded"
  | "review_submitted"
  | "map_contribution"           // user submits a new map feature
  | "map_verification"           // user casts a confirm or dispute vote
  | "map_contribution_accepted"  // contributor's pending feature reaches active
  | "map_photo_bonus"            // extra reward for photo-backed submission
  | "map_road_trace"             // driver passive GPS trace novel km
  | "map_mission_completed"      // all 3 weekly missions completed
  | "map_pioneer_bonus";         // first to map a zone

/** Maximum number of referral bonuses a single referrer can earn. */
export const MAX_REFERRAL_BONUSES = 50 as const;

// ---------------------------------------------------------------------------
// Points account — one per user
// ---------------------------------------------------------------------------

export const pointsAccount = pgTable("points_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  actor: text("actor").notNull().$type<GamificationActor>(),
  totalPoints: integer("total_points").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  /** Last calendar day (UTC) on which the streak was extended. */
  streakCheckpoint: timestamp("streak_checkpoint"),
  /** Unique code shared by this user for referrals. */
  referralCode: varchar("referral_code", { length: 32 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PointsAccount = typeof pointsAccount.$inferSelect;
export type NewPointsAccount = typeof pointsAccount.$inferInsert;

// ---------------------------------------------------------------------------
// Points ledger — immutable audit log of every points change
// ---------------------------------------------------------------------------

export const pointsLedger = pgTable("points_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => pointsAccount.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  sourceAction: text("source_action").notNull().$type<PointsSourceAction>(),
  /** ID of the entity that triggered this entry (e.g. tripId, referralId). */
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PointsLedgerEntry = typeof pointsLedger.$inferSelect;
export type NewPointsLedgerEntry = typeof pointsLedger.$inferInsert;

// ---------------------------------------------------------------------------
// Levels — data-driven milestone definitions
// ---------------------------------------------------------------------------

export const level = pgTable("level", {
  id: uuid("id").primaryKey().defaultRandom(),
  levelNumber: integer("level_number").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  pointsRequired: integer("points_required").notNull(),
  applicableTo: text("applicable_to").notNull().$type<GamificationActor>(),
});

export type Level = typeof level.$inferSelect;
export type NewLevel = typeof level.$inferInsert;

// ---------------------------------------------------------------------------
// Badges — one-time achievement definitions
// ---------------------------------------------------------------------------

export const badge = pgTable("badge", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  applicableTo: text("applicable_to").notNull().$type<GamificationActor>(),
});

export type Badge = typeof badge.$inferSelect;
export type NewBadge = typeof badge.$inferInsert;

// ---------------------------------------------------------------------------
// User badges — granted achievements (idempotent: unique on userId + badgeKey)
// ---------------------------------------------------------------------------

export const userBadge = pgTable(
  "user_badge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    badgeKey: varchar("badge_key", { length: 100 }).notNull(),
    awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.badgeKey)],
);

export type UserBadge = typeof userBadge.$inferSelect;
export type NewUserBadge = typeof userBadge.$inferInsert;

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export const referral = pgTable("referral", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: text("referrer_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  refereeId: text("referee_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Points ledger entry ID for the signup bonus (null until awarded). */
  signupBonusLedgerId: uuid("signup_bonus_ledger_id").references(
    () => pointsLedger.id,
  ),
  /** Points ledger entry ID for the first-trip bonus (null until awarded). */
  firstTripBonusLedgerId: uuid("first_trip_bonus_ledger_id").references(
    () => pointsLedger.id,
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Referral = typeof referral.$inferSelect;
export type NewReferral = typeof referral.$inferInsert;
