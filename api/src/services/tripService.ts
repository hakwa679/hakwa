import { sendNotification } from "@hakwa/notifications";

/**
 * Trip service — handles active-trip lifecycle events.
 *
 * Notification integration: T012 (trip_started, trip_completed) and
 * T013 (receipt_generated) are implemented here. Business logic (DB
 * writes, fare calculation) to be introduced in subsequent features.
 */

export async function onTripStarted(
  passengerId: string,
  driverId: string,
  tripId: string,
): Promise<void> {
  // Notify passenger
  await sendNotification(
    passengerId,
    "trip_started",
    {
      channel: "push",
      title: "Trip started",
      body: "Your trip has started. Enjoy the ride!",
      data: { screen: "ActiveTrip", tripId },
    },
    `trip_started:${tripId}:passenger`,
  );
  await sendNotification(
    passengerId,
    "trip_started",
    {
      channel: "in_app",
      title: "Trip started",
      body: "Your trip is under way.",
      data: { screen: "ActiveTrip", tripId },
    },
    `trip_started:${tripId}:passenger:in_app`,
  );

  // Notify driver
  await sendNotification(
    driverId,
    "trip_started",
    {
      channel: "in_app",
      title: "Trip started",
      body: "Your trip is live. Drive safely.",
      data: { screen: "ActiveTrip", tripId },
    },
    `trip_started:${tripId}:driver:in_app`,
  );
}

export async function onTripCompleted(
  passengerId: string,
  driverId: string,
  tripId: string,
  fareDisplay: string,
): Promise<void> {
  // Notify passenger
  await sendNotification(
    passengerId,
    "trip_completed",
    {
      channel: "push",
      title: "Trip completed",
      body: `Your trip is complete. Fare: ${fareDisplay}.`,
      data: { screen: "TripReceipt", tripId },
    },
    `trip_completed:${tripId}:passenger`,
  );
  await sendNotification(
    passengerId,
    "trip_completed",
    {
      channel: "in_app",
      title: "Trip completed",
      body: `Fare: ${fareDisplay}. Rate your trip?`,
      data: { screen: "TripReceipt", tripId },
    },
    `trip_completed:${tripId}:passenger:in_app`,
  );

  // Notify driver
  await sendNotification(
    driverId,
    "trip_completed",
    {
      channel: "push",
      title: "Trip completed",
      body: "Trip finished. Great work!",
      data: { screen: "TripSummary", tripId },
    },
    `trip_completed:${tripId}:driver`,
  );
  await sendNotification(
    driverId,
    "trip_completed",
    {
      channel: "in_app",
      title: "Trip completed",
      body: "Your earnings have been updated.",
      data: { screen: "TripSummary", tripId },
    },
    `trip_completed:${tripId}:driver:in_app`,
  );
}

/** T013 — notify passenger when a digital receipt is ready. */
export async function onReceiptGenerated(
  passengerId: string,
  tripId: string,
  receiptUrl: string,
): Promise<void> {
  await sendNotification(
    passengerId,
    "receipt_generated",
    {
      channel: "push",
      title: "Your receipt is ready",
      body: "Tap to view your trip receipt.",
      data: { screen: "TripReceipt", tripId, receiptUrl },
    },
    `receipt_generated:${tripId}`,
  );
  await sendNotification(
    passengerId,
    "receipt_generated",
    {
      channel: "in_app",
      title: "Receipt available",
      body: "Your trip receipt is ready to view.",
      data: { screen: "TripReceipt", tripId, receiptUrl },
    },
    `receipt_generated:${tripId}:in_app`,
  );
  await sendNotification(
    passengerId,
    "receipt_generated",
    {
      channel: "email",
      title: "Your Hakwa trip receipt",
      body: "Please find your trip receipt attached or accessible at the link below.",
      data: { tripId, receiptUrl },
    },
    `receipt_generated:${tripId}:email`,
  );
}
