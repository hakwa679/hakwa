import { createAuthClient } from "better-auth/client";
import type { AuthClient, BetterAuthClientOptions } from "better-auth/client";

export const authBasePath = "/api/auth";

export const createHakwaAuthClient = (
  options?: BetterAuthClientOptions,
): AuthClient<BetterAuthClientOptions> =>
  createAuthClient({
    baseURL: authBasePath,
    ...options,
  });

export const authClient: AuthClient<BetterAuthClientOptions> =
  createHakwaAuthClient();

export { createAuthClient };
export type { AuthClient, BetterAuthClientOptions };
