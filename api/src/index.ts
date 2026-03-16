import express from "express";
import "dotenv/config";
import { createServer } from "http";
import cron from "node-cron";
import { registerAuthRoutes } from "@hakwa/auth";
import { startNotificationWorker } from "@hakwa/notifications";
import { attachWebSocketServer } from "./websocket.ts";
import { deviceRouter } from "./routes/devices.ts";
import { notificationsRouter } from "./routes/notifications.ts";
import { runReEngagementJob } from "./jobs/reEngagement.ts";

const server = express();
const httpServer = createServer(server);
const port = process.env["PORT"];

// middleware
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// routes
registerAuthRoutes(server);
server.use("/api/devices", deviceRouter);
server.use("/api/notifications", notificationsRouter);

// WebSocket
attachWebSocketServer(httpServer);

// Start the Redis Stream worker
startNotificationWorker().catch((err: unknown) => {
  console.error("[server] notification worker crashed", { err });
  process.exit(1);
});

// Re-engagement cron — daily at 09:00 Fiji time (UTC+12 → 21:00 UTC previous day)
cron.schedule("0 21 * * *", () => {
  runReEngagementJob().catch((err: unknown) => {
    console.error("[cron] re-engagement job failed", { err });
  });
});

// Start the server
httpServer.listen(port, () => {
  console.log("[server] API is running at http://localhost:" + port);
});
