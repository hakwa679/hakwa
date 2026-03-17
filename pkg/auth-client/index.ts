import {
  createAuthClient,
  type BetterAuthClientOptions,
} from "better-auth/client";

export const authBasePath = "/api/auth";

export type HakwaAuthClient = ReturnType<typeof createAuthClient>;

export const createHakwaAuthClient = (
  options?: BetterAuthClientOptions,
): HakwaAuthClient =>
  createAuthClient({
    baseURL: authBasePath,
    ...options,
  });

export const authClient = createHakwaAuthClient();

export { createAuthClient };
export type { BetterAuthClientOptions };
