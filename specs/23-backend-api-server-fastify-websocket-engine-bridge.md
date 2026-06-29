# Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)

## Objective

Define the complete Bun/Fastify backend for Singularity v1.0: an HTTP/WebSocket API server that hosts the authoritative in-memory project model, persists `.singularity` bundles, bridges UI and agent commands to the JUCE engine over a local TCP/socket protocol, serves the web UI, and exposes the project surface to the MCP server, CLI, terminal, and Monaco file API.

## Motivation

The Singularity UI (Tauri desktop and web app), the AI agent system, the CLI, and the MCP server all need a single, stable, type-safe surface to read and mutate project state and to control the JUCE audio engine. A Fastify backend with WebSocket real-time sync provides one universal API while isolating the UI from engine lifecycle, audio thread details, and native file system operations. The engine bridge decouples the TypeScript backend from the C++ engine so both can evolve independently.

## Scope

### In scope

- Fastify HTTP server with route registration, error handling, request logging, and graceful shutdown.
- WebSocket server (`@fastify/websocket`) for bidirectional UI sync: RPC-style commands, real-time engine event broadcasting, and session lifecycle.
- Authoritative in-memory project model loaded from / saved to `.singularity` ZIP bundles.
- Engine bridge: TCP/socket client to the JUCE engine with length-prefixed JSON framing, command queue, reconnection, and heartbeat.
- Translation of backend project mutations into engine command messages and streaming of engine state (transport, meters, playhead) to UI subscribers.
- Static asset serving for the web app and desktop UI bundles.
- File API for Monaco file explorer: read/write/list/delete/rename within allowed roots.
- Terminal PTY session spawning and streaming over dedicated WebSocket subprotocols.
- Headless browser session lifecycle proxy for the embedded browser tab.
- Agent tool dispatch endpoint and WebSocket stream for skill execution.
- MCP server transport endpoints: stdio JSON-RPC and Server-Sent Events (SSE).
- Plugin database persistence (JSON) after engine scan results are received.
- Health, version, and telemetry endpoints.

### Out of scope

- JUCE engine internals, realtime audio callback, plugin hosting DSP (Spec 20: JUCE Audio Engine Foundation).
- Shared Zod schema definitions (Spec 19: Shared Protocol and Schemas).
- Agent skill definitions, LLM adapters, and chat session UI (Spec 35: AI Agent System).
- Tauri desktop shell, auto-updater, multi-window management (Spec 17: Singularity v1.0 Standalone App Architecture and Spec 25: Dockview Layout and Shell Panels).
- UI panels for mixer, piano roll, playlist, channel rack, browser, graph (Specs 26–30).
- Monaco editor UI, integrated terminal UI, and embedded browser UI (Spec 35: AI Agent System).

## Related decisions

- 2026-06-25 — Backend framework: Fastify + `@fastify/websocket`.
- 2026-06-25 — Backend-to-engine transport: local TCP/socket.
- 2026-06-25 — Project format: `.singularity` ZIP bundle.
- 2026-06-25 — AI agent context and control: every backend API exposed as a tool/skill.
- 2026-06-25 — Integrated terminal backend: xterm.js UI backed by PTY proxy in backend.
- 2026-06-25 — MCP server transport: stdio + SSE.
- 2026-06-25 — Quality bar: no stubs, no placeholders, no skipped features.
- 2026-06-25 — Execution order: backend API contract before UI panels that depend on it.
- 2026-06-25 — VS Code extension dropped from v1.0.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Consumers                                    │
│  Web App │ Tauri UI │ CLI │ MCP client │ Agent runtime          │
└──────────┬──────────┬─────┬────────────┬────────────────────────┘
           │          │     │            │
           └──────────┴─────┴────────────┘
                      │ HTTP / WebSocket
        ┌─────────────▼──────────────┐
        │   packages/backend         │
        │  Fastify HTTP/WS server    │
        │  Project model manager     │
        │  Engine bridge (TCP)       │
        │  Agent tool dispatcher     │
        │  File / terminal / browser │
        └─────────────┬──────────────┘
                      │ local TCP/socket
        ┌─────────────▼──────────────┐
        │   engine/ (JUCE C++)       │
        │  Audio I/O │ Plugin host   │
        │  Mixer │ Transport │ MIDI  │
        └────────────────────────────┘
