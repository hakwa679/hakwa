import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema.ts";

// ---------------------------------------------------------------------------
// Enums (closed string-literal types enforced at the TypeScript layer)
// ---------------------------------------------------------------------------

export type NotificationType =
  | "booking_confirmed"
  | "driver_accepted"
  | "driver_en_route"
  | "driver_arrived"
  | "trip_started"
  | "trip_completed"
  | "receipt_generated"
  | "wallet_credited"
  | "payout_processed"
  | "payout_failed"
  | "badge_earned"
  | "level_up"
  | "streak_milestone"
  | "referral_conversion"
  | "re_engagement"
  | "system_alert";

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "booking_confirmed",
  "driver_accepted",
  "driver_en_route",
  "driver_arrived",
  "trip_started",
  "trip_completed",
  "receipt_generated",
  "wallet_credited",
  "payout_processed",
  "payout_failed",
  "badge_earned",
  "level_up",
  "streak_milestone",
  "referral_conversion",
  "re_engagement",
  "system_alert",
] as const;

export type NotificationChannel = "push" | "in_app" | "email" | "sms";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  "push",
  "in_app",
  "email",
  "sms",
] as const;

export type NotificationStatus = "pending" | "sent" | "failed";

export type DevicePlatform = "ios" | "android";

// ---------------------------------------------------------------------------
// notification table
// ---------------------------------------------------------------------------

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<NotificationType>(),
    channel: text("channel").notNull().$type<NotificationChannel>(),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<NotificationStatus>(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    data: jsonb("data"),
    retryCount: integer("retry_count").notNull().default(0),
    errorDetail: text("error_detail"),
    readAt: timestamp("read_at"),
    eventReferenceId: text("event_reference_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Serves GET /notifications?channel=in_app&readAt=null
    index("idx_notification_user_channel_read").on(
      table.userId,
      table.channel,
      table.readAt,
    ),
    // Serves paginated notification centre
    index("idx_notification_user_created").on(table.userId, table.createdAt),
    // Partial unique index for idempotency
    uniqueIndex("idx_notification_user_type_ref")
      .on(table.userId, table.type, table.eventReferenceId)
      .where(sql`${table.eventReferenceId} IS NOT NULL`),
  ],
);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;

// ---------------------------------------------------------------------------
// device table
// ---------------------------------------------------------------------------

export const device = pgTable(
  "device",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pushToken: varchar("push_token", { length: 512 }).notNull().unique(),
    platform: text("platform").notNull().$type<DevicePlatform>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Serves push sender query (WHERE userId = ? AND active = true)
    index("idx_device_user_active").on(table.userId, table.active),
  ],
);

export type Device = typeof device.$inferSelect;
export type NewDevice = typeof device.$inferInsert;

// ---------------------------------------------------------------------------
// notificationPreference table
// ---------------------------------------------------------------------------

export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<NotificationType>(),
    channel: text("channel").notNull().$type<NotificationChannel>(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("uq_pref_user_type_channel").on(
      table.userId,
      table.type,
      table.channel,
    ),
  ],
);

export type NotificationPreference = typeof notificationPreference.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreference.$inferInsert;
