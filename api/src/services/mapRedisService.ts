import redis from "@hakwa/redis";
import { listActiveFeatures } from "./mapQueryService.ts";

export function getMapLeaderboardKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `map:leaderboard:monthly:${year}-${month}`;
}

export function getMapLeaderboardArchiveKey(month: string): string {
  return `map:leaderboard:monthly:${month}:archive`;
}

export function getMapActiveLayerCacheKey(): string {
  return "map:active:geojson";
}

export function getMapZonePercentKey(zoneId: string): string {
  return `map:zone:${zoneId}:pct`;
}

export async function bumpMapLeaderboard(
  userId: string,
  points: number,
): Promise<void> {
  await redis.zincrby(getMapLeaderboardKey(), points, userId);
}

export async function invalidateMapActiveLayerCache(): Promise<void> {
  await redis.del(getMapActiveLayerCacheKey());
}

export async function cacheActiveMapGeoJson(
  payload: string,
  ttlSeconds = 60,
): Promise<void> {
  await redis.set(getMapActiveLayerCacheKey(), payload, "EX", ttlSeconds);
}

export async function getActiveMapGeoJson(): Promise<string | null> {
  const value = await redis.get(getMapActiveLayerCacheKey());
  return value;
}

export async function setZoneCompletionPercent(
  zoneId: string,
  percent: number,
): Promise<void> {
  await redis.set(getMapZonePercentKey(zoneId), percent.toFixed(2));
}

export async function getZoneCompletionPercent(
  zoneId: string,
): Promise<number | null> {
  const value = await redis.get(getMapZonePercentKey(zoneId));
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function refreshActiveMapGeoJsonCache(): Promise<string> {
  const active = await listActiveFeatures();
  const payload = JSON.stringify({
    type: "FeatureCollection",
    features: active.map((row) => ({
      type: "Feature",
      id: row.id,
      geometry: {
        type: "Point",
        coordinates: [Number(row.lng), Number(row.lat)],
      },
      properties: {
        featureType: row.featureType,
        title: row.title,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
      },
    })),
  });

  await cacheActiveMapGeoJson(payload, 60);
  return payload;
}

export async function publishFeatureActivated(
  featureId: string,
): Promise<void> {
  await redis.publish(
    "map:features:activated",
    JSON.stringify({
      type: "feature_activated",
      featureId,
      at: new Date().toISOString(),
    }),
  );
}
