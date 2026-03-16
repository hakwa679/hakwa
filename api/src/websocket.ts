import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { getSessionFromRequest } from "@hakwa/auth";

type Session = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>;
type LiveWebSocket = WebSocket & { isAlive: boolean };

const HEARTBEAT_INTERVAL_MS: number = 30_000;

const markConnectionAlive = (ws: LiveWebSocket) => {
  ws.isAlive = true;
};

const handleConnection = (
  ws: WebSocket,
  request: IncomingMessage,
  session: Session,
) => {
  const liveSocket = ws as LiveWebSocket;

  liveSocket.isAlive = true;
  liveSocket.on("pong", () => {
    markConnectionAlive(liveSocket);
  });

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
    console.log("[ws] connection closed", {
      userId: session.user.id,
      url: request.url,
    });
  });
};

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
