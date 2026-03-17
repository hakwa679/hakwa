export interface MapRoadTraceNotificationPayload {
  tripId: string;
  pointsAwarded: number;
  novelDistanceMeters: number;
}

export function buildMapRoadTraceNotification(
  payload: MapRoadTraceNotificationPayload,
): { title: string; body: string; data: Record<string, unknown> } {
  return {
    title: "Road trace processed",
    body: `Your passive trace added ${payload.novelDistanceMeters}m of novel road data and earned ${payload.pointsAwarded} points.`,
    data: {
      tripId: payload.tripId,
      pointsAwarded: payload.pointsAwarded,
      novelDistanceMeters: payload.novelDistanceMeters,
    },
  };
}
