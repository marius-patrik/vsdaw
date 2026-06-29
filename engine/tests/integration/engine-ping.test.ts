import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as net from "node:net";
import * as path from "node:path";

interface EngineReply<T = unknown> {
  id: string;
  inReplyTo: string;
  success: boolean;
  payload?: T;
  error?: { code: string; message: string };
}

function getEngineBinary(): string {
  const fromEnv = process.env.ENGINE_BINARY;
  if (fromEnv) return fromEnv;

  const platform = process.platform;
  const arch = process.arch;
  const target =
    platform === "darwin"
      ? arch === "arm64"
        ? "macos-arm64-release"
        : "macos-x64-release"
      : "linux-x64-release";

  return path.resolve(import.meta.dir, "../../build", target, "singularity-engine");
}

function sendFrame(socket: net.Socket, message: unknown): Promise<void> {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return new Promise((resolve, reject) => {
    socket.write(Buffer.concat([header, payload]), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function readFrame(socket: net.Socket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    socket.once("error", onError);

    const headerHandler = (data: Buffer) => {
      if (data.length < 4) {
        socket.once("data", (more) => headerHandler(Buffer.concat([data, more])));
        return;
      }
      const length = data.readUInt32BE(0);
      const rest = data.subarray(4);
      readPayload(length, rest);
    };

    const readPayload = (length: number, buffered: Buffer) => {
      if (buffered.length < length) {
        socket.once("data", (more) => readPayload(length, Buffer.concat([buffered, more])));
        return;
      }
      socket.removeListener("error", onError);
      const payload = buffered.subarray(0, length);
      resolve(JSON.parse(payload.toString("utf8")));
    };

    socket.once("data", headerHandler);
  });
}

async function waitForPort(proc: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = 0;
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      const match = text.match(/SINGULARITY_PORT=(\d+)/);
      if (match) {
        port = Number.parseInt(match[1], 10);
        resolve(port);
      }
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (port === 0) reject(new Error(`Engine exited before binding (code ${code})`));
    });
  });
}

describe("singularity-engine integration", () => {
  test("engine starts, prints SINGULARITY_PORT and responds to engine.ping", async () => {
    const binary = getEngineBinary();
    const proc = spawn(binary, ["--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });

    let socket: net.Socket | undefined;
    try {
      const port = await waitForPort(proc);
      socket = net.createConnection({ host: "127.0.0.1", port });
      await new Promise<void>((resolve, reject) => {
        socket?.once("connect", resolve);
        socket?.once("error", reject);
      });

      const id = crypto.randomUUID();
      await sendFrame(socket, { id, type: "engine.ping", payload: {} });
      const response = (await readFrame(socket)) as EngineReply<{ version: string }>;
      expect(response.inReplyTo).toBe(id);
      expect(response.success).toBe(true);
      expect(response.payload?.version).toMatch(/^\d+\.\d+\.\d+/);

      await sendFrame(socket, {
        id: crypto.randomUUID(),
        type: "engine.shutdown",
        payload: { force: false },
      });
      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on("exit", resolve);
        setTimeout(() => resolve(null), 2000);
      });
      expect(exitCode).toBe(0);
    } finally {
      socket?.destroy();
      proc.kill();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
});
