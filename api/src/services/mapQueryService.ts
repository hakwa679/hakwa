import db from "@hakwa/db";
import { mapFeature, mapVerification, user } from "@hakwa/db/schema";
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
  maxAgeDays?: number;
  sort?: "oldest" | "newest" | "most_confirmed" | "most_disputed";
  limit?: number;
  offset?: number;
}) {
  const maxAgeDays =
    typeof params.maxAgeDays === "number" && params.maxAgeDays > 0
      ? Math.floor(params.maxAgeDays)
      : undefined;
  const ageClause =
    typeof maxAgeDays === "number"
      ? sql`AND created_at >= NOW() - (${maxAgeDays} * INTERVAL '1 day')`
      : sql``;

  const orderClause =
    params.sort === "oldest"
      ? sql`ORDER BY created_at ASC`
      : params.sort === "most_confirmed"
        ? sql`ORDER BY confirm_count DESC, created_at ASC`
        : params.sort === "most_disputed"
          ? sql`ORDER BY dispute_count DESC, created_at ASC`
          : sql`ORDER BY created_at DESC`;

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
      ${ageClause}
    ${orderClause}
    LIMIT ${params.limit ?? 20}
    OFFSET ${params.offset ?? 0}
  `);

  return items.rows;
}

export async function getZoneTopContributors(zoneId: string) {
  const rows = await db.execute(sql`
    SELECT
      f.contributor_id as "userId",
      COALESCE(u.name, 'Anonymous') as "displayName",
      COUNT(*)::int as "activeCount"
    FROM map_feature f
    LEFT JOIN "user" u ON u.id = f.contributor_id
    WHERE f.zone_id = ${zoneId}
      AND f.status = 'active'
    GROUP BY f.contributor_id, u.name
    ORDER BY COUNT(*) DESC, MIN(f.created_at) ASC
    LIMIT 3
  `);

  return rows.rows as Array<{
    userId: string;
    displayName: string;
    activeCount: number;
  }>;
}

export async function getZonePendingVerificationCard(
  userId: string,
  featureId: string,
) {
  const [feature] = await db
    .select({
      id: mapFeature.id,
      contributorId: mapFeature.contributorId,
      status: mapFeature.status,
      featureType: mapFeature.featureType,
      title: mapFeature.title,
      description: mapFeature.description,
      lat: mapFeature.lat,
      lng: mapFeature.lng,
      createdAt: mapFeature.createdAt,
    })
    .from(mapFeature)
    .where(eq(mapFeature.id, featureId))
    .limit(1);

  if (!feature) {
    return undefined;
  }

  const [vote] = await db
    .select({ id: mapVerification.id })
    .from(mapVerification)
    .where(
      and(
        eq(mapVerification.featureId, featureId),
        eq(mapVerification.userId, userId),
      ),
    )
    .limit(1);

  const [contributor] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, feature.contributorId))
    .limit(1);

  return {
    ...feature,
    contributorDisplayName: contributor?.name ?? "Anonymous",
    hasVoted: Boolean(vote),
  };
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
