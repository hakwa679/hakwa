import * as Linking from "expo-linking";

export interface ReviewReminderLink {
  tripId: string;
  direction: "passenger_to_driver" | "driver_to_passenger";
}

export function parseReviewReminderUrl(url: string): ReviewReminderLink | null {
  const parsed = Linking.parse(url);
  const tripId =
    typeof parsed.queryParams?.["tripId"] === "string"
      ? parsed.queryParams["tripId"]
      : null;
  const direction =
    parsed.queryParams?.["direction"] === "passenger_to_driver" ||
    parsed.queryParams?.["direction"] === "driver_to_passenger"
      ? (parsed.queryParams["direction"] as
          | "passenger_to_driver"
          | "driver_to_passenger")
      : null;

  if (!tripId || !direction) {
    return null;
  }

  return { tripId, direction };
}
