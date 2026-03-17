import { Router, type Request, type Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import db from "@hakwa/db";
import { notification, notificationPreference } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { getSessionFromRequest } from "@hakwa/auth";
import {
  NotificationTypeSchema,
  NotificationChannelSchema,
} from "@hakwa/notifications";

export const notificationsRouter = Router();

// ---------------------------------------------------------------------------
// Preference routes (T023 / T024)
// ---------------------------------------------------------------------------

/**
 * GET /api/me/notification-preferences
 * Return all 64 preference rows grouped by type; mark system_alert as locked.
 */
notificationsRouter.get(
  "/me/notification-preferences",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rows = await db
      .select()
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, session.user.id));

    // Group by type
    const byType: Record<
      string,
      Array<{ channel: string; enabled: boolean; locked: boolean }>
    > = {};
    for (const row of rows) {
      const isSystemAlert = row.type === "system_alert";
      if (!byType[row.type]) byType[row.type] = [];
      byType[row.type]!.push({
        channel: row.channel,
        enabled: isSystemAlert ? true : row.enabled,
        locked: isSystemAlert,
      });
    }

    res.json({ preferences: byType });
  },
);

/**
 * PATCH /api/me/notification-preferences/:type/:channel
 * Update a preference's enabled state. system_alert type returns 403.
 */
notificationsRouter.patch(
  "/me/notification-preferences/:type/:channel",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const typeParsed = NotificationTypeSchema.safeParse(req.params["type"]);
    const channelParsed = NotificationChannelSchema.safeParse(
      req.params["channel"],
    );

    if (!typeParsed.success || !channelParsed.success) {
      res.status(400).json({ error: "Invalid notification type or channel" });
      return;
    }

    if (typeParsed.data === "system_alert") {
      res
        .status(403)
        .json({ error: "system_alert preferences cannot be modified" });
      return;
    }

    const enabledRaw = req.body as unknown;
    if (
      typeof enabledRaw !== "object" ||
      enabledRaw === null ||
      typeof (enabledRaw as Record<string, unknown>)["enabled"] !== "boolean"
    ) {
      res.status(400).json({ error: "Body must contain { enabled: boolean }" });
      return;
    }

    const enabled = (enabledRaw as { enabled: boolean }).enabled;

    const [updated] = await db
      .update(notificationPreference)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(notificationPreference.userId, session.user.id),
          eq(notificationPreference.type, typeParsed.data),
          eq(notificationPreference.channel, channelParsed.data),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Preference not found" });
      return;
    }

    res.json({
      type: updated.type,
      channel: updated.channel,
      enabled: updated.enabled,
    });
  },
);

// ---------------------------------------------------------------------------
// Notification centre routes (T026–T029)
// ---------------------------------------------------------------------------

/**
 * GET /api/notifications
 * Paginated in-app notifications for the authenticated user, newest first.
 */
notificationsRouter.get(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawLimit = req.query["limit"];
    const rawUnread = req.query["unread"];
    const cursor =
      typeof req.query["cursor"] === "string" ? req.query["cursor"] : undefined;

    const limit = Math.min(
      Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 20,
      50,
    );
    const unreadOnly = rawUnread === "true";

    const unreadCount = await getUnreadCount(session.user.id);

    let query = db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, session.user.id),
          eq(notification.channel, "in_app"),
          ...(unreadOnly ? [isNull(notification.readAt)] : []),
          ...(cursor
            ? [sql`${notification.createdAt} < ${decodeCursor(cursor)}`]
            : []),
        ),
      )
      .orderBy(sql`${notification.createdAt} DESC`)
      .limit(limit + 1); // fetch one extra to determine if there's a next page

    const rows = await query;
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && data.length > 0
        ? encodeCursor(data[data.length - 1]!.createdAt)
        : null;

    res.json({ data, nextCursor, totalUnread: unreadCount });
  },
);

/**
 * GET /api/notifications/unread-count
 */
notificationsRouter.get(
  "/unread-count",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const count = await getUnreadCount(session.user.id);
    res.json({ count });
  },
);

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
notificationsRouter.patch(
  "/:id/read",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Missing notification id" });
      return;
    }

    const [row] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, String(id)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    if (row.userId !== session.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (row.readAt !== null) {
      // Already read — idempotent 409
      res.status(409).json({ id: row.id, readAt: row.readAt });
      return;
    }

    const now = new Date();
    await db
      .update(notification)
      .set({ readAt: now })
      .where(
        and(
          eq(notification.id, String(id)),
          eq(notification.userId, String(session.user.id)),
        ),
      );

    // Decrement Redis unread counter (floor at 0)
    const current = await getUnreadCount(session.user.id);
    if (current > 0) {
      await redis.decr(`user:${session.user.id}:unread`);
    }

    res.json({ id, readAt: now.toISOString() });
  },
);

/**
 * POST /api/notifications/mark-all-read
 * Bulk mark all unread in-app notifications as read.
 */
notificationsRouter.post(
  "/mark-all-read",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.userId, session.user.id),
          eq(notification.channel, "in_app"),
          isNull(notification.readAt),
        ),
      )
      .returning({ id: notification.id });

    // Reset unread counter
    await redis.set(`user:${session.user.id}:unread`, 0);

    res.json({ markedCount: result.length });
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUnreadCount(userId: string): Promise<number> {
  const val = await redis.get(`user:${userId}:unread`);
  return val === null ? 0 : Math.max(0, Number(val));
}

function encodeCursor(date: Date | null): string | null {
  if (!date) return null;
  return Buffer.from(date.toISOString()).toString("base64url");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64url").toString("utf-8");
}
