export interface MapBadgeNotificationPayload {
  badgeKey: string;
  badgeName: string;
  pointsAwarded?: number;
}

export function buildMapBadgeNotification(
  payload: MapBadgeNotificationPayload,
): { title: string; body: string; data: Record<string, unknown> } {
  return {
    title: "New map badge unlocked",
    body: `You earned the ${payload.badgeName} badge. Keep mapping Fiji!`,
    data: {
      badgeKey: payload.badgeKey,
      pointsAwarded: payload.pointsAwarded ?? 0,
    },
  };
}
