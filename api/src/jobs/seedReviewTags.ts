import db from "@hakwa/db";
import { reviewTag } from "@hakwa/db/schema";

const REVIEW_TAG_SEEDS: Array<typeof reviewTag.$inferInsert> = [
  {
    key: "safe_driver",
    label: "Safe driver",
    icon: "🛡️",
    direction: "passenger_to_driver",
    sortOrder: 1,
  },
  {
    key: "on_time",
    label: "On time",
    icon: "⏱️",
    direction: "passenger_to_driver",
    sortOrder: 2,
  },
  {
    key: "friendly",
    label: "Friendly",
    icon: "😊",
    direction: "both",
    sortOrder: 3,
  },
  {
    key: "clean_car",
    label: "Clean car",
    icon: "✨",
    direction: "passenger_to_driver",
    sortOrder: 4,
  },
  {
    key: "smooth_drive",
    label: "Smooth drive",
    icon: "🚘",
    direction: "passenger_to_driver",
    sortOrder: 5,
  },
  {
    key: "helpful",
    label: "Helpful",
    icon: "🤝",
    direction: "both",
    sortOrder: 6,
  },
  {
    key: "late_arrival",
    label: "Late arrival",
    icon: "⌛",
    direction: "passenger_to_driver",
    isNegative: true,
    sortOrder: 7,
  },
  {
    key: "polite",
    label: "Polite",
    icon: "🙏",
    direction: "driver_to_passenger",
    sortOrder: 8,
  },
  {
    key: "ready_on_time",
    label: "Ready on time",
    icon: "🕒",
    direction: "driver_to_passenger",
    sortOrder: 9,
  },
  {
    key: "respectful",
    label: "Respectful",
    icon: "⭐",
    direction: "driver_to_passenger",
    sortOrder: 10,
  },
  {
    key: "clear_pickup",
    label: "Clear pickup",
    icon: "📍",
    direction: "driver_to_passenger",
    sortOrder: 11,
  },
  {
    key: "supportive",
    label: "Supportive",
    icon: "💬",
    direction: "both",
    sortOrder: 12,
  },
  {
    key: "patient",
    label: "Patient",
    icon: "🙂",
    direction: "both",
    sortOrder: 13,
  },
  {
    key: "messy",
    label: "Messy",
    icon: "🧹",
    direction: "driver_to_passenger",
    isNegative: true,
    sortOrder: 14,
  },
  {
    key: "rude",
    label: "Rude",
    icon: "⚠️",
    direction: "both",
    isNegative: true,
    sortOrder: 15,
  },
];

export async function seedReviewTags(): Promise<number> {
  const inserted = await db
    .insert(reviewTag)
    .values(REVIEW_TAG_SEEDS)
    .onConflictDoNothing({ target: reviewTag.key })
    .returning({ id: reviewTag.id });

  return inserted.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedReviewTags()
    .then((count) => {
      console.log(`[review-tags] seeded ${count} tag(s)`);
    })
    .catch((error: unknown) => {
      console.error("[review-tags] seed failed", error);
      process.exit(1);
    });
}
