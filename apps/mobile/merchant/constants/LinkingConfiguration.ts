import type { Href, Router } from "expo-router";

function toRoute(path: string): Href {
  switch (path) {
    case "booking":
    case "trip":
      return "/(tabs)/index";
    case "wallet":
      return "/(tabs)/wallet";
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

  if (screen === "Wallet") {
    router.push("/(tabs)/wallet");
    return;
  }

  const path = typeof data?.["path"] === "string" ? data["path"] : undefined;
  routeNotificationPath(router, path ?? "notifications");
}