```

The backend is the single source of truth for the project document while the engine is the source of truth for runtime audio state. Mutations flow downward: consumer → backend → engine. Runtime state flows upward: engine → backend → WebSocket subscribers. The backend never blocks the audio thread; all engine communication is asynchronous.

### Data model

All JSON schemas live in `packages/shared`. The backend imports and validates them at runtime.

#### Project document (canonical in-memory model)

The canonical `Project` schema lives in `packages/shared` (Spec 19). The backend imports and validates it; the in-memory model has these top-level fields:

```ts
// packages/shared/src/schemas/project.ts
import { ProjectSchema } from '@singularity/shared';
import type { Project } from '@singularity/shared';

// Top-level project fields:
// id, name, createdAt, modifiedAt, bpm, timeSignature, sampleRate,
// settings, channelRack, patterns, playlist, mixer, routing,
// automationClips, assets
//
// Plugin instances are nested inside channelRack.channels[].settings.plugin
// and mixer.inserts[].pluginSlots[].plugin. There is no top-level
// pluginInstances or automationTargets array.
```

#### Message envelope (UI ⇄ backend)

```ts
// packages/shared/src/messages.ts
export const MessageSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
});

export const ReplySchema = z.object({
  id: z.string().uuid(),
  type: z.literal('reply'),
  inReplyTo: z.string().uuid(),
  success: z.boolean(),
  payload: z.unknown().optional(),
  error: z.optional(z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() })),
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('event'),
  topic: z.string(),
  payload: z.unknown(),
});

export type Message = z.infer<typeof MessageSchema>;
export type Reply = z.infer<typeof ReplySchema>;
export type Event = z.infer<typeof EventSchema>;
```

#### Engine command frame (backend ⇄ engine)

```ts
// packages/shared/src/engine.ts
export const EngineFrameSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
});

export const EngineReplySchema = z.object({
  id: z.string().uuid(),
  inReplyTo: z.string().uuid(),
  success: z.boolean(),
  payload: z.unknown().optional(),
  error: z.optional(z.object({ code: z.string(), message: z.string() })),
});

export const EngineEventSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('event'),
  topic: z.enum(['transport', 'meter', 'error', 'pluginScan', 'renderProgress']),
  payload: z.unknown(),
});
```

#### Plugin database entry

```ts
// packages/shared/src/plugins.ts
export const PluginFormatSchema = z.enum(['vst3', 'au', 'clap', 'lv2', 'aax']);

export const PluginInfoSchema = z.object({
  id: z.string().uuid(),
  format: PluginFormatSchema,
  path: z.string(),
  name: z.string(),
  vendor: z.string(),
  category: z.string(),
  isInstrument: z.boolean(),
  version: z.string(),
  uniqueId: z.string(),
  scannedAt: z.string().datetime(),
});

