import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { trip } from "./trip.ts";

export type MapFeatureStatus =
  | "pending"
  | "active"
  | "rejected"
  | "stale"
  | "pending_review"
  | "under_review";

export type MapFeatureType =
  | "poi"
  | "road"
  | "landmark"
  | "hazard"
  | "pickup_spot"
  | "other";

export type MapVerificationVote = "confirm" | "dispute";

export type MapTrustTier = "standard" | "trusted" | "senior";

export type MapMissionActionType =
  | "contribute_poi"
  | "verify_feature"
  | "contribute_with_photo"
  | "complete_road_trace"
  | "zone_progress";

export type MapMissionStatus = "pending" | "completed" | "expired";

export type MapModerationAction =
  | "approve"
  | "reject"
  | "warn_contributor"
  | "ban_contributor";

export type MapAbuseFlagType = "voting_ring" | "mass_reporting" | "spam";

export const mapFeature = pgTable(
  "map_feature",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    featureType: varchar("feature_type", { length: 50 })
      .notNull()
      .$type<MapFeatureType>(),
    title: varchar("title", { length: 120 }),
    description: text("description"),
    geometryJson: text("geometry_json").notNull(),
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<MapFeatureStatus>(),
    gpsVelocityFlag: boolean("gps_velocity_flag").notNull().default(false),
    confirmCount: integer("confirm_count").notNull().default(0),
    disputeCount: integer("dispute_count").notNull().default(0),
    reporterCount: integer("reporter_count").notNull().default(0),
    osmLicence: varchar("osm_licence", { length: 16 })
      .notNull()
      .default("ODbL"),
    photoUrl: text("photo_url"),
    zoneId: uuid("zone_id").references(() => mapZone.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    activatedAt: timestamp("activated_at"),
    rejectedAt: timestamp("rejected_at"),
    staleAt: timestamp("stale_at"),
  },
  (t) => [
    index("map_feature_status_idx").on(t.status),
    index("map_feature_created_at_idx").on(t.createdAt),
    index("map_feature_zone_id_idx").on(t.zoneId),
    index("map_feature_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const mapVerification = pgTable(
  "map_verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => mapFeature.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: text("vote").notNull().$type<MapVerificationVote>(),
    disputeCategory: varchar("dispute_category", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.featureId, t.userId),
    index("map_verification_feature_id_idx").on(t.featureId),
    index("map_verification_user_id_idx").on(t.userId),
  ],
);

export const mapContributorStats = pgTable(
  "map_contributor_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    contributionsCount: integer("contributions_count").notNull().default(0),
    acceptedContributions: integer("accepted_contributions")
      .notNull()
      .default(0),
    verificationCount: integer("verification_count").notNull().default(0),
    rideImpactCount: integer("ride_impact_count").notNull().default(0),
    mapStreak: integer("map_streak").notNull().default(0),
    mapStreakCheckpoint: timestamp("map_streak_checkpoint"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("map_contributor_stats_user_id_idx").on(t.userId)],
);

export const mapZone = pgTable(
  "map_zone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    geometryJson: text("geometry_json").notNull(),
    targetFeatureCount: integer("target_feature_count").notNull().default(100),
    currentFeatureCount: integer("current_feature_count").notNull().default(0),
    pioneerUserId: text("pioneer_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("map_zone_slug_idx").on(t.slug)],
);

export const mapMission = pgTable(
  "map_mission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekStart: timestamp("week_start").notNull(),
    deadline: timestamp("deadline").notNull(),
    actionType: text("action_type").notNull().$type<MapMissionActionType>(),
    targetCount: integer("target_count").notNull(),
    zoneId: uuid("zone_id").references(() => mapZone.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("map_mission_week_start_idx").on(t.weekStart)],
);

export const mapMissionProgress = pgTable(
  "map_mission_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => mapMission.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    progressCount: integer("progress_count").notNull().default(0),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<MapMissionStatus>(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique().on(t.missionId, t.userId),
    index("map_mission_progress_user_id_idx").on(t.userId),
  ],
);

export const mapRoadTrace = pgTable(
  "map_road_trace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").references(() => trip.id, { onDelete: "set null" }),
    traceGeoJson: text("trace_geo_json").notNull(),
    simplifiedGeoJson: text("simplified_geo_json"),
    novelDistanceMeters: integer("novel_distance_meters").notNull().default(0),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("map_road_trace_user_id_idx").on(t.userId)],
);

export const mapFeatureReport = pgTable(
  "map_feature_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => mapFeature.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 80 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.featureId, t.reporterId),
    index("map_feature_report_feature_id_idx").on(t.featureId),
  ],
);

export const mapContributorTrust = pgTable(
  "map_contributor_trust",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    trustTier: text("trust_tier")
      .notNull()
      .default("standard")
      .$type<MapTrustTier>(),
    acceptedContributions: integer("accepted_contributions")
      .notNull()
      .default(0),
    isMapBanned: boolean("is_map_banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpiresAt: timestamp("ban_expires_at"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("map_contributor_trust_user_id_idx").on(t.userId)],
);

export const mapModerationLog = pgTable(
  "map_moderation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id").references(() => mapFeature.id, {
      onDelete: "set null",
    }),
    moderatorId: text("moderator_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull().$type<MapModerationAction>(),
    reason: text("reason"),
    detailsJson: text("details_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("map_moderation_log_feature_id_idx").on(t.featureId)],
);

export const mapAbuseFlag = pgTable(
  "map_abuse_flag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pairedUserId: text("paired_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    flagType: text("flag_type").notNull().$type<MapAbuseFlagType>(),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    evidenceJson: text("evidence_json"),
    firstDetectedAt: timestamp("first_detected_at").defaultNow().notNull(),
    lastDetectedAt: timestamp("last_detected_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    unique().on(t.userId, t.flagType),
    index("map_abuse_flag_user_id_idx").on(t.userId),
  ],
);

export type MapFeature = typeof mapFeature.$inferSelect;
export type NewMapFeature = typeof mapFeature.$inferInsert;

export type MapVerification = typeof mapVerification.$inferSelect;
export type NewMapVerification = typeof mapVerification.$inferInsert;

export type MapContributorStats = typeof mapContributorStats.$inferSelect;
export type NewMapContributorStats = typeof mapContributorStats.$inferInsert;

export type MapZone = typeof mapZone.$inferSelect;
export type NewMapZone = typeof mapZone.$inferInsert;

export type MapMission = typeof mapMission.$inferSelect;
export type NewMapMission = typeof mapMission.$inferInsert;

export type MapMissionProgress = typeof mapMissionProgress.$inferSelect;
export type NewMapMissionProgress = typeof mapMissionProgress.$inferInsert;

export type MapRoadTrace = typeof mapRoadTrace.$inferSelect;
export type NewMapRoadTrace = typeof mapRoadTrace.$inferInsert;

export type MapFeatureReport = typeof mapFeatureReport.$inferSelect;
export type NewMapFeatureReport = typeof mapFeatureReport.$inferInsert;

export type MapContributorTrust = typeof mapContributorTrust.$inferSelect;
export type NewMapContributorTrust = typeof mapContributorTrust.$inferInsert;

export type MapModerationLog = typeof mapModerationLog.$inferSelect;
export type NewMapModerationLog = typeof mapModerationLog.$inferInsert;

export type MapAbuseFlag = typeof mapAbuseFlag.$inferSelect;
export type NewMapAbuseFlag = typeof mapAbuseFlag.$inferInsert;
