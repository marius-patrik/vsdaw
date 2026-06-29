import { randomUUID } from "node:crypto";
import { type Socket, connect } from "node:net";
import {
  type EngineEvent,
  type EngineMessage,
  type EngineReply,
  parseEngineFrames,
  serializeEngineFrame,
} from "@singularity/shared";

export interface EngineBridgeOptions {
  host: string;
  port: number;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  onStatusChange: (connected: boolean) => void;
}

export interface EngineBridge {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send<T = unknown>(type: string, payload: unknown, timeoutMs?: number): Promise<EngineReply<T>>;
  onEvent(handler: (event: EngineEvent) => void): () => void;
}

interface InFlight {
  resolve: (reply: EngineReply<unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createEngineBridge(options: EngineBridgeOptions): EngineBridge {
  let socket: Socket | undefined;
  let connected = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;
  let receiveBuffer = Buffer.alloc(0);
  const inFlight = new Map<string, InFlight>();
  const eventHandlers = new Set<(event: EngineEvent) => void>();
  let destroyed = false;

  const setConnected = (value: boolean): void => {
    if (connected !== value) {
      connected = value;
      options.onStatusChange(value);
    }
  };

  const clearHeartbeat = (): void => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
    heartbeatTimer = undefined;
    heartbeatTimeout = undefined;
  };

  const startHeartbeat = (): void => {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!connected || !socket) return;
      sendRaw({ id: randomUUID(), type: "ping", payload: {} });
      heartbeatTimeout = setTimeout(() => {
        socket?.destroy();
        setConnected(false);
        scheduleReconnect();
      }, options.heartbeatIntervalMs * 2);
    }, options.heartbeatIntervalMs);
  };

  const scheduleReconnect = (): void => {
    if (destroyed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void tryConnect();
    }, options.reconnectIntervalMs);
  };

  const tryConnect = async (): Promise<void> => {
    if (destroyed || connected) return;
    return new Promise<void>((resolve) => {
      const newSocket = connect({ host: options.host, port: options.port }, () => {
        socket = newSocket;
        receiveBuffer = Buffer.alloc(0);
        setConnected(true);
        startHeartbeat();
        resolve();
      });
      newSocket.on("data", (data) => {
        receiveBuffer = Buffer.concat([receiveBuffer, data]);
        const { messages, replies, events, remainder } = parseEngineFrames(
          new Uint8Array(receiveBuffer.buffer, receiveBuffer.byteOffset, receiveBuffer.length),
        );
        receiveBuffer = Buffer.from(remainder);
        for (const message of messages) {
          if (message.type === "pong" && heartbeatTimeout) {
            clearTimeout(heartbeatTimeout);
            heartbeatTimeout = undefined;
          }
        }
        for (const reply of replies) {
          const flight = inFlight.get(reply.inReplyTo);
          if (flight) {
            inFlight.delete(reply.inReplyTo);
            clearTimeout(flight.timer);
            flight.resolve(reply as EngineReply<unknown>);
          }
        }
        for (const event of events) {
          for (const handler of eventHandlers) {
            try {
              handler(event);
            } catch {
              // Ignore handler errors.
            }
          }
        }
      });
      newSocket.on("error", () => {
        setConnected(false);
        scheduleReconnect();
        resolve();
      });
      newSocket.on("close", () => {
        setConnected(false);
        clearHeartbeat();
        scheduleReconnect();
        resolve();
      });
    });
  };

  const sendRaw = (message: EngineMessage): void => {
    if (!socket || !connected) {
      throw Object.assign(new Error("Engine not connected"), { code: "ERR_ENGINE_NOT_CONNECTED" });
    }
    socket.write(serializeEngineFrame(message));
  };

  const bridge: EngineBridge = {
    get connected() {
      return connected;
    },
    async connect(): Promise<void> {
      if (destroyed) throw new Error("Bridge destroyed");
      if (connected) return;
      return tryConnect();
    },
    async disconnect(): Promise<void> {
      destroyed = true;
      clearHeartbeat();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      for (const flight of inFlight.values()) {
        clearTimeout(flight.timer);
        flight.reject(
          Object.assign(new Error("Engine disconnected"), { code: "ERR_ENGINE_NOT_CONNECTED" }),
        );
      }
      inFlight.clear();
      socket?.end();
      socket = undefined;
      setConnected(false);
    },
    async send<T = unknown>(
      type: string,
      payload: unknown,
      timeoutMs = 5000,
    ): Promise<EngineReply<T>> {
      if (!connected) {
        throw Object.assign(new Error("Engine not connected"), {
          code: "ERR_ENGINE_NOT_CONNECTED",
        });
      }
      const id = randomUUID();
      return new Promise<EngineReply<T>>((resolve, reject) => {
        const timer = setTimeout(() => {
          inFlight.delete(id);
          reject(
            Object.assign(new Error("Engine command timeout"), { code: "ERR_ENGINE_TIMEOUT" }),
          );
        }, timeoutMs);
        inFlight.set(id, {
          resolve: (reply) => resolve(reply as EngineReply<T>),
          reject,
          timer,
        });
        try {
          sendRaw({ id, type, payload });
        } catch (err) {
          clearTimeout(timer);
          inFlight.delete(id);
          reject(err);
        }
      });
    },
    onEvent(handler: (event: EngineEvent) => void): () => void {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
  };

  return bridge;
}
