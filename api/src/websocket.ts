import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { getSessionFromRequest } from "@hakwa/auth";
import { redisSubscriber } from "@hakwa/redis";
import db from "@hakwa/db";
import { merchant } from "@hakwa/db/schema";
import { eq } from "drizzle-orm";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>;
type LiveWebSocket = WebSocket & { isAlive: boolean };

const HEARTBEAT_INTERVAL_MS: number = 30_000;

/** Map of userId → set of active WebSocket connections for that user. */
const userConnections = new Map<string, Set<LiveWebSocket>>();

/**
 * Map of Redis channel → Set of WebSocket clients subscribed to that channel.
 * Used for booking status/location fan-out.
 */
const channelSubscriptions = new Map<string, Set<LiveWebSocket>>();
const merchantUsers = new Map<string, Set<string>>();

const markConnectionAlive = (ws: LiveWebSocket) => {
  ws.isAlive = true;
};

/**
 * Subscribe a WebSocket client to a Redis channel for booking events.
 * Ensures Redis subscription is created on first subscriber.
 */
function subscribeClientToChannel(ws: LiveWebSocket, channel: string): void {
  if (!channelSubscriptions.has(channel)) {
    channelSubscriptions.set(channel, new Set());
    redisSubscriber.subscribe(channel, (err) => {
      if (err) {
        console.error("[ws] redis subscribe error", { channel, err });
      }
    });
  }
  channelSubscriptions.get(channel)!.add(ws);
}

/**
 * Unsubscribe a WebSocket client from all booking channels it joined.
 * Cleans up the Redis subscription when no clients remain.
 */
function unsubscribeClientFromAllChannels(ws: LiveWebSocket): void {
  for (const [channel, clients] of channelSubscriptions) {
    if (clients.has(ws)) {
      clients.delete(ws);
      if (clients.size === 0) {
        channelSubscriptions.delete(channel);
        redisSubscriber.unsubscribe(channel, (err) => {
          if (err) {
            console.error("[ws] redis unsubscribe error", { channel, err });
          }
        });
      }
    }
  }
}

