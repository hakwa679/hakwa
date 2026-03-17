import db from "../index.ts";
import { badge } from "../schema/index.ts";

const MAP_BADGES = [
  {
    key: "map_contributor_10",
    name: "Map Trailblazer",
    description: "Submit 10 map contributions.",
    applicableTo: "passenger" as const,
  },
  {
    key: "map_verifier_25",
    name: "Community Validator",
    description: "Verify 25 map contributions.",
    applicableTo: "passenger" as const,
  },
  {
    key: "map_pioneer_first",
    name: "First Discoverer",
    description: "Become first discoverer in a zone.",
    applicableTo: "operator" as const,
  },
  {
    key: "map_explorer_3",
    name: "Zone Explorer",
    description: "Become pioneer in 3 zones.",
    applicableTo: "operator" as const,
  },
];

export async function seedMapBadges(): Promise<number> {
  const inserted = await db
    .insert(badge)
    .values(MAP_BADGES)
    .onConflictDoNothing()
    .returning({ key: badge.key });

  return inserted.length;
}
