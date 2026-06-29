import { homedir } from "node:os";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import type { WebSocket } from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { settingsRoutes } from "./routes/settings.js";
import { themesRoutes } from "./routes/themes.js";
import { ThemeStore } from "./themes/theme-store.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
}

export interface BuildServerResult {
  app: FastifyInstance;
  store: ThemeStore;
  broadcast: (message: Record<string, unknown>) => void;
}

export async function buildServer(options: ServerOptions = {}): Promise<BuildServerResult> {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  await app.register(websocket);

  const dataDir = options.dataDir ?? join(homedir(), ".singularity");
  const store = new ThemeStore({ dataDir });
  await store.init();

  const connections = new Set<WebSocket>();

  const broadcast = (message: Record<string, unknown>): void => {
    const text = JSON.stringify(message);
    for (const socket of connections) {
      socket.send(text);
    }
  };

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(
    async (instance) => {
      await themesRoutes(instance, store, broadcast);
    },
    { prefix: "/api/v1" },
  );

  await app.register(
    async (instance) => {
      await settingsRoutes(instance, store, broadcast);
    },
    { prefix: "/api/v1" },
  );

  app.get("/ws", { websocket: true }, (socket) => {
    connections.add(socket);
    socket.on("close", () => {
      connections.delete(socket);
    });
  });

  return { app, store, broadcast };
}

export async function startServer(options: ServerOptions = {}) {
  const { app, store, broadcast } = await buildServer(options);
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const host = options.host ?? "127.0.0.1";
  await app.listen({ port, host });
  return { app, port, host, store, broadcast };
}