const handleConnection = (
  ws: WebSocket,
  request: IncomingMessage,
  session: Session,
) => {
  const liveSocket = ws as LiveWebSocket;
  const userId = session.user.id;

  liveSocket.isAlive = true;
  liveSocket.on("pong", () => {
    markConnectionAlive(liveSocket);
  });

  // Register connection
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
    // Subscribe to this user's notification channel on first connection
    const notifChannel = `user:${userId}:notifications`;
    const gamificationChannel = `user:${userId}:gamification`;
    const reviewRevealChannel = `review:revealed:${userId}`;
    redisSubscriber.subscribe(notifChannel, (err) => {
      if (err) {
        console.error("[ws] redis subscribe error", {
          event: "ws.subscribed",
          userId,
          err,
        });
      } else {
        console.info("[ws] subscribed to notification channel", {
          event: "ws.subscribed",
          userId,
          channel: notifChannel,
        });
      }
    });
    redisSubscriber.subscribe(gamificationChannel, (err) => {
      if (err) {
        console.error("[ws] redis subscribe error", {
          event: "ws.subscribed",
          userId,
          err,
        });
      } else {
        console.info("[ws] subscribed to gamification channel", {
          event: "ws.subscribed",
          userId,
          channel: gamificationChannel,
        });
      }
    });
    redisSubscriber.subscribe(reviewRevealChannel, (err) => {
      if (err) {
        console.error("[ws] redis subscribe error", {
          event: "ws.subscribed",
          userId,
          err,
        });
      } else {
        console.info("[ws] subscribed to review reveal channel", {
          event: "ws.subscribed",
          userId,
          channel: reviewRevealChannel,
        });
      }
    });

    // For drivers, also subscribe to their booking offer channel so dispatch
    // offers are pushed in real-time via WebSocket.
    const userRole = (session.user as Record<string, unknown>)["role"] as
      | string
      | undefined;
    if (userRole === "driver") {
      const offerChannel = `driver:${userId}:offer`;
      redisSubscriber.subscribe(offerChannel, (err) => {
        if (err) {
          console.error("[ws] redis subscribe error (offer channel)", {
            userId,
            offerChannel,
            err,
          });
        }
      });
    }

    // T016: For merchants, subscribe to wallet updates keyed by merchant.id.
    if (userRole === "merchant") {
      void (async () => {
        const [merchantRow] = await db
          .select({ id: merchant.id })
          .from(merchant)
          .where(eq(merchant.userId, userId))
          .limit(1);

        if (!merchantRow) return;

        if (!merchantUsers.has(merchantRow.id)) {
          merchantUsers.set(merchantRow.id, new Set());
        }
        merchantUsers.get(merchantRow.id)!.add(userId);

        const walletChannel = `wallet:updated:${merchantRow.id}`;
        redisSubscriber.subscribe(walletChannel, (err) => {
          if (err) {
            console.error("[ws] redis subscribe error (wallet channel)", {
              userId,
              walletChannel,
              err,
            });
          }
        });
      })().catch((err: unknown) => {
        console.error("[ws] merchant wallet subscription lookup failed", {
          userId,
          err,
        });
      });
    }
  }

  userConnections.get(userId)!.add(liveSocket);

  ws.send(
    JSON.stringify({
      type: "connection.ready",
      userId: session.user.id,
      sessionId: session.session.id,
    }),
  );

  ws.on("message", (message: RawData, isBinary: boolean) => {
    if (isBinary) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message.toString());
    } catch {
      return; // ignore malformed messages
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>)["type"] === "subscribe" &&
      (parsed as Record<string, unknown>)["channel"] === "trip"
    ) {
      const tripId = (parsed as Record<string, unknown>)["tripId"];
      if (typeof tripId === "string" && tripId.length > 0) {
        // Only allow subscribing to trips owned by this user — enforced in
        // the route handler before the WebSocket upgrade; here we register.
        subscribeClientToChannel(liveSocket, `booking:${tripId}:status`);
        subscribeClientToChannel(liveSocket, `booking:${tripId}:location`);
        ws.send(
          JSON.stringify({ type: "subscribed", channel: "trip", tripId }),
        );
      }
      return;
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>)["type"] === "unsubscribe" &&
      (parsed as Record<string, unknown>)["channel"] === "trip"
    ) {
      const tripId = (parsed as Record<string, unknown>)["tripId"];
      if (typeof tripId === "string") {
        const clients1 = channelSubscriptions.get(`booking:${tripId}:status`);
        clients1?.delete(liveSocket);
        const clients2 = channelSubscriptions.get(`booking:${tripId}:location`);
        clients2?.delete(liveSocket);
      }
      return;
    }
  });

  ws.on("error", (error: Error) => {
    console.error("[ws] connection error", {
      error,
      userId: session.user.id,
      url: request.url,
    });
  });

  ws.on("close", () => {
    unsubscribeClientFromAllChannels(liveSocket);

    const conns = userConnections.get(userId);
    if (conns) {
      conns.delete(liveSocket);
      if (conns.size === 0) {
        userConnections.delete(userId);
        // Unsubscribe once the last connection for this user closes
        const notificationChannel = `user:${userId}:notifications`;
        const gamificationChannel = `user:${userId}:gamification`;
        const reviewRevealChannel = `review:revealed:${userId}`;
        redisSubscriber.unsubscribe(notificationChannel, (err) => {
          if (err) {
            console.error("[ws] redis unsubscribe error", { userId, err });
          } else {
            console.info("[ws] unsubscribed from notification channel", {
              event: "ws.unsubscribed",
              userId,
              channel: notificationChannel,
            });
          }
        });
        redisSubscriber.unsubscribe(gamificationChannel, (err) => {
          if (err) {
            console.error("[ws] redis unsubscribe error", { userId, err });
          } else {
            console.info("[ws] unsubscribed from gamification channel", {
              event: "ws.unsubscribed",
              userId,
              channel: gamificationChannel,
            });
          }
        });
        redisSubscriber.unsubscribe(reviewRevealChannel, (err) => {
          if (err) {
            console.error("[ws] redis unsubscribe error", { userId, err });
          } else {
            console.info("[ws] unsubscribed from review reveal channel", {
              event: "ws.unsubscribed",
              userId,
              channel: reviewRevealChannel,
            });
          }
        });

        // Cleanup merchant mapping and wallet channel subscription when no
        // users remain for the merchant id.
        for (const [merchantId, users] of merchantUsers) {
          if (users.has(userId)) {
            users.delete(userId);
            if (users.size === 0) {
              merchantUsers.delete(merchantId);
              redisSubscriber.unsubscribe(`wallet:updated:${merchantId}`);
            }
          }
        }
      }
    }
    console.log("[ws] connection closed", {
      userId: session.user.id,
      url: request.url,
    });
  });
};

