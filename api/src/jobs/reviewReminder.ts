import cron from "node-cron";
import { and, eq } from "drizzle-orm";
import db from "@hakwa/db";
import { trip, tripReview } from "@hakwa/db/schema";
import { sendReviewReminderNotification } from "@hakwa/notifications";
import { redis } from "@hakwa/redis";

const DRIVER_WINDOW_HOURS = 24;
const PASSENGER_WINDOW_HOURS = 72;
const REMINDER_BEFORE_HOURS = 6;

function toIsoHour(date: Date): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export async function runReviewReminderJob(now = new Date()): Promise<number> {
  const completedTrips = await db
    .select({
      id: trip.id,
      completedAt: trip.completedAt,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
    })
    .from(trip)
    .where(eq(trip.status, "completed"));

  let remindersSent = 0;

  for (const t of completedTrips) {
    if (!t.completedAt) continue;

    const passengerReminderAt = new Date(
      t.completedAt.getTime() +
        (PASSENGER_WINDOW_HOURS - REMINDER_BEFORE_HOURS) * 3600 * 1000,
    );
    const driverReminderAt = new Date(
      t.completedAt.getTime() +
        (DRIVER_WINDOW_HOURS - REMINDER_BEFORE_HOURS) * 3600 * 1000,
    );

    if (
      toIsoHour(now) !== toIsoHour(passengerReminderAt) &&
      toIsoHour(now) !== toIsoHour(driverReminderAt)
    ) {
      continue;
    }

    const [passengerReview] = await db
      .select({ id: tripReview.id })
      .from(tripReview)
      .where(
        and(
          eq(tripReview.tripId, t.id),
          eq(tripReview.direction, "passenger_to_driver"),
        ),
      )
      .limit(1);

    const [driverReview] = await db
      .select({ id: tripReview.id })
      .from(tripReview)
      .where(
        and(
          eq(tripReview.tripId, t.id),
          eq(tripReview.direction, "driver_to_passenger"),
        ),
      )
      .limit(1);

    if (!passengerReview && toIsoHour(now) === toIsoHour(passengerReminderAt)) {
      await sendReviewReminderNotification(
        t.passengerId,
        t.id,
        "passenger_to_driver",
      );
      await redis.xadd(
        "notification.dispatch",
        "*",
        "type",
        "review_reminder",
        "userId",
        t.passengerId,
        "tripId",
        t.id,
        "direction",
        "passenger_to_driver",
      );
      remindersSent += 1;
    }

    if (
      !driverReview &&
      t.driverId &&
      toIsoHour(now) === toIsoHour(driverReminderAt)
    ) {
      await sendReviewReminderNotification(
        t.driverId,
        t.id,
        "driver_to_passenger",
      );
      await redis.xadd(
        "notification.dispatch",
        "*",
        "type",
        "review_reminder",
        "userId",
        t.driverId,
        "tripId",
        t.id,
        "direction",
        "driver_to_passenger",
      );
      remindersSent += 1;
    }
  }

  return remindersSent;
}

export function registerReviewReminderCron(): void {
  cron.schedule("0 * * * *", () => {
    runReviewReminderJob().catch((error: unknown) => {
      console.error("[cron] review reminder job failed", { error });
    });
  });
}
