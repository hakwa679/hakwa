import type { MapStatsResponse } from "@hakwa/types";
import { MapClient } from "../mapClient.js";

export interface MapStatsQuery {
  get(): Promise<MapStatsResponse>;
}

export function createMapStatsQuery(mapClient: MapClient): MapStatsQuery {
  return {
    get() {
      return mapClient.getMyMapStats();
    },
  };
}
