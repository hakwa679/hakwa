import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";
import { trip } from "./trip.ts";

export type SafetyIncidentType =
  | "sos"
  | "wrong_vehicle"
  | "route_deviation_escalation"
  | "speed_anomaly_escalation"
  | "stop_anomaly_escalation"
  | "formal_report";

export type SafetyIncidentCategory =
  | "assault"
  | "inappropriate_behaviour"
  | "wrong_vehicle"
  | "dangerous_driving"
  | "verbal_abuse"
  | "overcharge"
  | "no_show"
  | "other";

export type SafetyReporterRole = "passenger" | "driver";

export type SafetyIncidentStatus =
  | "active"
  | "acknowledged"
  | "open"
  | "resolved"
  | "unsubstantiated"
  | "driver_actioned";

export const safetyIncident = pgTable(
  "safety_incident",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceCode: varchar("reference_code", { length: 15 }).notNull().unique(),
    reporterId: text("reporter_id").references(() => user.id, {
      onDelete: "set null",
    }),
    subjectId: text("subject_id").references(() => user.id, {
      onDelete: "set null",
    }),
    tripId: uuid("trip_id").references(() => trip.id, { onDelete: "set null" }),
    type: text("type").notNull().$type<SafetyIncidentType>(),
    category: text("category").$type<SafetyIncidentCategory>(),
    reporterRole: text("reporter_role").notNull().$type<SafetyReporterRole>(),
    status: text("status")
      .notNull()
      .$type<SafetyIncidentStatus>()
      .default("active"),
    locationSnapshotJson: text("location_snapshot_json"),
    description: text("description"),
    evidenceUrl: text("evidence_url"),
    resolutionNotes: text("resolution_notes"),
    smsDispatchedAt: timestamp("sms_dispatched_at"),
    smsFailed: boolean("sms_failed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("safety_incident_reporter_id_idx").on(table.reporterId),
    index("safety_incident_trip_id_idx").on(table.tripId),
    index("safety_incident_status_idx").on(table.status),
    index("safety_incident_created_at_idx").on(table.createdAt),
  ],
);
export type SafetyIncident = typeof safetyIncident.$inferSelect;
export type NewSafetyIncident = typeof safetyIncident.$inferInsert;

export const safetyContact = pgTable(
  "safety_contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    label: varchar("label", { length: 30 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("safety_contact_user_id_idx").on(table.userId),
    index("safety_contact_user_active_idx").on(table.userId, table.isActive),
  ],
);
export type SafetyContact = typeof safetyContact.$inferSelect;
export type NewSafetyContact = typeof safetyContact.$inferInsert;

export type TripShareStatus = "active" | "expired" | "revoked";

export const tripShare = pgTable(
  "trip_share",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    status: text("status").notNull().$type<TripShareStatus>().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("trip_share_token_idx").on(table.token),
    index("trip_share_trip_id_idx").on(table.tripId),
    index("trip_share_expires_at_idx").on(table.expiresAt),
  ],
);
export type TripShare = typeof tripShare.$inferSelect;
export type NewTripShare = typeof tripShare.$inferInsert;

export type SafetyCheckInType =
  | "route_deviation"
  | "speed_anomaly"
  | "prolonged_stop";

export type SafetyCheckInStatus =
  | "pending"
  | "ok_confirmed"
  | "escalated"
  | "cancelled"
  | "trip_ended";

export const safetyCheckIn = pgTable(
  "safety_check_in",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull().$type<SafetyCheckInType>(),
    status: text("status")
      .notNull()
      .$type<SafetyCheckInStatus>()
      .default("pending"),
    anomalyDetailJson: text("anomaly_detail_json"),
    promptedAt: timestamp("prompted_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
    escalatedAt: timestamp("escalated_at"),
    incidentId: uuid("incident_id").references(() => safetyIncident.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("safety_check_in_trip_id_idx").on(table.tripId),
    index("safety_check_in_user_id_idx").on(table.userId),
    index("safety_check_in_status_idx").on(table.status),
  ],
);
export type SafetyCheckIn = typeof safetyCheckIn.$inferSelect;
export type NewSafetyCheckIn = typeof safetyCheckIn.$inferInsert;
