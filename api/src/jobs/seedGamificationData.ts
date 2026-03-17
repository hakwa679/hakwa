import { and, eq } from "drizzle-orm";
import db from "@hakwa/db";
import { badge, level } from "@hakwa/db/schema";

const LEVEL_SEEDS = [
  { levelNumber: 1, name: "Novice", pointsRequired: 0 },
  { levelNumber: 2, name: "Explorer", pointsRequired: 100 },
  { levelNumber: 3, name: "Navigator", pointsRequired: 300 },
  { levelNumber: 4, name: "Pathfinder", pointsRequired: 700 },
  { levelNumber: 5, name: "Champion", pointsRequired: 1200 },
] as const;

const BADGE_SEEDS = [
  {
    key: "first_trip",
    name: "First Trip",
    description: "Completed your first trip",
    iconUrl: "/assets/badges/first_trip.png",
  },
  {
    key: "ten_trips",
    name: "Ten Trips",
    description: "Completed ten trips",
    iconUrl: "/assets/badges/ten_trips.png",
  },
  {
    key: "top_referrer",
    name: "Top Referrer",
    description: "Invited riders who completed their first trips",
    iconUrl: "/assets/badges/top_referrer.png",
  },
] as const;

async function seedLevelsForActor(actor: "passenger" | "operator") {
  for (const row of LEVEL_SEEDS) {
    const existing = await db
      .select({ id: level.id })
      .from(level)
      .where(
        and(
          eq(level.levelNumber, row.levelNumber),
          eq(level.applicableTo, actor),
        ),
      )
      .limit(1);

    if (existing[0]) continue;

    await db.insert(level).values({
      levelNumber: row.levelNumber,
      name: row.name,
      pointsRequired: row.pointsRequired,
      applicableTo: actor,
    });
  }
}

async function seedBadgesForActor(actor: "passenger" | "operator") {
  for (const row of BADGE_SEEDS) {
    const existing = await db
      .select({ id: badge.id })
      .from(badge)
      .where(and(eq(badge.key, row.key), eq(badge.applicableTo, actor)))
      .limit(1);

    if (existing[0]) continue;

    await db.insert(badge).values({
      key: row.key,
      name: row.name,
      description: row.description,
      iconUrl: row.iconUrl,
      applicableTo: actor,
    });
  }
}

export async function seedGamificationData(): Promise<void> {
  await seedLevelsForActor("passenger");
  await seedLevelsForActor("operator");
  await seedBadgesForActor("passenger");
  await seedBadgesForActor("operator");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedGamificationData()
    .then(() => {
      console.log("[seedGamificationData] done");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("[seedGamificationData] failed", err);
      process.exit(1);
    });
}
