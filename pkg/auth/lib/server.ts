import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import auth from "./auth.ts";
import * as betterAuthNode from "better-auth/node";

export const authBasePath = "/api/auth";
export const authRoutePath = `${authBasePath}/*splat`;
export const authHandler = betterAuthNode.toNodeHandler(auth);

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
    headers: betterAuthNode.fromNodeHeaders(headers),
  });

export const getSessionFromRequest = (
  request: Pick<IncomingMessage, "headers">,
) => getSessionFromHeaders(request.headers);
