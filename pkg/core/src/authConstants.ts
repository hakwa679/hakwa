/** Maximum consecutive failed sign-in attempts before account is locked. */
export const AUTH_LOCKOUT_MAX_ATTEMPTS = 5;

/**
 * Duration (in seconds) an account remains locked after exceeding
 * AUTH_LOCKOUT_MAX_ATTEMPTS.
 */
export const AUTH_LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes
