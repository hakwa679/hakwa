import type { MapStatsResponse } from "@hakwa/types";
import { MapClient } from "../mapClient.ts";

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
