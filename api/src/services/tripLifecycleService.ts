import { publishTripCompletedRoadTraceJob } from "./tripService.ts";

export interface TripCompletedLifecycleEvent {
  tripId: string;
  driverId: string;
  completedAt?: string;
}

export async function onTripCompletedLifecycle(
  event: TripCompletedLifecycleEvent,
): Promise<void> {
  await publishTripCompletedRoadTraceJob({
    tripId: event.tripId,
    driverId: event.driverId,
    completedAt: event.completedAt ?? new Date().toISOString(),
  });
}
