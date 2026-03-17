import db from "../index.ts";
import { badge } from "../schema/index.ts";

const REVIEW_BADGES = [
  {
    key: "first_review",
    name: "First Impression",
    description: "Submit your first review.",
    applicableTo: "passenger" as const,
  },
  {
    key: "tagged_reviewer",
    name: "Attention to Detail",
    description: "Submit 5 reviews with 2+ tags.",
    applicableTo: "passenger" as const,
  },
  {
    key: "dedicated_reviewer",
    name: "Dedicated Reviewer",
    description: "Submit 25 reviews.",
    applicableTo: "passenger" as const,
  },
  {
    key: "veteran_reviewer",
    name: "Review Veteran",
    description: "Submit 100 reviews.",
    applicableTo: "passenger" as const,
  },
  {
    key: "perfect_streak_reviewer",
    name: "On a Roll",
    description: "Review 7 consecutive completed trips.",
    applicableTo: "passenger" as const,
  },
  {
    key: "top_rated_driver",
    name: "Top Rated Driver",
    description: "Maintain >=4.8 rating across 50+ visible reviews.",
    applicableTo: "operator" as const,
  },
  {
    key: "consistent_driver",
    name: "Consistent Driver",
    description: "50+ visible reviews with no 1-star ratings.",
    applicableTo: "operator" as const,
  },
  {
    key: "five_star_passenger",
    name: "Five-Star Passenger",
    description: "Maintain >=4.8 rating across 20+ visible reviews.",
    applicableTo: "passenger" as const,
  },
];

export async function seedReviewBadges(): Promise<number> {
  const inserted = await db
    .insert(badge)
    .values(REVIEW_BADGES)
    .onConflictDoNothing()
    .returning({ key: badge.key });

  return inserted.length;
}
