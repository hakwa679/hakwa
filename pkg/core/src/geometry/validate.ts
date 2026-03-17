import {
  FIJI_BOUNDS,
  MAP_COORDINATE_PRECISION,
  MAP_PROXIMITY_WARNING_METERS,
} from "../gamificationConstants.ts";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CoordinateValidationResult {
  ok: boolean;
  code?:
    | "MAP_INVALID_COORDINATE"
    | "MAP_OUT_OF_BOUNDS"
    | "MAP_INVALID_GPS_ACCURACY";
  message?: string;
}

const EARTH_RADIUS_METERS = 6371000;

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(MAP_COORDINATE_PRECISION));
}

export function sanitizeCoordinates(input: Coordinates): Coordinates {
  return {
    lat: roundCoordinate(input.lat),
    lng: roundCoordinate(input.lng),
  };
}

export function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

export function isZeroCoordinate(lat: number, lng: number): boolean {
  return lat === 0 && lng === 0;
}

export function isWithinFijiBounds(lat: number, lng: number): boolean {
  const inLatitude = lat >= FIJI_BOUNDS.minLat && lat <= FIJI_BOUNDS.maxLat;
  const crossesAntiMeridian = FIJI_BOUNDS.minLng > FIJI_BOUNDS.maxLng;

  const inLongitude = crossesAntiMeridian
    ? lng >= FIJI_BOUNDS.minLng || lng <= FIJI_BOUNDS.maxLng
    : lng >= FIJI_BOUNDS.minLng && lng <= FIJI_BOUNDS.maxLng;

  return inLatitude && inLongitude;
}

export function validateMapCoordinates(
  coords: Coordinates,
  gpsAccuracyMeters?: number,
): CoordinateValidationResult {
  const { lat, lng } = sanitizeCoordinates(coords);

  if (
    !isFiniteCoordinate(lat) ||
    !isFiniteCoordinate(lng) ||
    isZeroCoordinate(lat, lng)
  ) {
    return {
      ok: false,
      code: "MAP_INVALID_COORDINATE",
      message: "Latitude/longitude must be finite non-zero values.",
    };
  }

  if (!isWithinFijiBounds(lat, lng)) {
    return {
      ok: false,
      code: "MAP_OUT_OF_BOUNDS",
      message: "Coordinates must be within Fiji geographic bounds.",
    };
  }

  if (
    typeof gpsAccuracyMeters === "number" &&
    (!Number.isFinite(gpsAccuracyMeters) ||
      gpsAccuracyMeters > 50 ||
      gpsAccuracyMeters < 0)
  ) {
    return {
      ok: false,
      code: "MAP_INVALID_GPS_ACCURACY",
      message: "GPS accuracy must be between 0 and 50 meters.",
    };
  }

  return { ok: true };
}

export function haversineDistanceMeters(
  a: Coordinates,
  b: Coordinates,
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function hasNearbyFeature(
  origin: Coordinates,
  candidates: Coordinates[],
  thresholdMeters = MAP_PROXIMITY_WARNING_METERS,
): boolean {
  return candidates.some(
    (candidate) =>
      haversineDistanceMeters(origin, candidate) <= thresholdMeters,
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
