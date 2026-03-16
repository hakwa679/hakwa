import { and, eq, sql } from "drizzle-orm";
import db from "@hakwa/db";
import { user, notification } from "@hakwa/db/schema";
import { sendNotification } from "@hakwa/notifications";

const INACTIVITY_DAYS = 7 as const;

/**
 * Query passengers who haven't had a completed trip in the last 7 days
 * and send them a re-engagement push + in-app notification.
 *
 * The partial unique index on (userId, type, eventReferenceId) prevents
 * duplicate re-engagement notifications within the same ISO week.
 */
export async function runReEngagementJob(): Promise<void> {
  console.info("[reEngagement] job starting");

  const inactivityThreshold = new Date();
  inactivityThreshold.setDate(inactivityThreshold.getDate() - INACTIVITY_DAYS);

  // Find users who have no trip_completed notification newer than threshold
  // (approximation for activity — proper implementation would query the trip table)
  const activeUserIds = db
    .select({ userId: notification.userId })
    .from(notification)
    .where(
      and(
        eq(notification.type, "trip_completed"),
        sql`${notification.createdAt} > ${inactivityThreshold.toISOString()}`,
      ),
    )
    .groupBy(notification.userId);

  const allUsers = await db.select({ id: user.id }).from(user);

  // Week key for idempotency: YYYY-WW
  const weekKey = getISOWeekKey(new Date());

  let notified = 0;

  for (const u of allUsers) {
    const isActive = await activeUserIds.then((rows) =>
      rows.some((r) => r.userId === u.id),
    );

    if (isActive) continue;

    const eventReferenceId = `re_engagement:${u.id}:${weekKey}`;

    // sendNotification handles ON CONFLICT DO NOTHING for idempotency
    await sendNotification(
      u.id,
      "re_engagement",
      {
        channel: "push",
        title: "Miss us?",
        body: "Book a ride and get back on track!",
        data: { screen: "Home" },
      },
      eventReferenceId,
    );

    notified++;
  }

  console.info("[reEngagement] job complete", { notified });
}

/** Returns a week key in the format YYYY-WW (ISO week number). */
function getISOWeekKey(date: Date): string {
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear =
    Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${year}-${String(weekNum).padStart(2, "0")}`;
}
