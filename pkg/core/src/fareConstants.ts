/** Base fare (FJD) charged for every trip regardless of distance. */
export const BASE_FARE_FJD = 2.5 as const;

/** Per-kilometre rate (FJD) applied to the OSRM route distance. */
export const RATE_PER_KM_FJD = 0.85 as const;

/** Hakwa platform commission rate (7 % of every completed trip fare). */
export const PLATFORM_COMMISSION_RATE = 0.07 as const;

/** Merchant share rate (93 % of every completed trip fare). */
export const MERCHANT_SHARE_RATE = 0.93 as const;

/** Flat service fee (FJD) deducted from a merchant's weekly payout. */
export const PAYOUT_SERVICE_FEE_FJD = 1.0 as const;

/** Cancellation grace period (seconds) after driver acceptance — penalty-free. */
export const CANCELLATION_GRACE_PERIOD_SECONDS = 30 as const;

/** Maximum number of driver dispatch attempts before marking trip as timed_out. */
export const MAX_DISPATCH_ATTEMPTS = 5 as const;

/** Seconds a driver has to accept a ride offer before the next driver is tried. */
export const DRIVER_RESPONSE_TIMEOUT_SECONDS = 30 as const;

/**
 * Calculate the total fare for a trip.
 * Throws if distanceKm is not positive.
 */
export function calculateFare(distanceKm: number): number {
  if (distanceKm <= 0) throw new Error("Distance must be positive");
  return +(BASE_FARE_FJD + RATE_PER_KM_FJD * distanceKm).toFixed(2);
}

/**
 * Split a fare into platform commission and merchant share.
 * Merchant amount = fare - platform to avoid off-by-one cent rounding gaps.
 */
export function splitFare(fare: number): {
  platform: number;
  merchant: number;
} {
  const platform = +(fare * PLATFORM_COMMISSION_RATE).toFixed(2);
  const merchant = +(fare - platform).toFixed(2);
  return { platform, merchant };
}
