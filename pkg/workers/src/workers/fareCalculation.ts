import { calculateFare, BASE_FARE_FJD, RATE_PER_KM_FJD } from "@hakwa/core";

export interface FareCalculationInput {
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
}

export interface FareCalculationResult {
  estimatedFare: string;
  estimatedDistanceKm: string;
  currency: "FJD";
  breakdown: {
    baseFare: string;
    distanceFare: string;
  };
}

/**
 * Haversine formula — great-circle distance between two lat/lng points in km.
 * Used when an OSRM routing service is unavailable.
 */
function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Attempt to get route distance from OSRM. Falls back to Haversine on failure.
 *
 * OSRM_URL env var must point to a running OSRM HTTP backend, e.g.
 * http://router.project-osrm.org
 */
async function getRouteDistanceKm(
  pickupLat: number,
  pickupLng: number,
  destinationLat: number,
  destinationLng: number,
): Promise<number> {
  const osrmUrl = process.env["OSRM_URL"];
  if (osrmUrl) {
    try {
      const url = `${osrmUrl}/route/v1/driving/${pickupLng},${pickupLat};${destinationLng},${destinationLat}?overview=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as {
          code: string;
          routes?: Array<{ distance: number }>;
        };
        if (data.code === "Ok" && data.routes?.[0]?.distance != null) {
          return data.routes[0].distance / 1000; // metres → km
        }
      }
    } catch {
      // fall through to Haversine
    }
  }
  return haversineDistanceKm(
    pickupLat,
    pickupLng,
    destinationLat,
    destinationLng,
  );
}

/**
 * fareCalculation — compute fare estimate from pickup/destination coordinates.
 *
 * Formula: baseFare + (distanceKm × ratePerKm)
 * Constants from @hakwa/core.
 */
export async function fareCalculation(
  input: FareCalculationInput,
): Promise<FareCalculationResult> {
  const { pickupLat, pickupLng, destinationLat, destinationLng } = input;

  const distanceKm = await getRouteDistanceKm(
    pickupLat,
    pickupLng,
    destinationLat,
    destinationLng,
  );

  // T012: use shared calculateFare from @hakwa/core (same formula as trip completion)
  const totalFare = calculateFare(distanceKm);
  const baseFare = BASE_FARE_FJD;
  const distanceFare = +(totalFare - baseFare).toFixed(2);

  return {
    estimatedFare: totalFare.toFixed(2),
    estimatedDistanceKm: distanceKm.toFixed(2),
    currency: "FJD",
    breakdown: {
      baseFare: baseFare.toFixed(2),
      distanceFare: distanceFare.toFixed(2),
    },
  };
}
