import {
  sanitizeCoordinates,
  validateMapCoordinates,
  type Coordinates,
} from "@hakwa/core";

export interface MapSubmitValidationInput {
  lat: number;
  lng: number;
  gpsAccuracyMeters?: number;
}

export function validateMapSubmitInput(input: MapSubmitValidationInput): {
  lat: number;
  lng: number;
} {
  const coordinates: Coordinates = {
    lat: input.lat,
    lng: input.lng,
  };

  const result = validateMapCoordinates(coordinates, input.gpsAccuracyMeters);
  if (!result.ok) {
    throw new Error(result.code ?? "MAP_INVALID_COORDINATE");
  }

  const normalized = sanitizeCoordinates(coordinates);
  return { lat: normalized.lat, lng: normalized.lng };
}
