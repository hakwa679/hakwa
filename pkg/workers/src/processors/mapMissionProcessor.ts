import { sendNotification } from "@hakwa/notifications";
import { MAP_POINTS_MISSION_COMPLETED } from "@hakwa/core";

export async function notifyMapMissionCompleted(input: {
  userId: string;
  completedCount: number;
  awardedBonus: boolean;
}): Promise<void> {
  const body = input.awardedBonus
    ? `You completed ${input.completedCount} map missions and earned ${MAP_POINTS_MISSION_COMPLETED} points.`
    : `You completed ${input.completedCount} map missions.`;

  await sendNotification(
    input.userId,
    "badge_earned",
    {
      channel: "in_app",
      title: "Weekly map missions complete",
      body,
      data: {
        completedCount: input.completedCount,
        awardedBonus: input.awardedBonus,
      },
    },
    `map-missions:${input.userId}:${input.completedCount}`,
  );
}
