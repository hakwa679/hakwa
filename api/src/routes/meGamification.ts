import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import db from "@hakwa/db";
import { badge, level, pointsAccount, userBadge } from "@hakwa/db/schema";
import { getSessionFromRequest } from "@hakwa/auth";

export const meGamificationRouter = Router();

meGamificationRouter.get(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const accountRows = await db
      .select()
      .from(pointsAccount)
      .where(eq(pointsAccount.userId, session.user.id))
      .limit(1);

    const account = accountRows[0];
    if (!account) {
      res.json({
        totalPoints: 0,
        currentLevel: null,
        nextLevel: null,
        pointsToNext: 0,
        referralCode: null,
        badges: [],
        currentStreak: 0,
      });
      return;
    }

    const [currentLevel] = await db
      .select()
      .from(level)
      .where(
        and(
          eq(level.applicableTo, account.actor),
          sql`${level.pointsRequired} <= ${account.totalPoints}`,
        ),
      )
      .orderBy(desc(level.pointsRequired))
      .limit(1);

    const [nextLevel] = await db
      .select()
      .from(level)
      .where(
        and(
          eq(level.applicableTo, account.actor),
          sql`${level.pointsRequired} > ${account.totalPoints}`,
        ),
      )
      .orderBy(level.pointsRequired)
      .limit(1);

    const badgeRows = await db
      .select({
        key: userBadge.badgeKey,
        name: badge.name,
        iconUrl: badge.iconUrl,
        awardedAt: userBadge.awardedAt,
      })
      .from(userBadge)
      .leftJoin(
        badge,
        and(
          eq(badge.key, userBadge.badgeKey),
          eq(badge.applicableTo, account.actor),
        ),
      )
      .where(eq(userBadge.userId, session.user.id));

    res.json({
      totalPoints: account.totalPoints,
      currentLevel: currentLevel
        ? {
            number: currentLevel.levelNumber,
            name: currentLevel.name,
            minPoints: currentLevel.pointsRequired,
          }
        : null,
      nextLevel: nextLevel
        ? {
            number: nextLevel.levelNumber,
            name: nextLevel.name,
            minPoints: nextLevel.pointsRequired,
          }
        : null,
      pointsToNext: nextLevel
        ? Math.max(0, nextLevel.pointsRequired - account.totalPoints)
        : 0,
      referralCode: account.referralCode,
      badges: badgeRows,
      currentStreak: account.currentStreak,
    });
  },
);
