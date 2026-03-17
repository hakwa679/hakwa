import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import "dotenv/config";
import { createServer } from "http";
import cron from "node-cron";
import { registerAuthRoutes } from "@hakwa/auth";
import { startNotificationWorker } from "@hakwa/notifications";
import { attachWebSocketServer } from "./websocket.ts";
import { deviceRouter } from "./routes/devices.ts";
import { notificationsRouter } from "./routes/notifications.ts";
import { authRouter } from "./routes/auth.ts";
import { merchantsRouter } from "./routes/merchants.ts";
import { bookingsRouter } from "./routes/bookings.ts";
import { driverRouter } from "./routes/driver.ts";
import { lockoutSignInMiddleware } from "./middleware/lockout.ts";
import { runReEngagementJob } from "./jobs/reEngagement.ts";
import { registerWeeklyPayoutCron } from "./jobs/weeklyPayout.ts";
import { merchantWalletRouter } from "./routes/merchantWallet.ts";
import { merchantPayoutsRouter } from "./routes/merchantPayouts.ts";
import { internalPayoutsRouter } from "./routes/internal/payouts.ts";
import { tripsRouter } from "./routes/trips.ts";
import { meGamificationRouter } from "./routes/meGamification.ts";
import { startGamificationConsumer } from "./jobs/gamificationConsumer.ts";
import { mapRouter } from "./routes/map.ts";
import { mapUploadsRouter } from "./routes/mapUploads.ts";
import { adminMapRouter } from "./routes/adminMap.ts";

const server = express();
const httpServer = createServer(server);
const port = process.env["PORT"];

// middleware
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Lockout check must be registered BEFORE the Better Auth wildcard handler
server.post("/api/auth/sign-in/email", lockoutSignInMiddleware);

// routes
registerAuthRoutes(server);
server.use("/api/auth", authRouter);
server.use("/api/devices", deviceRouter);
server.use("/api/notifications", notificationsRouter);
server.use("/api/merchants", merchantsRouter);
server.use("/api/bookings", bookingsRouter);
server.use("/api/driver", driverRouter);
server.use("/api/merchant/wallet", merchantWalletRouter);
server.use("/api/merchant/payouts", merchantPayoutsRouter);
server.use("/api/internal/payouts", internalPayoutsRouter);
server.use("/api/trips", tripsRouter);
server.use("/api/me/gamification", meGamificationRouter);
server.use("/api/v1/map", mapRouter);
server.use("/api/v1/map/uploads", mapUploadsRouter);
server.use("/api/v1/admin/map", adminMapRouter);

// WebSocket
attachWebSocketServer(httpServer);

// -------------------------------------------------------------------------
// Global error handler — T041/T042
// All errors passed via next(err) are caught here.
// Stack traces are NEVER included in responses (production safety).
// -------------------------------------------------------------------------
server.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : 500;
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code: string }).code
        : "INTERNAL_ERROR";
    const message =
      typeof err === "object" && err !== null && "message" in err
        ? (err as { message: string }).message
        : "An unexpected error occurred";

    // Log the full error server-side (never sent to clients)
    console.error("[api] unhandled error", {
      statusCode,
      code,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    res.status(statusCode).json({ code, message });
  },
);

// Start the Redis Stream worker
startNotificationWorker().catch((err: unknown) => {
  console.error("[server] notification worker crashed", { err });
  process.exit(1);
});

startGamificationConsumer().catch((err: unknown) => {
  console.error("[server] gamification consumer crashed", { err });
  process.exit(1);
});

// Re-engagement cron — daily at 09:00 Fiji time (UTC+12 → 21:00 UTC previous day)
cron.schedule("0 21 * * *", () => {
  runReEngagementJob().catch((err: unknown) => {
    console.error("[cron] re-engagement job failed", { err });
  });
});

registerWeeklyPayoutCron();

// Start the server
httpServer.listen(port, () => {
  console.log("[server] API is running at http://localhost:" + port);
});
