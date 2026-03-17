import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { notification, device } from "@hakwa/db/schema";
import { redis, redisSubscriber } from "@hakwa/redis";
import { sendEmail } from "@hakwa/email";
import { batchSendPush } from "./expoPush.ts";

const STREAM_KEY = "notifications:outbox";

/** Start the Redis Stream consumer loop. Runs until the process exits. */
export async function startNotificationWorker(): Promise<void> {
  console.info("[worker] notification worker starting", {
    event: "worker.starting",
    stream: STREAM_KEY,
  });

  let lastId = ">";

  while (true) {
    try {
      // XREAD blocking for up to 5 s, batch 100 messages
      const streams = await redisSubscriber.xread(
        "COUNT",
        100,
        "BLOCK",
        5000,
        "STREAMS",
        STREAM_KEY,
        lastId,
      );

      if (!streams) continue;

      for (const [, entries] of streams) {
        for (const [entryId, fields] of entries) {
          await processEntry(entryId, fields).catch((err: unknown) => {
            console.error("[worker] failed to process entry", {
              event: "worker.entry_error",
              entryId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    } catch (err) {
      console.error("[worker] stream read error — retrying in 2 s", {
        event: "worker.read_error",
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(2_000);
    }
  }
}

async function processEntry(_entryId: string, fields: string[]): Promise<void> {
  // Redis xread returns fields as a flat array: [key, value, key, value, ...]
  const fieldMap = fieldsToMap(fields);
  const notificationId = fieldMap.get("notificationId");
  const retryCount = Number(fieldMap.get("retryCount") ?? "0");

  if (!notificationId) {
    console.warn("[worker] entry missing notificationId — skipping", {
      fields,
    });
    return;
  }

  const [record] = await db
    .select()
    .from(notification)
    .where(eq(notification.id, notificationId))
    .limit(1);

  if (!record) {
    console.warn("[worker] notification record not found", { notificationId });
    return;
  }

  // Skip already-sent or failed records (idempotency guard)
  if (record.status === "sent" || record.status === "failed") {
    return;
  }

  switch (record.channel) {
    case "push":
      await handlePushChannel(record, retryCount);
      break;
    case "email":
      await handleEmailChannel(record);
      break;
    case "in_app":
      // In-app delivery happens synchronously at insert time via Redis pub/sub
      // (see index.ts). Mark record as sent.
      await db
        .update(notification)
        .set({ status: "sent" })
        .where(eq(notification.id, record.id));
      console.info("[worker] in_app notification marked sent", {
        event: "notification.sent",
        notificationId: record.id,
        userId: record.userId,
        channel: "in_app",
        status: "sent",
      });
      break;
    case "sms":
      // SMS stub — mark sent for now until SMS provider is integrated
      await db
        .update(notification)
        .set({ status: "sent" })
        .where(eq(notification.id, record.id));
      console.info("[worker] sms notification stub sent", {
        event: "notification.sent",
        notificationId: record.id,
        userId: record.userId,
        channel: "sms",
        status: "sent",
      });
      break;
    default: {
      // Exhaustive guard
      const _never: never = record.channel;
      console.warn("[worker] unknown channel", { channel: _never });
    }
  }
}

async function handlePushChannel(
  record: typeof notification.$inferSelect,
  retryCount: number,
): Promise<void> {
  // Load active push tokens for this user
  const devices = await db
    .select({ pushToken: device.pushToken })
    .from(device)
    .where(eq(device.userId, record.userId));

  if (devices.length === 0) {
    // No active devices — mark sent (best-effort)
    await db
      .update(notification)
      .set({ status: "sent" })
      .where(eq(notification.id, record.id));
    return;
  }

  const pushItems = devices
    .filter((d) => d.pushToken !== null)
    .map((d) => ({
      notificationId: record.id,
      pushToken: d.pushToken,
      title: record.title,
      body: record.body,
      data: (record.data as Record<string, unknown> | undefined) ?? {},
      retryCount,
    }));

  await batchSendPush(pushItems);
}

async function handleEmailChannel(
  record: typeof notification.$inferSelect,
): Promise<void> {
  try {
    // Load user's email from the DB user table
    const { user } = await import("@hakwa/db/schema");
    const [userRow] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, record.userId))
      .limit(1);

    if (!userRow) {
      console.warn("[worker] user not found for email notification", {
        notificationId: record.id,
        userId: record.userId,
      });
      await db
        .update(notification)
        .set({ status: "failed", errorDetail: "User not found" })
        .where(eq(notification.id, record.id));
      return;
    }

    await sendEmail({
      to: userRow.email,
      subject: record.title,
      text: record.body,
    });

    await db
      .update(notification)
      .set({ status: "sent" })
      .where(eq(notification.id, record.id));

    console.info("[worker] email notification sent", {
      event: "notification.sent",
      notificationId: record.id,
      userId: record.userId,
      channel: "email",
      status: "sent",
    });
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    const newRetryCount = (record.retryCount ?? 0) + 1;

    console.error("[worker] email delivery failed", {
      event: "notification.failed",
      notificationId: record.id,
      userId: record.userId,
      channel: "email",
      errorDetail,
      retryCount: newRetryCount,
    });

    await db
      .update(notification)
      .set({ status: "failed", retryCount: newRetryCount, errorDetail })
      .where(eq(notification.id, record.id));

    // Re-queue with exponential back-off up to MAX_RETRY_COUNT
    const { MAX_RETRY_COUNT } = await import("./types.ts");
    if (newRetryCount <= MAX_RETRY_COUNT) {
      const delayMs = Math.min(2 ** record.retryCount * 1_000, 60_000);
      setTimeout(async () => {
        await redis.xadd(
          STREAM_KEY,
          "*",
          "notificationId",
          record.id,
          "retryCount",
          String(newRetryCount),
        );
      }, delayMs);
    }
  }
}

function fieldsToMap(fields: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (key !== undefined && value !== undefined) {
      map.set(key, value);
    }
  }
  return map;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
