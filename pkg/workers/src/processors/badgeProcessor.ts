import db from "@hakwa/db";
import {
  badge,
  mapContributorStats,
  pointsAccount,
  pointsLedger,
  userBadge,
} from "@hakwa/db/schema";
import { and, eq, sql } from "drizzle-orm";

export interface MapBadgeAwardResult {
  awardedKeys: string[];
}

async function getActor(userId: string): Promise<"passenger" | "operator"> {
  const [account] = await db
    .select({ actor: pointsAccount.actor })
    .from(pointsAccount)
    .where(eq(pointsAccount.userId, userId))
    .limit(1);

  return (account?.actor ?? "passenger") as "passenger" | "operator";
}

export async function awardMapMilestoneBadges(
  userId: string,
): Promise<MapBadgeAwardResult> {
  const actor = await getActor(userId);

  const [stats] = await db
    .select()
    .from(mapContributorStats)
    .where(eq(mapContributorStats.userId, userId))
    .limit(1);

  const [pioneerRows] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pointsLedger)
    .innerJoin(pointsAccount, eq(pointsAccount.id, pointsLedger.accountId))
    .where(
      and(
        eq(pointsAccount.userId, userId),
        eq(pointsLedger.sourceAction, "map_pioneer_bonus"),
      ),
    )
    .limit(1);

  const milestones: Array<{ key: string; reached: boolean }> = [
    {
      key: "map_contributor_10",
      reached: (stats?.contributionsCount ?? 0) >= 10,
    },
    { key: "map_verifier_25", reached: (stats?.verificationCount ?? 0) >= 25 },
    { key: "map_pioneer_first", reached: (pioneerRows?.count ?? 0) >= 1 },
    { key: "map_explorer_3", reached: (pioneerRows?.count ?? 0) >= 3 },
  ];

  const definitions = await db
    .select({ key: badge.key })
    .from(badge)
    .where(eq(badge.applicableTo, actor));
  const validKeys = new Set(definitions.map((row) => row.key));

  const awardedKeys: string[] = [];
  for (const milestone of milestones) {
    if (!milestone.reached || !validKeys.has(milestone.key)) {
      continue;
    }

    const [inserted] = await db
      .insert(userBadge)
      .values({ userId, badgeKey: milestone.key })
      .onConflictDoNothing()
      .returning({ badgeKey: userBadge.badgeKey });

    if (inserted?.badgeKey) {
      awardedKeys.push(inserted.badgeKey);
    }
  }

  return { awardedKeys };
}
