import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { getSessionFromRequest } from "@hakwa/auth";
import { redisSubscriber } from "@hakwa/redis";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>;
type LiveWebSocket = WebSocket & { isAlive: boolean };

const HEARTBEAT_INTERVAL_MS: number = 30_000;

/** Map of userId → set of active WebSocket connections for that user. */
const userConnections = new Map<string, Set<LiveWebSocket>>();

const markConnectionAlive = (ws: LiveWebSocket) => {
  ws.isAlive = true;
};

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
    const channel = `user:${userId}:notifications`;
    redisSubscriber.subscribe(channel, (err) => {
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
          channel,
        });
      }
    });
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
    ws.send(message, { binary: isBinary });
  });

  ws.on("error", (error: Error) => {
    console.error("[ws] connection error", {
      error,
      userId: session.user.id,
      url: request.url,
    });
  });

  ws.on("close", () => {
    const conns = userConnections.get(userId);
    if (conns) {
      conns.delete(liveSocket);
      if (conns.size === 0) {
        userConnections.delete(userId);
        // Unsubscribe once the last connection for this user closes
        const channel = `user:${userId}:notifications`;
        redisSubscriber.unsubscribe(channel, (err) => {
          if (err) {
            console.error("[ws] redis unsubscribe error", { userId, err });
          } else {
            console.info("[ws] unsubscribed from notification channel", {
              event: "ws.unsubscribed",
              userId,
              channel,
            });
          }
        });
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
 * for that user.
 */
redisSubscriber.on("message", (channel: string, message: string) => {
  // channel format: user:{userId}:notifications
  const match = /^user:(.+):notifications$/.exec(channel);
  if (!match?.[1]) return;

  const userId = match[1];
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

  heartbeatInterval.unref();

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
