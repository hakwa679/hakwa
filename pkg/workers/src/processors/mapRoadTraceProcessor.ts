import { MAP_ROAD_NOVEL_THRESHOLD_M } from "@hakwa/core";
import { simplifyRdp } from "@hakwa/core";

export interface CoordinatePoint {
  lat: number;
  lng: number;
}

export interface ProcessRoadTraceInput {
  userId: string;
  tripId?: string;
  trace: CoordinatePoint[];
}

export interface ProcessRoadTraceResult {
  userId: string;
  tripId?: string;
  traceGeoJson: string;
  simplifiedGeoJson: string;
  novelDistanceMeters: number;
  suggestedPoints: number;
}

function toMeters(a: CoordinatePoint, b: CoordinatePoint): number {
  const dx = (b.lng - a.lng) * 111_320;
  const dy = (b.lat - a.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

function totalDistance(points: CoordinatePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += toMeters(points[i - 1]!, points[i]!);
  }
  return total;
}

export function processMapRoadTrace(
  input: ProcessRoadTraceInput,
): ProcessRoadTraceResult {
  const points = input.trace;
  const simplified = simplifyRdp(
    points.map((p) => ({ x: p.lng, y: p.lat })),
    0.00015,
  ).map((p) => ({ lat: p.y, lng: p.x }));

  const distance = totalDistance(simplified);
  const novelDistanceMeters = Math.max(
    0,
    distance - MAP_ROAD_NOVEL_THRESHOLD_M,
  );
  const suggestedPoints = Math.floor(novelDistanceMeters / 200);

  return {
    userId: input.userId,
    ...(input.tripId ? { tripId: input.tripId } : {}),
    traceGeoJson: JSON.stringify({
      type: "LineString",
      coordinates: points.map((p) => [p.lng, p.lat]),
    }),
    simplifiedGeoJson: JSON.stringify({
      type: "LineString",
      coordinates: simplified.map((p) => [p.lng, p.lat]),
    }),
    novelDistanceMeters: Math.floor(Math.max(0, novelDistanceMeters)),
    suggestedPoints: Math.max(0, suggestedPoints),
  };
}
