import { z } from "zod";
import type {
  NotificationType,
  NotificationChannel,
  DevicePlatform,
} from "@hakwa/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_RETRY_COUNT = 5 as const;

// ---------------------------------------------------------------------------
// Notification type + channel enums (validated at API boundaries)
// ---------------------------------------------------------------------------

export const NotificationTypeSchema = z.enum([
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
] as const);

export const NotificationChannelSchema = z.enum([
  "push",
  "in_app",
  "email",
  "sms",
] as const);

// ---------------------------------------------------------------------------
// Device registration — used at POST /api/devices
// ---------------------------------------------------------------------------

export const DeviceRegistrationSchema = z.object({
  pushToken: z
    .string()
    .min(1)
    .refine((t) => t.startsWith("ExponentPushToken["), {
      message: 'pushToken must start with "ExponentPushToken["',
    }),
  platform: z.enum(["ios", "android"] as const),
});

export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;

// ---------------------------------------------------------------------------
// Notification payload — used inside sendNotification()
// ---------------------------------------------------------------------------

export const NotificationDataSchema = z
  .record(z.string(), z.unknown())
  .optional();

export const SendNotificationSchema = z.object({
  userId: z.string().min(1),
  type: NotificationTypeSchema,
  channel: NotificationChannelSchema,
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  data: NotificationDataSchema,
  eventReferenceId: z.string().optional(),
});

export type SendNotificationPayload = z.infer<typeof SendNotificationSchema>;

// ---------------------------------------------------------------------------
// In-app notification event (published to Redis pub/sub, consumed by WebSocket)
// ---------------------------------------------------------------------------

export interface InAppNotificationEvent {
  event: "notification.new";
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface UnreadCountEvent {
  event: "unread.count";
  userId: string;
  count: number;
}

export type NotificationWebSocketEvent =
  | InAppNotificationEvent
  | UnreadCountEvent;

// Re-export DB types for convenience
export type { NotificationType, NotificationChannel, DevicePlatform };