/**
 * Relay incoming Redis pub/sub messages to all connected WebSocket clients
 * for that user (notifications) or subscribed to that booking channel.
 */
redisSubscriber.on("message", (channel: string, message: string) => {
  // 1. booking:{tripId}:status and booking:{tripId}:location fan-out
  const bookingMatch = /^booking:[^:]+:(status|location)$/.exec(channel);
  if (bookingMatch) {
    const clients = channelSubscriptions.get(channel);
    if (clients && clients.size > 0) {
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
          ws.send(message);
        }
      }
    }
    return;
  }

  // 2. driver:{userId}:offer — push booking offer to connected driver
  const driverOfferMatch = /^driver:(.+):offer$/.exec(channel);
  if (driverOfferMatch) {
    const offerUserId = driverOfferMatch[1];
    if (offerUserId) {
      const conns = userConnections.get(offerUserId);
      if (conns && conns.size > 0) {
        for (const ws of conns) {
          if (ws.readyState === ws.OPEN) {
            ws.send(message);
          }
        }
      }
    }
    return;
  }

  // 3. T016: wallet:updated:{merchantId} — push balance_updated to merchant client
  const walletMatch = /^wallet:updated:(.+)$/.exec(channel);
  if (walletMatch) {
    const merchantId = walletMatch[1];
    if (merchantId) {
      const users = merchantUsers.get(merchantId);
      if (!users || users.size === 0) return;

      for (const userId of users) {
        const conns = userConnections.get(userId);
        if (!conns || conns.size === 0) continue;
        for (const ws of conns) {
          if (ws.readyState === ws.OPEN) {
            ws.send(message);
          }
        }
      }
    }
    return;
  }

  // 4. user:{userId}:notifications or user:{userId}:gamification fan-out
  const match = /^user:(.+):notifications$/.exec(channel);
  const gamificationMatch = /^user:(.+):gamification$/.exec(channel);
  const reviewRevealMatch = /^review:revealed:(.+)$/.exec(channel);
  const userId = match?.[1] ?? gamificationMatch?.[1] ?? reviewRevealMatch?.[1];
  if (!userId) return;

  const conns = userConnections.get(userId);
  if (!conns || conns.size === 0) return;

  for (const ws of conns) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
});

export const attachWebSocketServer = (httpServer: HttpServer) => {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const liveSocket = client as LiveWebSocket;

      if (!liveSocket.isAlive) {
        console.warn("[ws] terminating stale connection");
        liveSocket.terminate();
        continue;
      }

      liveSocket.isAlive = false;
      liveSocket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  const heartbeatTimer = heartbeatInterval as unknown as {
    unref?: () => void;
  };
  heartbeatTimer.unref?.();

  wss.on("connection", handleConnection);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  httpServer.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  httpServer.on("upgrade", async (request, socket, head) => {
    const session = await getSessionFromRequest(request);

    if (!session) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, session);
    });
  });

  return wss;
};
