import type {
  MapLeaderboardResponse,
  MapMissionsResponse,
  MapMissionProgressResponse,
  MapZoneDetailResponse,
  MapStatsResponse,
  MapFeatureInput,
  MapFeatureResponse,
  PendingMapFeaturesQuery,
  PendingMapFeaturesResponse,
  VerifyMapFeatureInput,
  VerifyMapFeatureResponse,
} from "@hakwa/types";
import { HakwaApiClient } from "./index.ts";

export class MapClient {
  constructor(private readonly client: HakwaApiClient) {}

  submitFeature(payload: MapFeatureInput): Promise<MapFeatureResponse> {
    return this.client.post<MapFeatureResponse>(
      "/api/v1/map/features",
      payload,
    );
  }

  getPendingFeatures(
    query: PendingMapFeaturesQuery,
  ): Promise<PendingMapFeaturesResponse> {
    const params = new URLSearchParams({
      minLat: String(query.minLat),
      minLng: String(query.minLng),
      maxLat: String(query.maxLat),
      maxLng: String(query.maxLng),
      limit: String(query.limit ?? 20),
      offset: String(query.offset ?? 0),
    });

    if (query.featureType) {
      params.set("featureType", query.featureType);
    }
    if (typeof query.maxAgeDays === "number" && query.maxAgeDays > 0) {
      params.set("maxAgeDays", String(query.maxAgeDays));
    }
    if (query.sort) {
      params.set("sort", query.sort);
    }

    return this.client.get<PendingMapFeaturesResponse>(
      `/api/v1/map/features/pending?${params.toString()}`,
    );
  }

  verifyFeature(
    featureId: string,
    payload: VerifyMapFeatureInput,
  ): Promise<VerifyMapFeatureResponse> {
    return this.client.post<VerifyMapFeatureResponse>(
      `/api/v1/map/features/${featureId}/verify`,
      payload,
    );
  }

  getMyMapStats(): Promise<MapStatsResponse> {
    return this.client.get<MapStatsResponse>("/api/v1/map/stats/me");
  }

  getLeaderboard(month?: string): Promise<MapLeaderboardResponse> {
    const suffix = month ? `?month=${encodeURIComponent(month)}` : "";
    return this.client.get<MapLeaderboardResponse>(
      `/api/v1/map/leaderboard${suffix}`,
    );
  }

  getCurrentMissions(): Promise<MapMissionsResponse> {
    return this.client.get<MapMissionsResponse>("/api/v1/map/missions");
  }

  getMyMissionProgress(): Promise<MapMissionProgressResponse> {
    return this.client.get<MapMissionProgressResponse>(
      "/api/v1/map/missions/me",
    );
  }

  getZoneDetail(zoneId: string): Promise<MapZoneDetailResponse> {
    return this.client.get<MapZoneDetailResponse>(
      `/api/v1/map/zones/${zoneId}`,
    );
  }
}
