import db from "@hakwa/db";
import {
  mapMission,
  mapMissionProgress,
  pointsAccount,
  pointsLedger,
  type MapMissionActionType,
} from "@hakwa/db/schema";
import { MAP_POINTS_MISSION_COMPLETED } from "@hakwa/core";
import { and, eq, gte, lt, sql } from "drizzle-orm";

function startOfWeekUtc(now = new Date()): Date {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function listCurrentMissions() {
  const weekStart = startOfWeekUtc();
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  return db
    .select()
    .from(mapMission)
    .where(
      and(
        gte(mapMission.weekStart, weekStart),
        lt(mapMission.weekStart, weekEnd),
      ),
    );
}

export async function listMyMissionProgress(userId: string) {
  const missions = await listCurrentMissions();
  if (missions.length === 0) {
    return [];
  }

  const progressRows = await db
    .select()
    .from(mapMissionProgress)
    .where(
      and(
        eq(mapMissionProgress.userId, userId),
        sql`${mapMissionProgress.missionId} IN (${sql.join(
          missions.map((m) => sql`${m.id}`),
          sql`,`,
        )})`,
      ),
    );

  const byMissionId = new Map(progressRows.map((row) => [row.missionId, row]));

  return missions.map((mission) => {
    const progress = byMissionId.get(mission.id);
    return {
      missionId: mission.id,
      actionType: mission.actionType,
      targetCount: mission.targetCount,
      deadline: mission.deadline,
      progressCount: progress?.progressCount ?? 0,
      status: progress?.status ?? "pending",
      completedAt: progress?.completedAt ?? null,
    };
  });
}

export async function updateMissionProgressForAction(input: {
  userId: string;
  actionType: MapMissionActionType;
  incrementBy?: number;
}): Promise<{ completedMissions: number; bonusAwarded: boolean }> {
  const missions = await listCurrentMissions();
  const relevant = missions.filter(
    (mission) => mission.actionType === input.actionType,
  );
  if (relevant.length === 0) {
    return { completedMissions: 0, bonusAwarded: false };
  }

  const incrementBy = input.incrementBy ?? 1;
  let completedMissions = 0;

  await db.transaction(async (tx) => {
    for (const mission of relevant) {
      const [existing] = await tx
        .select()
        .from(mapMissionProgress)
        .where(
          and(
            eq(mapMissionProgress.missionId, mission.id),
            eq(mapMissionProgress.userId, input.userId),
          ),
        )
        .limit(1);

      if (!existing) {
        const nextCount = Math.min(incrementBy, mission.targetCount);
        const isCompleted = nextCount >= mission.targetCount;
        await tx.insert(mapMissionProgress).values({
          missionId: mission.id,
          userId: input.userId,
          progressCount: nextCount,
          status: isCompleted ? "completed" : "pending",
          completedAt: isCompleted ? new Date() : null,
        });
        if (isCompleted) {
          completedMissions += 1;
        }
        continue;
      }

      if (existing.status === "completed") {
        completedMissions += 1;
        continue;
      }

      const nextCount = Math.min(
        existing.progressCount + incrementBy,
        mission.targetCount,
      );
      const isCompleted = nextCount >= mission.targetCount;
      await tx
        .update(mapMissionProgress)
        .set({
          progressCount: nextCount,
          status: isCompleted ? "completed" : "pending",
          completedAt: isCompleted ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(mapMissionProgress.id, existing.id));

      if (isCompleted) {
        completedMissions += 1;
      }
    }
  });

  const progress = await listMyMissionProgress(input.userId);
  const completedAll =
    progress.length >= 3 && progress.every((row) => row.status === "completed");

  if (!completedAll) {
    return { completedMissions, bonusAwarded: false };
  }

  const weekStart = startOfWeekUtc();
  const bonusReference = `map-missions:${input.userId}:${weekStart.toISOString().slice(0, 10)}`;

  const [account] = await db
    .select({ id: pointsAccount.id })
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, input.userId))
    .limit(1);

  if (!account) {
    return { completedMissions, bonusAwarded: false };
  }

  const [existingBonus] = await db
    .select({ id: pointsLedger.id })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.accountId, account.id),
        eq(pointsLedger.sourceAction, "map_mission_completed"),
        eq(pointsLedger.referenceId, bonusReference),
      ),
    )
    .limit(1);

  if (existingBonus) {
    return { completedMissions, bonusAwarded: false };
  }

  await db.transaction(async (tx) => {
    await tx.insert(pointsLedger).values({
      accountId: account.id,
      amount: MAP_POINTS_MISSION_COMPLETED,
      sourceAction: "map_mission_completed",
      referenceId: bonusReference,
    });

    await tx
      .update(pointsAccount)
      .set({
        totalPoints: sql`${pointsAccount.totalPoints} + ${MAP_POINTS_MISSION_COMPLETED}`,
        updatedAt: new Date(),
      })
      .where(eq(pointsAccount.id, account.id));
  });

  return { completedMissions, bonusAwarded: true };
}
