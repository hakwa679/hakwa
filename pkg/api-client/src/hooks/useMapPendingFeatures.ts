import type {
  PendingMapFeaturesQuery,
  PendingMapFeaturesResponse,
} from "@hakwa/types";
import { MapClient } from "../mapClient.js";

export interface MapPendingFeaturesQuery {
  list(query: PendingMapFeaturesQuery): Promise<PendingMapFeaturesResponse>;
}

export function createMapPendingFeaturesQuery(
  mapClient: MapClient,
): MapPendingFeaturesQuery {
  return {
    list(query: PendingMapFeaturesQuery) {
      return mapClient.getPendingFeatures(query);
    },
  };
}
