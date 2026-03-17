import db from "@hakwa/db";
import { mapRoadTrace, pointsAccount, pointsLedger } from "@hakwa/db/schema";
import { MAP_ROAD_TRACE_DAILY_CAP_PTS } from "@hakwa/core";
import { and, eq, gte, sql } from "drizzle-orm";

export interface PersistRoadTraceInput {
  userId: string;
  tripId?: string;
  traceGeoJson: string;
  simplifiedGeoJson?: string;
  novelDistanceMeters: number;
  suggestedPoints: number;
}

function dayStartUtc(): Date {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

export async function persistRoadTraceAndPoints(
  input: PersistRoadTraceInput,
): Promise<{ traceId: string; pointsAwarded: number }> {
  const [account] = await db
    .select({ id: pointsAccount.id })
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, input.userId))
    .limit(1);

  if (!account) {
    const [createdTrace] = await db
      .insert(mapRoadTrace)
      .values({
        userId: input.userId,
        tripId: input.tripId ?? null,
        traceGeoJson: input.traceGeoJson,
        simplifiedGeoJson: input.simplifiedGeoJson,
        novelDistanceMeters: input.novelDistanceMeters,
        pointsAwarded: 0,
      })
      .returning({ id: mapRoadTrace.id });

    return { traceId: createdTrace?.id ?? "", pointsAwarded: 0 };
  }

  const start = dayStartUtc();
  const [dailyAwardRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${pointsLedger.amount}), 0)::int`,
    })
    .from(pointsLedger)
    .where(
      and(
        eq(pointsLedger.accountId, account.id),
        eq(pointsLedger.sourceAction, "map_road_trace"),
        gte(pointsLedger.createdAt, start),
      ),
    )
    .limit(1);

  const alreadyAwarded = dailyAwardRow?.total ?? 0;
  const remaining = Math.max(0, MAP_ROAD_TRACE_DAILY_CAP_PTS - alreadyAwarded);
  const pointsAwarded = Math.max(0, Math.min(input.suggestedPoints, remaining));

  const [trace] = await db.transaction(async (tx) => {
    const [createdTrace] = await tx
      .insert(mapRoadTrace)
      .values({
        userId: input.userId,
        tripId: input.tripId ?? null,
        traceGeoJson: input.traceGeoJson,
        simplifiedGeoJson: input.simplifiedGeoJson,
        novelDistanceMeters: input.novelDistanceMeters,
        pointsAwarded,
      })
      .returning({ id: mapRoadTrace.id });

    if (pointsAwarded > 0) {
      await tx.insert(pointsLedger).values({
        accountId: account.id,
        amount: pointsAwarded,
        sourceAction: "map_road_trace",
        referenceId: input.tripId ?? createdTrace?.id ?? null,
      });

      await tx
        .update(pointsAccount)
        .set({
          totalPoints: sql`${pointsAccount.totalPoints} + ${pointsAwarded}`,
          updatedAt: new Date(),
        })
        .where(eq(pointsAccount.id, account.id));
    }

    return [createdTrace];
  });

  return {
    traceId: trace?.id ?? "",
    pointsAwarded,
  };
}
