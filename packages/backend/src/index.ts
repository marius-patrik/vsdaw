import websocket from "@fastify/websocket";
import Fastify from "fastify";

export async function buildServer() {
  const app = Fastify({ logger: false });
  await app.register(websocket);

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ws", { websocket: true }, (connection) => {
    connection.socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString() : raw.toString();
      connection.socket.send(JSON.stringify({ echo: text }));
    });
  });

  return app;
}

export async function startServer(options: { port?: number; host?: string } = {}) {
  const app = await buildServer();
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const host = options.host ?? "127.0.0.1";
  await app.listen({ port, host });
  return { app, port, host };
}
