import db from "@hakwa/db";
import { mapZone } from "@hakwa/db/schema";

interface MapZoneSeed {
  slug: string;
  displayName: string;
  geometryJson: string;
  targetFeatureCount: number;
}

const DEFAULT_ZONE_SEEDS: MapZoneSeed[] = [
  {
    slug: "suva-central",
    displayName: "Suva Central",
    geometryJson: JSON.stringify({ type: "Polygon", coordinates: [] }),
    targetFeatureCount: 500,
  },
  {
    slug: "nadi-core",
    displayName: "Nadi Core",
    geometryJson: JSON.stringify({ type: "Polygon", coordinates: [] }),
    targetFeatureCount: 300,
  },
];

export async function seedMapZones(): Promise<number> {
  const inserted = await db
    .insert(mapZone)
    .values(DEFAULT_ZONE_SEEDS)
    .onConflictDoNothing({ target: mapZone.slug })
    .returning({ id: mapZone.id });

  return inserted.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedMapZones()
    .then((count) => {
      console.log(`[map-zones] seeded ${count} zone(s)`);
    })
    .catch((error: unknown) => {
      console.error("[map-zones] seed failed", error);
      process.exit(1);
    });
}
