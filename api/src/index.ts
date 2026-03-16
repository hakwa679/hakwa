import express from "express";
import "dotenv/config";
import { createServer } from "http";
import { registerAuthRoutes } from "@hakwa/auth";
import { attachWebSocketServer } from "./websocket.ts";

const server = express();
const httpServer = createServer(server);
const port = process.env.PORT;

// middleware
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

registerAuthRoutes(server);
attachWebSocketServer(httpServer);

// Start the server
httpServer.listen(port, () => {
  console.log("[server] API is running at http://localhost:" + port);
});