export type PluginInfo = z.infer<typeof PluginInfoSchema>;
```

### API / interface

#### Server bootstrap

```ts
// packages/backend/src/server.ts
export interface ServerOptions {
  httpPort: number;
  httpHost: string;
  engineHost: string;
  enginePort: number;
  staticRoot: string;
  dataDir: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance>;
export async function startServer(server: FastifyInstance): Promise<void>;
export async function closeServer(server: FastifyInstance): Promise<void>;
```

#### HTTP routes

| Method | Route | Purpose | Request | Response |
|---|---|---|---|---|
| GET | `/health` | Liveness + engine connection status | — | `{ status: 'ok' \| 'degraded', engineConnected: boolean, version: string }` |
| GET | `/version` | Backend and protocol version | — | `{ backend: string, protocol: string, engineProtocol: string }` |
| POST | `/projects` | Create empty project | `CreateProjectRequest` | `Project` |
| GET | `/projects/:id` | Load project metadata (no assets) | — | `Project` |
| PUT | `/projects/:id` | Update project metadata | `ProjectMetadataPatch` | `Project` |
| DELETE | `/projects/:id` | Close project without saving | — | `204` |
| POST | `/projects/:id/open` | Open `.singularity` bundle from disk | `{ path: string }` | `Project` |
| POST | `/projects/:id/save` | Save project bundle to disk | `{ path?: string }` | `{ path: string, sizeBytes: number }` |
| POST | `/projects/:id/save-as` | Save project bundle under new path | `{ path: string }` | `{ path: string, sizeBytes: number }` |
| POST | `/projects/:id/undo` | Undo last mutation | — | `HistoryResult` |
| POST | `/projects/:id/redo` | Redo last mutation | — | `HistoryResult` |
| GET | `/projects/:id/history` | List undo/redo stack lengths | — | `{ undoCount: number, redoCount: number }` |
| POST | `/engine/connect` | Connect/reconnect to engine | — | `{ connected: boolean, latencyMs: number }` |
| POST | `/engine/disconnect` | Disconnect from engine | — | `204` |
| GET | `/engine/status` | Engine status and audio device info | — | `EngineStatus` |
| POST | `/engine/devices/scan` | Trigger plugin scan | `{ formats?: PluginFormat[], paths?: string[] }` | `{ scanId: string }` |
| GET | `/plugins` | List scanned plugins | query: `?format=&instrument=` | `PluginInfo[]` |
| POST | `/plugins/scan-results/:scanId` | (internal) Ingest engine scan results | `PluginInfo[]` | `204` |
| POST | `/render` | Start offline render | `RenderRequest` | `{ renderId: string }` |
| GET | `/render/:id/progress` | Render progress SSE | — | SSE stream |
| POST | `/render/:id/cancel` | Cancel render | — | `204` |
| GET | `/files` | List allowed roots | — | `FileRoot[]` |
| GET | `/files/list` | List directory | query: `?root=&path=` | `FileEntry[]` |
| POST | `/files/read` | Read file bytes/text | `{ root: string, path: string, encoding?: 'utf8' \| 'base64' }` | `{ content: string }` |
| POST | `/files/write` | Write file | `{ root: string, path: string, content: string, encoding?: 'utf8' \| 'base64' }` | `204` |
| POST | `/files/rename` | Rename file/dir | `{ root: string, path: string, newName: string }` | `204` |
| POST | `/files/delete` | Delete file/dir | `{ root: string, path: string }` | `204` |
| POST | `/files/mkdir` | Create directory | `{ root: string, path: string }` | `204` |
| POST | `/agent/tools` | Execute a single agent tool | `{ name: string, arguments: unknown, requestId: string }` | `{ requestId: string, result: unknown }` |
| POST | `/agent/sessions` | Create agent session | `{ sessionId?: string }` | `{ sessionId: string }` |
| DELETE | `/agent/sessions/:id` | Destroy agent session | — | `204` |
| POST | `/browser/sessions` | Create headless browser session | `{ sessionId?: string, url?: string }` | `{ sessionId: string }` |
| DELETE | `/browser/sessions/:id` | Destroy browser session | — | `204` |
| POST | `/browser/sessions/:id/navigate` | Navigate to URL | `{ url: string }` | `{ title: string, url: string }` |
| POST | `/browser/sessions/:id/action` | Click/type/fill | `BrowserAction` | `{ success: boolean }` |
| GET | `/browser/sessions/:id/content` | Get page text content | — | `{ title: string, content: string }` |
| GET | `/mcp/sse` | MCP SSE transport endpoint | — | SSE stream |
| POST | `/mcp/messages` | MCP HTTP POST fallback for SSE clients | JSON-RPC 2.0 | JSON-RPC 2.0 |

#### WebSocket connection

Route: `/ws`

The WebSocket accepts JSON messages and emits `Reply` and `Event` frames. Connection handshake requires a `session-id` header/query parameter. Each connection is associated with at most one active project id, set by the `project.subscribe` message.

```ts
// Connection lifecycle messages
interface SubscribeProject {
  projectId: string;
}

interface UnsubscribeProject {
  projectId: string;
}
```

All project mutations must be sent as WebSocket messages with a unique `id`. The backend replies with `type: 'reply'` and broadcasts the resulting event to all subscribers of the same project. Engine events are forwarded to subscribers automatically.

Example mutation flow:

```json
// UI → backend
{ "id": "msg-1", "type": "channel.create", "payload": { "name": "Kick", "type": "sampler" } }

// backend → UI (reply)
{ "id": "rep-1", "type": "reply", "inReplyTo": "msg-1", "success": true, "payload": { "channelId": "chan-1" } }

// backend → all project subscribers (event)
{ "id": "evt-1", "type": "event", "topic": "project.mutation", "payload": { "mutation": "channel.create", "channelId": "chan-1" } }
```

#### Dedicated WebSocket subprotocols

| Path | Subprotocol | Purpose |
|---|---|---|
| `/ws/terminal/:sessionId` | `singularity-terminal` | Bidirectional raw PTY I/O. Text frames are terminal input/output; binary frames are flow-control/resizing. |
| `/ws/agent/:sessionId` | `singularity-agent` | Agent skill execution stream and incremental results. |

#### Engine bridge

```ts
// packages/backend/src/engine-bridge.ts
export interface EngineBridge {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send<T = unknown>(type: string, payload: unknown, timeoutMs?: number): Promise<EngineReply<T>>;
  onEvent(handler: (event: EngineEvent) => void): () => void;
}

export function createEngineBridge(options: {
  host: string;
  port: number;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  onStatusChange: (connected: boolean) => void;
}): EngineBridge;
```

TCP framing: each frame is a 4-byte big-endian length prefix followed by UTF-8 JSON. Maximum frame size is 16 MiB. The bridge maintains an in-flight command map keyed by frame id and rejects commands with `ENGINE_TIMEOUT` if no reply arrives within `timeoutMs`.

Heartbeat: the bridge sends `type: 'ping'` every `heartbeatIntervalMs` and expects `type: 'pong'` within twice that interval. Missing pong triggers reconnection.

Engine command categories:

```ts
type EngineCommandType =
  | 'transport.play'
  | 'transport.stop'
  | 'transport.pause'
  | 'transport.seek'
  | 'transport.setLoop'
  | 'transport.setBpm'
  | 'transport.setTimeSignature'
  | 'channel.create'
  | 'channel.delete'
  | 'channel.update'
  | 'pattern.create'
  | 'pattern.delete'
  | 'pattern.update'
  | 'clip.create'
  | 'clip.delete'
  | 'clip.update'
  | 'mixer.insert.create'
  | 'mixer.insert.delete'
  | 'mixer.insert.update'
  | 'plugin.load'
  | 'plugin.unload'
  | 'plugin.setState'
  | 'plugin.setParameter'
  | 'device.scanPlugins'
  | 'audio.setDevice'
  | 'render.start'
  | 'render.cancel'
  | 'recording.start'
  | 'recording.stop';
```

### Project persistence

```ts
// packages/backend/src/project-store.ts
export interface ProjectStore {
  create(name: string): Project;
  open(bundlePath: string): Promise<Project>;
  save(projectId: string, bundlePath?: string): Promise<{ path: string; sizeBytes: number }>;
  close(projectId: string, save?: boolean): Promise<void>;
  get(projectId: string): Project | undefined;
  applyMutation(projectId: string, mutation: Mutation): Project;
}
```

Bundle structure (`.singularity` ZIP):

```
project-name.singularity
├── meta.json
├── project.json
├── assets/
│   └── <uuid>.<ext>
├── plugin-states/
│   └── <plugin-instance-id>.bin
└── sessions/
    └── <session-id>.json
```

`save` writes atomically: create `<path>.tmp`, write ZIP, fsync, rename to `<path>`. `open` validates `meta.json` version against `SINGULARITY_BUNDLE_VERSION` and rejects unknown major versions with `BUNDLE_VERSION_MISMATCH`.

### File API

Allowed file roots:

| Root id | Path | Writable |
|---|---|---|
| `project` | Directory of currently open `.singularity` bundle | yes |
| `userData` | Backend `dataDir` | yes |
| `downloads` | `<dataDir>/downloads` | yes |

All paths are normalized and must stay within the root after resolving symlinks. Attempts to escape the root return `FILE_ACCESS_DENIED`. Directory traversal (`..`) is rejected before normalization.

### Terminal PTY

```ts
// packages/backend/src/terminal.ts
export interface TerminalSession {
  readonly id: string;
  readonly shell: string;
  resize(cols: number, rows: number): void;
  write(data: string): void;
  kill(signal?: string): void;
}

export function createTerminalSession(options: {
  id: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  onData: (data: string | Uint8Array) => void;
  onExit: (code: number, signal?: number) => void;
}): TerminalSession;
```

The terminal WebSocket uses `node-pty`. On connect, the backend spawns the user's default shell (or configured shell) in the project directory. Input frames are written to the PTY; output is streamed to the UI. Resize messages use JSON frames with `type: 'resize'`.

### Browser session proxy

```ts
// packages/backend/src/browser.ts
export interface BrowserSession {
  readonly id: string;
  navigate(url: string): Promise<{ title: string; url: string }>;
  getContent(): Promise<{ title: string; content: string }>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  download(url: string, destinationRoot: 'downloads', destinationPath: string): Promise<{ path: string; sizeBytes: number }>;
  close(): Promise<void>;
}
```

Browser sessions use Playwright. Each session owns one browser context. Downloads are written to the allowed `downloads` root and can be imported into the project via the file API or agent tool.

### Agent tool dispatch

```ts
// packages/backend/src/agent/dispatcher.ts
export interface ToolCall {
  requestId: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult<T = unknown> {
  requestId: string;
  success: boolean;
  result?: T;
  error?: { code: string; message: string };
}

export async function dispatchTool(call: ToolCall, context: AgentContext): Promise<ToolResult>;
```

The dispatcher validates the tool name against a registry populated from backend capabilities. Tool implementations reuse the same internal services used by HTTP/WebSocket endpoints (project mutations, engine commands, file API, browser, terminal). Destructive tools require user confirmation unless the call includes a pre-approved `confirmationToken` issued by the UI.

### MCP transport

- **stdio**: when `packages/mcp` is launched, it spawns the backend as a subprocess and communicates over stdin/stdout using JSON-RPC 2.0. Each JSON-RPC request maps to an HTTP POST to `http://localhost:<port>/agent/tools` or a WebSocket mutation.
- **SSE**: clients connect to `/mcp/sse` and receive an endpoint URL. They POST JSON-RPC messages to `/mcp/messages`. The backend routes each request through the agent dispatcher and streams responses as SSE `message` events.

### Error handling

All errors are returned with:

```ts
interface ApiError {
  code: string; // stable machine-readable code, e.g. PROJECT_NOT_FOUND, ENGINE_TIMEOUT
  message: string;
  details?: unknown;
}
```

HTTP status codes:
- `400` validation errors (`VALIDATION_ERROR`)
- `404` project/resource not found
- `409` concurrent mutation conflict (`MUTATION_CONFLICT`)
- `422` engine command rejected (`ENGINE_COMMAND_REJECTED`)
- `502` engine not connected (`ENGINE_NOT_CONNECTED`)
- `500` unexpected server error

WebSocket errors are sent as `Reply` frames with `success: false` and never close the connection except for protocol violations.

### Algorithms / behavior

#### Mutation application

1. Validate incoming mutation with Zod.
2. Acquire project-level async mutex to serialize mutations.
3. Apply mutation to in-memory project model; push inverse operation onto undo stack; clear redo stack.
4. If the mutation affects audio engine state, translate it to an engine command and await reply.
5. Persist the mutation to a write-ahead log (`<dataDir>/wal/<projectId>.log`) for crash recovery.
6. Broadcast `project.mutation` event to all project subscribers.
7. Release mutex.

Undo/redo pop from the respective stack and re-apply the inverse or forward operation; the same engine translation and broadcast steps run.

#### Engine event broadcasting

The engine bridge forwards every `EngineEvent` to a typed pub/sub bus. Subscribers filter by topic. `transport` and `meter` events are throttled: transport at 30 Hz, meter peaks at 60 Hz. Throttling drops intermediate frames but always keeps the latest.

#### Crash recovery

On startup, the backend scans `<dataDir>/wal/*.log`. For each log, it reconstructs un-saved project state by replaying mutations in order. Recovered projects are opened in memory and advertised via the `/projects` list with a `recovered: true` flag. WAL entries are truncated after a successful `save`.

## Implementation plan

1. Scaffold `packages/backend` with Fastify, `@fastify/websocket`, Zod, `jszip`, `node-pty`, and `playwright` dependencies.
2. Implement shared schemas in `packages/shared` (Spec 19 dependency): messages, project slices, engine frames, plugin info, file API.
3. Implement Fastify server bootstrap, route registration, and graceful shutdown.
4. Implement in-memory project store with WAL, undo/redo, and `.singularity` ZIP read/write.
5. Implement engine TCP/socket bridge with length-prefixed framing, heartbeat, reconnection, and in-flight tracking.
6. Implement WebSocket `/ws` endpoint with project subscription and RPC reply semantics.
7. Implement terminal WebSocket subprotocol using `node-pty`.
8. Implement browser session proxy using Playwright.
9. Implement file API with root-based sandboxing.
10. Implement agent tool dispatcher and registry; wire HTTP and WebSocket entrypoints.
11. Implement MCP stdio adapter in `packages/mcp` and SSE endpoint in backend.
12. Implement plugin database JSON persistence and scan-result ingestion.
13. Write integration tests for every route, WebSocket flow, engine bridge mock, and persistence path.

## Testing strategy

- Unit tests:
  - Message/Reply/Event schema validation.
  - Project mutation apply/undo/redo logic.
  - Engine frame encoder/decoder.
  - File path sandboxing and normalization.
  - Tool dispatcher registry lookup and confirmation gating.
- Integration tests:
  - Backend starts, `/health` returns `ok`.
  - WebSocket connect, subscribe to project, send mutation, receive reply and broadcast event.
  - Engine bridge connects to a mock TCP server, sends command, receives reply, emits event.
  - Project create → save → open roundtrip preserves model and assets.
  - Crash recovery replays WAL into the same project state.
  - Terminal WebSocket spawns shell and echoes input.
  - Browser session navigates to a local page and returns content.
  - File API rejects path escape attempts.
  - MCP stdio adapter sends JSON-RPC and receives result over HTTP bridge.
  - SSE endpoint streams responses for agent tool calls.
- E2E tests:
  - Web app loads from backend static root and connects WebSocket.
  - Tauri desktop app backend starts, engine mock connects, UI receives transport events.

## Acceptance criteria

- [ ] `packages/backend` builds with Bun and TypeScript strict mode with zero errors.
- [ ] `createServer` returns a Fastify instance that exposes `/health`, `/version`, and `/ws`.
- [ ] A WebSocket client connecting to `/ws` with a session id can subscribe to a project and receive a confirmation reply.
- [ ] Sending a mutation message over WebSocket returns a `Reply` frame with matching `inReplyTo` id within 5 seconds.
- [ ] A mutation broadcast `Event` frame is delivered to all other subscribers of the same project within 100 ms.
- [ ] The engine bridge connects to a JUCE engine TCP listener, sends a `transport.play` command, and receives a success reply.
- [ ] Engine bridge reconnects automatically within 2 seconds after the engine process restarts.
- [ ] Heartbeat failure (no pong within 2 intervals) triggers disconnect event broadcast to UI subscribers.
- [ ] Project create → save → open roundtrip produces a `.singularity` bundle and restores the identical project JSON.
- [ ] WAL replay after a simulated crash restores the last unsaved project state exactly.
- [ ] File API rejects any request whose resolved absolute path leaves the configured root.
- [ ] Terminal WebSocket spawns a shell and streams both stdout and stderr to the client.
- [ ] Browser session API navigates to `https://example.com`, returns page text, and closes without leaking Playwright contexts.
- [ ] Agent tool dispatcher executes `project.addChannel` and returns a result containing the new channel id.
- [ ] MCP stdio adapter converts a JSON-RPC tool request into an HTTP call to `/agent/tools` and returns JSON-RPC result.
- [ ] MCP SSE endpoint accepts a connection and streams exactly one response event per posted JSON-RPC request.
- [ ] Plugin scan triggers engine command `device.scanPlugins`; scan results are persisted to `<dataDir>/plugins.json`; `/plugins` returns the persisted list.
- [ ] `/render/:id/progress` streams render progress events and closes gracefully on completion or cancel.
- [ ] All routes return stable error codes; no route returns a raw stack trace in production mode.
- [ ] Graceful shutdown waits up to 10 seconds for active WebSocket connections and engine commands to finish, then closes the TCP socket and exits.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture
- Spec 18: Monorepo and Build System
- Spec 19: Shared Protocol and Schemas
- Spec 20: JUCE Audio Engine Foundation

## Blocks

- Spec 26: Channel Rack and Step Sequencer
- Spec 27: Piano Roll
- Spec 28: Playlist and Arrangement
- Spec 29: Mixer and Routing Graph
- Spec 30: Browser, Plugin Database, and Presets
- Spec 31: Stock Instruments and Effects
- Spec 32: Audio Recording and Editing
- Spec 33: Automation, MIDI, and Transport
- Spec 34: Export, Rendering, and AI Mastering
- Spec 35: AI Agent System

## Notes / open questions

- **Decision made in this spec**: The backend serves as the authoritative in-memory project model owner. The engine only receives commands and emits runtime state; it does not own the canonical project document. This keeps persistence, undo, and agent reasoning in one TypeScript runtime.
- **Decision made in this spec**: WebSocket messages use RPC-style request/reply envelopes with explicit `id` and `inReplyTo` rather than a pure pub/sub model. This simplifies agent and UI code that needs to await the result of a mutation.
- **Decision made in this spec**: Engine TCP frames are length-prefixed JSON with a 16 MiB maximum. This avoids delimiter scanning and matches common binary-safe RPC framing without adding a new serialization format.
- **Decision made in this spec**: Project WAL is stored in the backend data directory, not inside the bundle. WAL is only for crash recovery and is truncated on save.
- **Decision made in this spec**: Plugin database is persisted by the backend as JSON in the user data directory after the engine reports scan results. The backend, not the engine, owns the searchable plugin catalog.
- **Decision made in this spec**: The file API restricts access to three named roots (`project`, `userData`, `downloads`). Absolute paths and `..` traversal are rejected. This allows Monaco and the agent to read/write files safely without exposing the whole filesystem.
- **Decision made in this spec**: Terminal sessions are spawned per WebSocket connection in the project directory with the user's default shell. No persistent terminal session reuse across reconnections in v1.0; the UI re-creates a session on reconnect.
- **Decision made in this spec**: Browser sessions are backed by Playwright and are explicitly created/destroyed by API calls. Downloads land in the `downloads` root so the file API and agent can import them.
- **Decision made in this spec**: MCP stdio mode launches the backend as a managed child process and uses HTTP internally. This avoids duplicating API logic while keeping stdio as the external MCP transport.
- Future work (post-v1.0): remote backend mode, multi-project backend instances, project-level access control, and engine bridge over Unix domain sockets.
