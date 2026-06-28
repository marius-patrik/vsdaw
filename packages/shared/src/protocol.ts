export interface CommandEnvelope<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

export interface CommandResult<T = unknown> {
  ok: boolean;
  error?: string;
  result?: T;
}

export type BackendEvent =
  | { type: "engineReady" }
  | { type: "transport"; state: import("./types.js").TransportState }
  | { type: "state"; state: import("./types.js").ProjectState }
  | { type: "meters"; meters: Record<string, number> }
  | { type: "error"; message: string };

export interface BackendClient {
  isReady(): boolean;
  sendCommand<T = unknown>(type: string, payload?: unknown): Promise<T>;
  subscribe(callback: (event: BackendEvent) => void): () => void;
  dispose(): void;
}

export const BackendEventType = {
  EngineReady: "engineReady",
  Transport: "transport",
  State: "state",
  Meters: "meters",
  Error: "error",
} as const;
