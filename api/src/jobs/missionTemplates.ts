import type { MapMissionActionType } from "@hakwa/db/schema";

export interface MapMissionTemplate {
  key: string;
  actionType: MapMissionActionType;
  targetCount: number;
  title: string;
  description: string;
}

export const MAP_MISSION_TEMPLATES: readonly MapMissionTemplate[] = [
  {
    key: "poi-contributor",
    actionType: "contribute_poi",
    targetCount: 3,
    title: "POI Pioneer",
    description: "Submit 3 new points of interest this week.",
  },
  {
    key: "feature-verifier",
    actionType: "verify_feature",
    targetCount: 10,
    title: "Community Verifier",
    description: "Verify 10 pending map features this week.",
  },
  {
    key: "trace-explorer",
    actionType: "complete_road_trace",
    targetCount: 2,
    title: "Road Explorer",
    description: "Complete 2 passive road traces this week.",
  },
];
