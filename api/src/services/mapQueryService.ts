import db from "@hakwa/db";
import { mapFeature } from "@hakwa/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { hasNearbyFeature } from "@hakwa/core";

export async function findNearbyPendingSameType(input: {
  lat: number;
  lng: number;
  featureType: string;
}): Promise<boolean> {
  const nearby = await db
    .select({ lat: mapFeature.lat, lng: mapFeature.lng })
    .from(mapFeature)
    .where(
      and(
        eq(mapFeature.status, "pending"),
        eq(
          mapFeature.featureType,
          input.featureType as
            | "poi"
            | "road"
            | "landmark"
            | "hazard"
            | "pickup_spot"
            | "other",
        ),
        sql`${mapFeature.lat}::numeric BETWEEN ${input.lat - 0.02} AND ${input.lat + 0.02}`,
        sql`${mapFeature.lng}::numeric BETWEEN ${input.lng - 0.02} AND ${input.lng + 0.02}`,
      ),
    )
    .limit(100);

  return hasNearbyFeature(
    { lat: input.lat, lng: input.lng },
    nearby.map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) })),
  );
}

export async function listPendingFeaturesInBbox(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  featureType?: string;
  limit?: number;
  offset?: number;
}) {
  const featureTypeClause = params.featureType
    ? sql`AND ${mapFeature.featureType} = ${params.featureType}`
    : sql``;

  const items = await db.execute(sql`
    SELECT
      id,
      feature_type as "featureType",
      lat,
      lng,
      status,
      confirm_count as "confirmCount",
      dispute_count as "disputeCount",
      created_at as "createdAt"
    FROM map_feature
    WHERE status = 'pending'
      AND lat::numeric BETWEEN ${params.minLat} AND ${params.maxLat}
      AND lng::numeric BETWEEN ${params.minLng} AND ${params.maxLng}
      ${featureTypeClause}
    ORDER BY created_at DESC
    LIMIT ${params.limit ?? 20}
    OFFSET ${params.offset ?? 0}
  `);

  return items.rows;
}

export async function getFeatureForVerification(featureId: string): Promise<
  | {
      id: string;
      contributorId: string;
      status: string;
      featureType: string;
      lat: string;
      lng: string;
      title: string | null;
      description: string | null;
      createdAt: Date;
    }
  | undefined
> {
  const rows = await db
    .select({
      id: mapFeature.id,
      contributorId: mapFeature.contributorId,
      status: mapFeature.status,
      featureType: mapFeature.featureType,
      lat: mapFeature.lat,
      lng: mapFeature.lng,
      title: mapFeature.title,
      description: mapFeature.description,
      createdAt: mapFeature.createdAt,
    })
    .from(mapFeature)
    .where(eq(mapFeature.id, featureId))
    .limit(1);

  return rows[0];
}

export async function listActiveFeatures() {
  const rows = await db
    .select({
      id: mapFeature.id,
      featureType: mapFeature.featureType,
      lat: mapFeature.lat,
      lng: mapFeature.lng,
      title: mapFeature.title,
      description: mapFeature.description,
      createdAt: mapFeature.createdAt,
    })
    .from(mapFeature)
    .where(eq(mapFeature.status, "active"));

  return rows;
}
