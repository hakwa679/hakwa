export type MapFeatureType =
  | "poi"
  | "road"
  | "landmark"
  | "hazard"
  | "pickup_spot"
  | "other";

export type MapFeatureStatus =
  | "pending"
  | "active"
  | "rejected"
  | "stale"
  | "pending_review"
  | "under_review";

export interface MapFeatureInput {
  featureType: MapFeatureType;
  title?: string;
  description?: string;
  lat: number;
  lng: number;
  geometryJson: string;
  gpsAccuracyMeters?: number;
  photoUrl?: string;
  deviceTimestamp?: string;
}

export interface MapFeatureResponse {
  id: string;
  status: MapFeatureStatus;
  warning?: string;
  createdAt: string;
}

export interface PendingMapFeaturesQuery {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  featureType?: MapFeatureType;
  maxAgeDays?: number;
  sort?: "oldest" | "newest" | "most_confirmed" | "most_disputed";
  limit?: number;
  offset?: number;
}

export interface PendingMapFeatureItem {
  id: string;
  featureType: MapFeatureType;
  lat: number;
  lng: number;
  status: MapFeatureStatus;
  confirmCount: number;
  disputeCount: number;
  createdAt: string;
}

export interface PendingMapFeaturesResponse {
  items: PendingMapFeatureItem[];
  total: number;
}

export type MapVote = "confirm" | "dispute";

export interface VerifyMapFeatureInput {
  vote: MapVote;
  disputeCategory?: string;
}

export interface VerifyMapFeatureResponse {
  id: string;
  status: MapFeatureStatus;
  confirmCount: number;
  disputeCount: number;
}

export interface MapStatsResponse {
  contributionsCount: number;
  acceptedContributions: number;
  verificationCount: number;
  mapStreak: number;
  rideImpactCount: number;
  trustTier: "standard" | "trusted" | "senior";
  isMapBanned: boolean;
}

export interface MapLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  totalMapPoints: number;
  contributionCount: number;
  verificationCount: number;
  acceptedCount: number;
}

export interface MapLeaderboardResponse {
  month: string;
  entries: MapLeaderboardEntry[];
  callerRank: MapLeaderboardEntry | null;
}

export interface MapMission {
  id: string;
  weekStart: string;
  deadline: string;
  actionType: string;
  targetCount: number;
  zoneId: string | null;
}

export interface MapMissionProgress {
  missionId: string;
  actionType: string;
  targetCount: number;
  deadline: string;
  progressCount: number;
  status: "pending" | "completed" | "expired";
  completedAt: string | null;
}

export interface MapMissionsResponse {
  items: MapMission[];
}

export interface MapMissionProgressResponse {
  items: MapMissionProgress[];
}

export interface MapZoneContributor {
  userId: string;
  displayName: string;
  activeCount: number;
}

export interface MapZoneDetailResponse {
  id: string;
  slug: string;
  displayName: string;
  targetFeatureCount: number;
  currentFeatureCount: number;
  completionPercent: number;
  topContributors: MapZoneContributor[];
  pioneer: { userId: string; isCaller: boolean } | null;
}
