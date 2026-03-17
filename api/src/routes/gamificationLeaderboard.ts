import { Router, type Request, type Response } from "express";
import { inArray } from "drizzle-orm";
import db from "@hakwa/db";
import { user } from "@hakwa/db/schema";
import { redis } from "@hakwa/redis";
import { getSessionFromRequest } from "@hakwa/auth";

export const gamificationLeaderboardRouter = Router();

function getFijiWeekKey(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Fiji",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

gamificationLeaderboardRouter.get(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const limitParam = Number.parseInt(String(req.query["limit"] ?? "20"), 10);
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(100, limitParam))
      : 20;

    const weekKey = String(req.query["week"] ?? getFijiWeekKey());
    const key = `leaderboard:weekly:${weekKey}`;

    const raw = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");
    if (raw.length === 0) {
      res.json({ week: weekKey, entries: [] });
      return;
    }

    const parsed = [] as Array<{ userId: string; score: number }>;
    for (let i = 0; i < raw.length; i += 2) {
      parsed.push({
        userId: raw[i] ?? "",
        score: Number(raw[i + 1] ?? 0),
      });
    }

    const userIds = parsed
      .map((row) => row.userId)
      .filter((id) => id.length > 0);
    const users = userIds.length
      ? await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, userIds))
      : [];

    const nameByUserId = new Map(users.map((row) => [row.id, row.name]));

    res.json({
      week: weekKey,
      currentUserId: session.user.id,
      entries: parsed.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        name: nameByUserId.get(row.userId) ?? "Anonymous",
        points: row.score,
        isCurrentUser: row.userId === session.user.id,
      })),
    });
  },
);
