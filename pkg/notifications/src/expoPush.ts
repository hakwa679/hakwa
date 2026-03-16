import { Expo } from "expo-server-sdk";
import type { ExpoPushMessage, ExpoPushReceiptId } from "expo-server-sdk";
import { eq } from "drizzle-orm";
import db from "@hakwa/db";
import { device, notification } from "@hakwa/db/schema";
import redis from "@hakwa/redis";
import { MAX_RETRY_COUNT } from "./types.ts";

const expo = new Expo();

/** Input to batchSendPush — one entry per push channel notification. */
export interface PushNotificationItem {
  notificationId: string;
  pushToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  retryCount: number;
}

/**
 * Send a batch of push notifications via the Expo Push Notification Service.
 *
 * After 15 s, fetches receipts and handles:
 * - `DeviceNotRegistered` → deactivates the device token permanently
 * - Other errors        → exponential back-off re-queue (up to MAX_RETRY_COUNT)
 */
export async function batchSendPush(
  items: PushNotificationItem[],
): Promise<void> {
  if (items.length === 0) return;

  // Build Expo messages, skipping invalid tokens
  const messages: ExpoPushMessage[] = [];
  const validItems: PushNotificationItem[] = [];

  for (const item of items) {
    if (!Expo.isExpoPushToken(item.pushToken)) {
      console.warn("[push] invalid expo push token — skipping", {
        notificationId: item.notificationId,
        pushToken: item.pushToken,
      });
      await markFailed(item.notificationId, "Invalid Expo push token");
      continue;
    }
    messages.push({
      to: item.pushToken,
      title: item.title,
      body: item.body,
      data: item.data ?? {},
      sound: "default",
    });
    validItems.push(item);
  }

  if (messages.length === 0) return;

  // Chunk and send (EPN limit: 100 per request)
  const chunks = expo.chunkPushNotifications(messages);
  const receiptIdMap = new Map<ExpoPushReceiptId, PushNotificationItem>();

  for (const chunk of chunks) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const item = validItems[i]; // matches by position within chunk
      if (!ticket || !item) continue;

      if (ticket.status === "ok") {
        receiptIdMap.set(ticket.id, item);
      } else {
        // error ticket — treat like an error receipt
        const errorCode = ticket.details?.error;
        if (errorCode === "DeviceNotRegistered") {
          console.warn("[push] DeviceNotRegistered on ticket", {
            event: "device.deactivated",
            pushToken: item.pushToken,
            notificationId: item.notificationId,
          });
          await deactivateDevice(item.pushToken, item.notificationId);
        } else {
          await handleRetryOrFail(item, ticket.message ?? "EPN ticket error");
        }
      }
    }
  }

  // Schedule receipt polling after 15 s
  if (receiptIdMap.size > 0) {
    setTimeout(() => pollReceipts(receiptIdMap).catch(console.error), 15_000);
  }
}

/** Fetch EPN receipts and process errors with exponential back-off. */
async function pollReceipts(
  receiptIdMap: Map<ExpoPushReceiptId, PushNotificationItem>,
): Promise<void> {
  const receiptIds = Array.from(receiptIdMap.keys());
  const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);

  for (const chunk of chunks) {
    const receiptsById = await expo.getPushNotificationReceiptsAsync(chunk);

    for (const [receiptId, receipt] of Object.entries(receiptsById)) {
      const item = receiptIdMap.get(receiptId);
      if (!item) continue;

      if (receipt.status === "ok") {
        await db
          .update(notification)
          .set({ status: "sent" })
          .where(eq(notification.id, item.notificationId));
        console.info("[push] notification sent", {
          event: "notification.sent",
          notificationId: item.notificationId,
          channel: "push",
          status: "sent",
        });
      } else {
        const errorCode = receipt.details?.error;
        if (errorCode === "DeviceNotRegistered") {
          console.warn("[push] DeviceNotRegistered on receipt", {
            event: "device.deactivated",
            pushToken: item.pushToken,
            notificationId: item.notificationId,
          });
          await deactivateDevice(item.pushToken, item.notificationId);
        } else {
          await handleRetryOrFail(item, receipt.message ?? "EPN receipt error");
        }
      }
    }
  }
}

/**
 * Deactivate a push token permanently. Once deactivated, the token is never
 * re-activated — the app must obtain a fresh token from EPN.
 */
async function deactivateDevice(
  pushToken: string,
  notificationId: string,
): Promise<void> {
  await Promise.all([
    db
      .update(device)
      .set({ active: false })
      .where(eq(device.pushToken, pushToken)),
    markFailed(notificationId, "DeviceNotRegistered"),
  ]);
}

/**
 * Exponential back-off re-queue or permanent failure after MAX_RETRY_COUNT.
 * Re-queues by appending a new message to the Redis outbox stream.
 */
async function handleRetryOrFail(
  item: PushNotificationItem,
  errorMessage: string,
): Promise<void> {
  const nextRetry = item.retryCount + 1;

  if (nextRetry > MAX_RETRY_COUNT) {
    console.error("[push] max retries exceeded — marking failed", {
      event: "notification.failed",
      notificationId: item.notificationId,
      channel: "push",
      errorDetail: errorMessage,
      retryCount: item.retryCount,
    });
    await markFailed(item.notificationId, errorMessage);
    return;
  }

  const delayMs = Math.min(2 ** item.retryCount * 1_000, 60_000);
  setTimeout(async () => {
    await redis.xadd(
      "notifications:outbox",
      "*",
      "notificationId",
      item.notificationId,
      "retryCount",
      String(nextRetry),
    );
  }, delayMs);

  await db
    .update(notification)
    .set({ retryCount: nextRetry, errorDetail: errorMessage })
    .where(eq(notification.id, item.notificationId));
}

async function markFailed(
  notificationId: string,
  errorDetail: string,
): Promise<void> {
  await db
    .update(notification)
    .set({ status: "failed", errorDetail })
    .where(eq(notification.id, notificationId));
}
