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
