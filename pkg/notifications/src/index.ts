import { and, eq } from "drizzle-orm";
import db from "@hakwa/db";
import {
  notification,
  notificationPreference,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
} from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { sendEmail } from "@hakwa/email";
import {
  SendNotificationSchema,
  NotificationTypeSchema,
  NotificationChannelSchema,
  DeviceRegistrationSchema,
} from "./types.ts";
import type {
  SendNotificationPayload,
  NotificationChannel,
  InAppNotificationEvent,
} from "./types.ts";

// ---------------------------------------------------------------------------
// sendNotification — the primary entry point for all notification dispatch
// ---------------------------------------------------------------------------

/**
 * Create a notification record and enqueue it for async delivery.
 *
 * Idempotent: if `eventReferenceId` is provided, a duplicate row for the same
 * (userId, type, eventReferenceId) triple is silently ignored (ON CONFLICT DO
 * NOTHING).
 */
export async function sendNotification(
  userId: string,
  type: SendNotificationPayload["type"],
  payload: {
    channel: NotificationChannel;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  eventReferenceId?: string,
): Promise<void> {
  // Validate at boundary
  const parsed = SendNotificationSchema.safeParse({
    userId,
    type,
    channel: payload.channel,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    eventReferenceId,
  });

  if (!parsed.success) {
    console.error("[notifications] sendNotification validation failed", {
      event: "notification.invalid",
      userId,
      type,
      errors: parsed.error.flatten(),
    });
    return;
  }

  // Check notification preference (skip for system_alert)
  if (type !== "system_alert") {
    const pref = await db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.userId, userId),
          eq(notificationPreference.type, type),
          eq(notificationPreference.channel, payload.channel),
        ),
      )
      .limit(1);

    const isEnabled = pref.length === 0 || (pref[0]?.enabled ?? true);
    if (!isEnabled) {
      // Preference explicitly disabled — skip dispatch silently
      return;
    }
  }

  console.info("[notifications] notification queued", {
    event: "notification.queued",
    userId,
    type,
    channel: payload.channel,
  });

  // Idempotent insert — ON CONFLICT DO NOTHING via Drizzle
  const [inserted] = await db
    .insert(notification)
    .values({
      userId,
      type,
      channel: payload.channel,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      status: "pending",
      retryCount: 0,
      eventReferenceId: eventReferenceId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notification.id });

  if (!inserted) {
    // Duplicate — idempotency guard hit, nothing to do
    return;
  }

  // Enqueue in Redis Stream for async delivery
  await redis.xadd(
    "notifications:outbox",
    "*",
    "notificationId",
    inserted.id,
    "retryCount",
    "0",
  );

  // For in-app channel: also publish to Redis pub/sub so the WebSocket
  // relay can push to connected clients immediately
  if (payload.channel === "in_app") {
    const event: InAppNotificationEvent = {
      event: "notification.new",
      notificationId: inserted.id,
      userId,
      type,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      createdAt: new Date().toISOString(),
    };
    await redis.publish(`user:${userId}:notifications`, JSON.stringify(event));

    // Increment unread counter
    await redis.incr(`user:${userId}:unread`);
  }
}

// ---------------------------------------------------------------------------
// Convenience channel wrappers
// ---------------------------------------------------------------------------

export async function sendPush(
  userId: string,
  type: SendNotificationPayload["type"],
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  eventReferenceId?: string,
): Promise<void> {
  await sendNotification(
    userId,
    type,
    { ...payload, channel: "push" },
    eventReferenceId,
  );
}

export async function sendInApp(
  userId: string,
  type: SendNotificationPayload["type"],
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  eventReferenceId?: string,
): Promise<void> {
  await sendNotification(
    userId,
    type,
    { ...payload, channel: "in_app" },
    eventReferenceId,
  );
}

export async function sendEmailNotification(
  userId: string,
  userEmail: string,
  type: SendNotificationPayload["type"],
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  eventReferenceId?: string,
): Promise<void> {
  await sendNotification(
    userId,
    type,
    { ...payload, channel: "email" },
    eventReferenceId,
  );
  // Actual email delivery happens in the worker via @hakwa/email
  // but we also fire-and-forget here for immediate delivery on email channel
  await sendEmail({
    to: userEmail,
    subject: payload.title,
    text: payload.body,
  }).catch((err: unknown) => {
    console.error("[notifications] email send failed", { userId, type, err });
  });
}

export async function sendSms(
  userId: string,
  type: SendNotificationPayload["type"],
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  eventReferenceId?: string,
): Promise<void> {
  // SMS stub — integrate with SMS provider in a future iteration
  await sendNotification(
    userId,
    type,
    { ...payload, channel: "sms" },
    eventReferenceId,
  );
}

// ---------------------------------------------------------------------------
// Preference seeding — called on user registration
// ---------------------------------------------------------------------------

/**
 * Seed 64 preference rows (16 types × 4 channels) for a newly registered user.
 * Already-existing rows are skipped (ON CONFLICT DO NOTHING).
 */
export async function seedNotificationPreferences(
  userId: string,
): Promise<void> {
  const rows = NOTIFICATION_TYPES.flatMap((type) =>
    NOTIFICATION_CHANNELS.map((channel) => ({
      userId,
      type,
      channel,
      enabled: true,
    })),
  );

  await db.insert(notificationPreference).values(rows).onConflictDoNothing();
}

// Re-export types and schemas for consumers
export type { SendNotificationPayload, NotificationChannel };
export {
  SendNotificationSchema,
  NotificationTypeSchema,
  NotificationChannelSchema,
  DeviceRegistrationSchema,
};
export { startNotificationWorker } from "./worker.ts";
export * from "./templates/mapBadges.ts";
export * from "./templates/mapRoadTrace.ts";
export * from "./adapters/twilio.ts";
