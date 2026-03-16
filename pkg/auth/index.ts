export { auth, default } from "./lib/auth.ts";
export {
  authBasePath,
  authRoutePath,
  authHandler,
  registerAuthRoutes,
  getSessionFromHeaders,
  getSessionFromRequest,
} from "./lib/server.ts";
export * as betterAuthNode from "better-auth/node";
