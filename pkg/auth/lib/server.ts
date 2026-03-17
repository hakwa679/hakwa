import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import auth from "./auth.ts";
import { toNodeHandler } from "better-auth/node";

export const authBasePath = "/api/auth";
export const authRoutePath = `${authBasePath}/*splat`;
export const authHandler = toNodeHandler(auth);

type AuthRouteApp = {
  all: (
    path: string,
    handler: (
      request: IncomingMessage,
      response: ServerResponse,
    ) => Promise<void>,
  ) => unknown;
};

export const registerAuthRoutes = (app: AuthRouteApp, path = authRoutePath) =>
  app.all(path, authHandler);

export const getSessionFromHeaders = (headers: IncomingHttpHeaders) =>
  auth.api.getSession({
    headers: new Headers(normalizeHeaders(headers)),
  });

const normalizeHeaders = (
  headers: IncomingHttpHeaders,
): Record<string, string> => {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(", ");
    }
  }

  return normalized;
};

export const getSessionFromRequest = (
  request: Pick<IncomingMessage, "headers">,
) => getSessionFromHeaders(request.headers);
