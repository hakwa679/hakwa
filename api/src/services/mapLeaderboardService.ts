import db from "@hakwa/db";
import { mapContributorStats, user } from "@hakwa/db/schema";
import redis from "@hakwa/redis";
import { eq, inArray } from "drizzle-orm";
import { getMapLeaderboardKey } from "./mapRedisService.ts";

export interface MapLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  totalMapPoints: number;
  contributionCount: number;
  verificationCount: number;
  acceptedCount: number;
}

export interface MapLeaderboardResponse {
  month: string;
  entries: MapLeaderboardEntry[];
  callerRank: MapLeaderboardEntry | null;
}

function parseMonth(month?: string): Date {
  if (!month) {
    return new Date();
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("MAP_INVALID_MONTH");
  }

  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthNumber = Number(monthRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new Error("MAP_INVALID_MONTH");
  }

  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function monthLabel(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function getUserMeta(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<
      string,
      {
        displayName: string;
        contributionCount: number;
        verificationCount: number;
        acceptedCount: number;
      }
    >();
  }

  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      contributionsCount: mapContributorStats.contributionsCount,
      verificationCount: mapContributorStats.verificationCount,
      acceptedContributions: mapContributorStats.acceptedContributions,
    })
    .from(user)
    .leftJoin(mapContributorStats, eq(mapContributorStats.userId, user.id))
    .where(inArray(user.id, userIds));

  return new Map(
    rows.map((row) => [
      row.userId,
      {
        displayName: row.name,
        contributionCount: row.contributionsCount ?? 0,
        verificationCount: row.verificationCount ?? 0,
        acceptedCount: row.acceptedContributions ?? 0,
      },
    ]),
  );
}

export async function getMapLeaderboard(
  callerId: string,
  month?: string,
): Promise<MapLeaderboardResponse> {
  const date = parseMonth(month);
  const key = getMapLeaderboardKey(date);
  const ranked = (await redis.zrevrange(key, 0, 49, "WITHSCORES")) as string[];

  const ids: string[] = [];
  const scores = new Map<string, number>();
  for (let i = 0; i < ranked.length; i += 2) {
    const userId = ranked[i];
    const score = ranked[i + 1];
    if (!userId || !score) {
      continue;
    }
    ids.push(userId);
    scores.set(userId, Number(score));
  }

  const meta = await getUserMeta(ids);
  const entries = ids.map((userId, index) => {
    const details = meta.get(userId);
    return {
      rank: index + 1,
      userId,
      displayName: details?.displayName ?? "Anonymous",
      totalMapPoints: scores.get(userId) ?? 0,
      contributionCount: details?.contributionCount ?? 0,
      verificationCount: details?.verificationCount ?? 0,
      acceptedCount: details?.acceptedCount ?? 0,
    };
  });

  const callerRankRaw = await redis.zrevrank(key, callerId);
  const callerScoreRaw = await redis.zscore(key, callerId);

  let callerRank: MapLeaderboardEntry | null = null;
  if (callerRankRaw !== null && callerScoreRaw !== null) {
    const callerMeta = await db
      .select({
        name: user.name,
        contributionsCount: mapContributorStats.contributionsCount,
        verificationCount: mapContributorStats.verificationCount,
        acceptedContributions: mapContributorStats.acceptedContributions,
      })
      .from(user)
      .leftJoin(mapContributorStats, eq(mapContributorStats.userId, user.id))
      .where(eq(user.id, callerId))
      .limit(1);

    const row = callerMeta[0];
    callerRank = {
      rank: callerRankRaw + 1,
      userId: callerId,
      displayName: row?.name ?? "Anonymous",
      totalMapPoints: Number(callerScoreRaw),
      contributionCount: row?.contributionsCount ?? 0,
      verificationCount: row?.verificationCount ?? 0,
      acceptedCount: row?.acceptedContributions ?? 0,
    };
  }

  return {
    month: monthLabel(date),
    entries,
    callerRank,
  };
}

export async function archiveAndResetMonthlyLeaderboard(
  date = new Date(),
): Promise<{ archivedFrom: string; archivedTo: string; moved: number }> {
  const current = getMapLeaderboardKey(date);
  const archive = `${current}:archive`;

  const ranked = (await redis.zrevrange(
    current,
    0,
    -1,
    "WITHSCORES",
  )) as string[];
  let moved = 0;
  for (let i = 0; i < ranked.length; i += 2) {
    const userId = ranked[i];
    const score = ranked[i + 1];
    if (!userId || !score) {
      continue;
    }
    await redis.zadd(archive, Number(score), userId);
    moved += 1;
  }

  await redis.del(current);
  return { archivedFrom: current, archivedTo: archive, moved };
}
