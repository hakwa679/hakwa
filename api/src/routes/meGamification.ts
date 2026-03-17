import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import db from "@hakwa/db";
import {
  badge,
  level,
  pointsAccount,
  pointsLedger,
  referral,
  userBadge,
} from "@hakwa/db/schema";
import { getSessionFromRequest } from "@hakwa/auth";

export const meGamificationRouter = Router();

const STREAK_MILESTONES = [7, 30] as const;

function toHistoryTitle(sourceAction: string): string {
  switch (sourceAction) {
    case "trip_completed":
      return "Trip completed";
    case "referral_signup":
      return "Referral signup bonus";
    case "referral_trip":
      return "Referral first-trip bonus";
    case "streak_milestone_7":
      return "7-day streak bonus";
    case "streak_milestone_30":
      return "30-day streak bonus";
    case "badge_earned":
      return "Badge bonus";
    case "map_contribution":
    case "map_verification":
    case "map_contribution_accepted":
    case "map_photo_bonus":
    case "map_road_trace":
    case "map_mission_completed":
    case "map_pioneer_bonus":
      return "Map contribution reward";
    default:
      return "Points update";
  }
}

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

    const [referralCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referral)
      .where(eq(referral.referrerId, session.user.id));

    const currentMinPoints = currentLevel?.pointsRequired ?? 0;
    const progressPercent = nextLevel
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((account.totalPoints - currentMinPoints) /
                Math.max(1, nextLevel.pointsRequired - currentMinPoints)) *
                100,
            ),
          ),
        )
      : 100;

    res.json({
      totalPoints: account.totalPoints,
      currentLevel: currentLevel
        ? {
            number: currentLevel.levelNumber,
            name: currentLevel.name,
            iconUrl: null,
            minPoints: currentLevel.pointsRequired,
          }
        : null,
      nextLevel: nextLevel
        ? {
            number: nextLevel.levelNumber,
            name: nextLevel.name,
            iconUrl: null,
            minPoints: nextLevel.pointsRequired,
          }
        : null,
      pointsToNext: nextLevel
        ? Math.max(0, nextLevel.pointsRequired - account.totalPoints)
        : 0,
      progressPercent,
      referralCode: account.referralCode,
      referralCount: referralCountRow?.count ?? 0,
      badges: badgeRows,
      currentStreak: account.currentStreak,
      streakMilestones: STREAK_MILESTONES.map((days) => ({
        days,
        reached: account.currentStreak >= days,
      })),
    });
  },
);

meGamificationRouter.get(
  "/history",
  async (req: Request, res: Response): Promise<void> => {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const limit = Number.parseInt(String(req.query["limit"] ?? "20"), 10);
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, limit))
      : 20;

    const cursor = String(req.query["cursor"] ?? "").trim();

    const [account] = await db
      .select({ id: pointsAccount.id })
      .from(pointsAccount)
      .where(eq(pointsAccount.userId, session.user.id))
      .limit(1);

    if (!account) {
      res.json({ items: [], nextCursor: null });
      return;
    }

    const baseWhere = and(
      eq(pointsLedger.accountId, account.id),
      cursor ? sql`${pointsLedger.createdAt} < ${new Date(cursor)}` : sql`true`,
    );

    const rows = await db
      .select({
        id: pointsLedger.id,
        points: pointsLedger.amount,
        sourceAction: pointsLedger.sourceAction,
        referenceId: pointsLedger.referenceId,
        createdAt: pointsLedger.createdAt,
      })
      .from(pointsLedger)
      .where(baseWhere)
      .orderBy(desc(pointsLedger.createdAt))
      .limit(safeLimit + 1);

    const hasMore = rows.length > safeLimit;
    const visibleRows = hasMore ? rows.slice(0, safeLimit) : rows;

    res.json({
      items: visibleRows.map((row) => ({
        id: row.id,
        points: row.points,
        sourceAction: row.sourceAction,
        title: toHistoryTitle(row.sourceAction),
        referenceId: row.referenceId,
        createdAt: row.createdAt,
      })),
      nextCursor: hasMore
        ? (visibleRows[visibleRows.length - 1]?.createdAt.toISOString() ?? null)
        : null,
    });
  },
);
