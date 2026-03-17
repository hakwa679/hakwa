import type { Href, Router } from "expo-router";

function toRoute(path: string): Href {
  switch (path) {
    case "booking":
      return "/booking";
    case "trip":
      return "/active-trip";
    case "wallet":
      return "/(tabs)/explore";
    case "badge":
      return "/(tabs)/explore";
    case "notifications":
      return "/(tabs)/notifications";
    default:
      return "/(tabs)";
  }
}

export function routeNotificationPath(router: Router, rawPath?: string): void {
  if (!rawPath) return;
  const normalized = rawPath.replace(/^\/+/, "").split("/")[0]?.toLowerCase();
  if (!normalized) return;
  router.push(toRoute(normalized));
}

export function routeNotificationData(
  router: Router,
  data?: Record<string, unknown>,
): void {
  const screen =
    typeof data?.["screen"] === "string" ? data["screen"] : undefined;

  if (screen === "ActiveTrip") {
    const tripId =
      typeof data?.["tripId"] === "string" ? data["tripId"] : undefined;
    if (tripId) {
      router.push({ pathname: "/active-trip", params: { tripId } });
      return;
    }
    router.push("/active-trip");
    return;
  }

  if (screen === "TripReceipt") {
    const tripId =
      typeof data?.["tripId"] === "string" ? data["tripId"] : undefined;
    if (tripId) {
      router.push({ pathname: "/trip-receipt", params: { tripId } });
      return;
    }
  }

  const path = typeof data?.["path"] === "string" ? data["path"] : undefined;
  routeNotificationPath(router, path ?? "notifications");
}
