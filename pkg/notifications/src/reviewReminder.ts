import { sendNotification } from "./index.ts";

export async function sendReviewReminderNotification(
  userId: string,
  tripId: string,
  direction: "passenger_to_driver" | "driver_to_passenger",
): Promise<void> {
  const target = direction === "passenger_to_driver" ? "driver" : "passenger";
  await sendNotification(
    userId,
    "re_engagement",
    {
      channel: "push",
      title: "Rate your recent trip",
      body: `Your review window is closing soon. Share feedback for your ${target}.`,
      data: {
        screen: "TripCompleteReview",
        tripId,
        direction,
      },
    },
    `review_reminder:${tripId}:${direction}:${userId}`,
  );
}
