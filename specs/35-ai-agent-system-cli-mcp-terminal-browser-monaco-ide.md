# Spec 35: AI Agent System (CLI, MCP, Terminal, Browser, Monaco IDE)

## Objective

Define the complete AI agent system for Singularity v1.0, including a provider-agnostic skill runtime, standalone CLI, MCP server (stdio and SSE), integrated xterm.js terminal, Playwright-driven embedded browser, and Monaco IDE with a file explorer, all sharing one backend project context and a uniform permission gate.

## Motivation

Full FL Studio parity requires the DAW to be drivable by an AI agent using natural language. The agent must read full project context, modify the project, run shell commands, browse the web, and read/write code files without leaving the app. A standalone CLI and MCP server let external tools (Claude Desktop, Codex CLI, Cursor, etc.) control the DAW with the same skill definitions used inside the app.

## Scope

### In scope

- Generic skill definition format and runtime registry.
- Provider adapters for Anthropic (Claude), OpenAI, and OpenAI Codex.
- Built-in skills: `track.add`, `plugin.load`, `pattern.create`, `pattern.quantize`, `project.export`, `mix.analyze`, `terminal.exec`, `browser.navigate`, `browser.readContent`, `browser.click`, `browser.type`, `browser.fill`, `browser.download`, `file.read`, `file.write`, `file.delete`.
- Skill plugin wrapper so users can package and reuse skill sets.
- Standalone CLI in `packages/cli` for chat and direct skill execution.
- MCP server in `packages/mcp` supporting stdio and SSE transports.
- Integrated terminal/chat panel using xterm.js with multi-tab PTY sessions via node-pty.
- Embedded browser tab using Playwright headless backend and in-app webview/iframe display.
- Monaco code editor tab with file explorer sidebar and backend file API.
- Persistent agent chat sessions inside the `.singularity` bundle.
- Permission gate with per-action confirmation for destructive operations.
- Backend agent runtime, WebSocket/HTTP APIs, and state streaming.

### Out of scope

- Training or fine-tuning custom models (use existing provider APIs).
- Voice/video chat with the agent.
- External plugin store or marketplace.
- Cloud agent sync or shared agent state across devices.
- Specific creative AI DSP (stem separation, chord progression, loop starter) — covered by Specs 35 creative extensions; this spec defines the framework that exposes them.

## Related decisions

All entries in `docs/decisions.md` from 2026-06-25, especially:

- AI agent integration decision and provider-agnostic generic skill format.
- AI model provider strategy (adapters for Claude/Codex/OpenAI).
- Integrated terminal backend (xterm.js + node-pty).
- MCP server transport (stdio + SSE).
- Embedded browser tab (Playwright headless backend + in-app webview/iframe).
- Monaco IDE integration.
- Agent permission model (full permissions with confirmation for destructive actions).
- Project format rename to `.singularity` with `sessions/` folder.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UI Layer (React)                                │
│  AgentChatPanel │ TerminalPanel │ BrowserPanel │ MonacoPanel │ ToolCallCards │
│       xterm.js         xterm.js     webview/iframe      Monaco + file tree   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ WebSocket / HTTP
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                          Backend Agent Runtime (Bun)                         │
│  SkillRegistry │ PermissionGate │ ProviderAdapters │ SessionStore            │
│  TerminalService (node-pty) │ BrowserService (Playwright) │ FileService        │
│  MCP stdio handler │ MCP SSE handler │ CLI client library                       │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ backend API / engine socket
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                            Project + Engine                                  │
│              Project model │ Engine bridge │ Audio/MIDI/Plugin state          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data model

#### Skill definition

```ts
// packages/shared/src/agent/skill.ts
import { z } from 'zod';

export type JSONSchema = unknown;

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  parameters: z.ZodTypeAny;          // canonical runtime schema
  jsonSchema?: JSONSchema;           // exported to providers/MCP
  dangerous: boolean;                // requires explicit user confirmation
  handler: SkillHandler;
}

export type SkillHandler = (
  args: unknown,
  ctx: SkillContext,
) => Promise<SkillResult>;

export interface SkillContext {
  projectId: string;
  sessionId: string;
  backend: BackendApiClient;
  terminal: TerminalServiceClient;
  browser: BrowserServiceClient;
  files: FileServiceClient;
  confirm: (action: string, detail: string) => Promise<boolean>;
  notify: (level: 'info' | 'warning' | 'error', message: string) => void;
}

export interface SkillResult {
  success: boolean;
  content: string;
  artifacts?: Artifact[];
}

export interface Artifact {
  type: 'file' | 'track' | 'pattern' | 'clip' | 'log';
  id: string;
  name: string;
  uri?: string;
}

export interface SkillPluginManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  entry: string;                     // relative path to JS entry
  author?: string;
}

export interface SkillPlugin {
  manifest: SkillPluginManifest;
  skills: SkillDefinition[];
}
```

#### Agent session

```ts
// packages/shared/src/agent/session.ts
export interface AgentSession {
  id: string;
  projectId: string;
  name: string;
  modelProvider: 'anthropic' | 'openai' | 'codex' | 'none';
  modelConfig: ModelConfig;
  messages: ChatMessage[];
  createdAt: string;                 // ISO 8601
  updatedAt: string;
}

export interface ModelConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: string;
}

export interface ToolCall {
  id: string;
  skillId: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  success: boolean;
  content: string;
}
```

#### Permission model

```ts
// packages/shared/src/agent/permission.ts
export interface PermissionPolicy {
  projectMutations: 'allow' | 'confirm' | 'deny';
  shellCommands: 'allow' | 'confirm' | 'deny';
  browserNavigation: 'allow' | 'confirm' | 'deny';
  fileWrites: 'allow' | 'confirm' | 'deny';
  fileDeletes: 'allow' | 'confirm' | 'deny';
  downloads: 'allow' | 'confirm' | 'deny';
}

export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = {
  projectMutations: 'confirm',
  shellCommands: 'confirm',
  browserNavigation: 'allow',
  fileWrites: 'confirm',
  fileDeletes: 'confirm',
  downloads: 'confirm',
};
```

#### Terminal session

```ts
// packages/shared/src/agent/terminal.ts
export interface TerminalSession {
  id: string;
  projectId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: string;
}
```

#### Browser session

```ts
// packages/shared/src/agent/browser.ts
export interface BrowserSession {
  id: string;
  projectId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  createdAt: string;
}
```

### API / interface

#### Backend HTTP routes

All routes are prefixed with `/api/v1` and return JSON validated by shared Zod schemas.

Agent sessions:

```
POST   /projects/:projectId/agent/sessions
GET    /projects/:projectId/agent/sessions
GET    /projects/:projectId/agent/sessions/:sessionId
DELETE /projects/:projectId/agent/sessions/:sessionId
POST   /projects/:projectId/agent/sessions/:sessionId/messages
GET    /projects/:projectId/agent/sessions/:sessionId/messages
POST   /projects/:projectId/agent/sessions/:sessionId/invoke        // direct skill invocation
GET    /skills                                                       // list all registered skills
GET    /skills/:skillId                                              // single skill schema
```

Terminal sessions:

```
POST   /projects/:projectId/terminal/sessions
GET    /projects/:projectId/terminal/sessions
DELETE /projects/:projectId/terminal/sessions/:terminalId
POST   /projects/:projectId/terminal/sessions/:terminalId/resize     // { cols, rows }
POST   /projects/:projectId/terminal/sessions/:terminalId/data       // raw input bytes as text
```

Browser sessions:

```
POST   /projects/:projectId/browser/sessions
GET    /projects/:projectId/browser/sessions
DELETE /projects/:projectId/browser/sessions/:browserId
POST   /projects/:projectId/browser/sessions/:browserId/navigate     // { url }
POST   /projects/:projectId/browser/sessions/:browserId/action       // { type, selector, value? }
GET    /projects/:projectId/browser/sessions/:browserId/content      // page text + a11y tree
POST   /projects/:projectId/browser/sessions/:browserId/download     // { url, filename? }
```

Files (Monaco / agent):

```
GET    /files?path=<absoluteOrProjectRelative>&projectId=<id>
POST   /files                              // { projectId, path, content, encoding? }
DELETE /files?path=...&projectId=...
```

#### WebSocket events

Client → server:

```ts
{ type: 'terminal.input'; payload: { terminalId: string; data: string } }
{ type: 'terminal.resize'; payload: { terminalId: string; cols: number; rows: number } }
{ type: 'agent.send'; payload: { sessionId: string; content: string } }
{ type: 'agent.cancel'; payload: { sessionId: string } }
{ type: 'permission.respond'; payload: { requestId: string; approved: boolean } }
{ type: 'browser.requestView'; payload: { browserId: string } }
```

Server → client:

```ts
{ type: 'terminal.output'; payload: { terminalId: string; data: string } }
{ type: 'terminal.closed'; payload: { terminalId: string; exitCode: number } }
{ type: 'agent.stream'; payload: { sessionId: string; delta: string } }
{ type: 'agent.message'; payload: { sessionId: string; message: ChatMessage } }
{ type: 'agent.toolCall'; payload: { sessionId: string; call: ToolCall } }
{ type: 'agent.toolResult'; payload: { sessionId: string; result: ToolResult } }
{ type: 'permission.request'; payload: { requestId: string; action: string; detail: string } }
{ type: 'browser.frame'; payload: { browserId: string; image?: string; url: string; title: string } }
{ type: 'file.changed'; payload: { path: string } }
```

#### Skill registry runtime API

```ts
// packages/backend/src/agent/SkillRegistry.ts
export class SkillRegistry {
  register(skill: SkillDefinition): void;
  unregister(skillId: string): void;
  loadPlugin(pluginPath: string): Promise<SkillPlugin>;
  list(): SkillDefinition[];
  get(skillId: string): SkillDefinition;
  invoke(skillId: string, args: unknown, ctx: SkillContext): Promise<SkillResult>;
}
```

#### Provider adapter API

```ts
// packages/backend/src/agent/adapters/types.ts
export interface ProviderAdapter {
  readonly provider: string;
  createStream(
    config: ModelConfig,
    messages: ChatMessage[],
    tools: ProviderTool[],
    onToolCall: (call: ToolCall) => Promise<ToolResult>,
  ): AsyncIterable<string>;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: JSONSchema;
}

// Concrete adapters live in:
// packages/backend/src/agent/adapters/anthropicAdapter.ts
// packages/backend/src/agent/adapters/openaiAdapter.ts
// packages/backend/src/agent/adapters/codexAdapter.ts
```

#### Permission gate API

```ts
// packages/backend/src/agent/PermissionGate.ts
export class PermissionGate {
  constructor(
    policy: PermissionPolicy,
    requester: (req: PermissionRequest) => Promise<boolean>,
  );
  check(category: keyof PermissionPolicy, action: string, detail: string): Promise<boolean>;
}

export interface PermissionRequest {
  requestId: string;
  category: keyof PermissionPolicy;
  action: string;
  detail: string;
}
```

#### Terminal service API

```ts
// packages/backend/src/agent/TerminalService.ts
export class TerminalService {
  create(projectId: string, shell?: string, cwd?: string): Promise<TerminalSession>;
  write(terminalId: string, data: string): void;
  resize(terminalId: string, cols: number, rows: number): void;
  kill(terminalId: string): Promise<void>;
  onOutput: Event<{ terminalId: string; data: string }>;
  onExit: Event<{ terminalId: string; exitCode: number }>;
}
```

#### Browser service API

```ts
// packages/backend/src/agent/BrowserService.ts
export class BrowserService {
  create(projectId: string): Promise<BrowserSession>;
  navigate(browserId: string, url: string): Promise<void>;
  click(browserId: string, selector: string): Promise<void>;
  type(browserId: string, selector: string, text: string): Promise<void>;
  fill(browserId: string, selector: string, text: string): Promise<void>;
  readContent(browserId: string): Promise<{ title: string; url: string; text: string }>;
  download(browserId: string, url: string, filename?: string): Promise<string>; // returns project-relative path
  screenshot(browserId: string): Promise<string>; // base64 PNG
  close(browserId: string): Promise<void>;
  onFrame: Event<{ browserId: string; image: string; url: string; title: string }>;
}
```

#### File service API

```ts
// packages/backend/src/agent/FileService.ts
export class FileService {
  list(projectId: string, dir?: string): Promise<FileEntry[]>;
  read(projectId: string, filePath: string, encoding?: 'utf8' | 'base64'): Promise<string>;
  write(projectId: string, filePath: string, content: string, encoding?: 'utf8' | 'base64'): Promise<void>;
  delete(projectId: string, filePath: string): Promise<void>;
  onChange: Event<{ projectId: string; path: string }>;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}
```

#### CLI entry points

```ts
// packages/cli/src/main.ts
import { Command } from 'commander';

const program = new Command('singularity-agent')
  .version('1.0.0')
  .description('Singularity AI agent CLI');

program
  .command('chat [projectPath]')
  .description('Start an interactive chat session')
  .requiredOption('-p, --provider <provider>', 'anthropic | openai | codex')
  .option('-m, --model <model>', 'model identifier')
  .option('-k, --api-key <key>', 'provider API key')
  .action(chatCommand);

program
  .command('run <skillId>')
  .description('Run a skill directly against the current project')
  .requiredOption('--project <projectPath>', 'path to .singularity project')
  .option('--args <json>', 'JSON-encoded arguments', '{}')
  .action(runCommand);

program
  .command('mcp')
  .description('Run the MCP server over stdio')
  .option('--transport <transport>', 'stdio | sse', 'stdio')
  .option('--port <port>', 'SSE server port', '3001')
  .action(mcpCommand);

program.parse();
```

#### MCP server entry

```ts
// packages/mcp/src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const server = new Server(
  { name: 'singularity', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.list().map(toMcpTool),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const result = await registry.invoke(req.params.name, req.params.arguments, buildMcpContext());
  return { content: [{ type: 'text', text: result.content }] };
});
```

### UI/UX

#### Agent chat panel

- Rendered as a Dockview panel with id `panel.agent-chat`.
- Split into:
  - Message history (scrollable, user right, assistant left).
  - Tool call cards showing invoked skill, arguments, and result.
  - Input box with model/provider selector and submit button.
  - Session tabs (create/rename/delete sessions).
- Theme tokens: `--vsdaw-surface-1` background, `--vsdaw-text-primary` text, `--vsdaw-accent` for user bubbles.

#### Terminal panel

- Dockview panel id `panel.terminal`.
- Each tab is one xterm.js instance bound to one PTY session.
- Default shell: user's login shell (`$SHELL` or `process.env.SHELL`).
- Default cwd: project root.
- Toolbar per tab: copy, paste, clear, kill, plus/new tab button.

#### Browser panel

- Dockview panel id `panel.browser`.
- Address bar, back/forward/reload, tab list.
- Render surface is a nested webview in Tauri or an iframe in the web app.
- Agent-controlled navigation is reflected in the UI within 500ms.
- Downloaded files appear in a toast and are added to the project `assets/` folder.

#### Monaco IDE panel

- Dockview panel id `panel.ide`.
- Left sidebar: file explorer tree rooted at the project directory.
- Main area: Monaco Editor with VS Code theme tokens applied.
- Tab bar for open files.
- Agent file changes trigger UI refresh via `file.changed` WebSocket event.

### Algorithms / behavior

#### Skill invocation flow

1. User sends a message.
2. Backend appends the message to the session history.
3. Provider adapter converts registered skills to provider-native tools.
4. Provider stream begins; `agent/stream` events are emitted to the UI/CLI.
5. If the model emits a tool call, the adapter maps it back to a skill.
6. `PermissionGate.check` is called if the skill is marked `dangerous` or the policy requires confirmation.
7. If denied, a tool result with error content is returned.
8. If approved, the skill handler runs with `SkillContext`.
9. Tool result is appended to session history and streamed.
10. Session is persisted to disk after each assistant turn.

#### Permission gate flow

1. The request category is determined from the skill:
   - `track.add`, `plugin.load`, `pattern.create`, `pattern.quantize`, `project.export`, `mix.analyze` → `projectMutations`
   - `terminal.exec` → `shellCommands`
   - `browser.navigate` → `browserNavigation`
   - `file.write` → `fileWrites`
   - `file.delete` → `fileDeletes`
   - `browser.download` → `downloads`
2. If the policy is `allow`, return `true` immediately.
3. If the policy is `deny`, return `false` immediately.
4. If the policy is `confirm`, emit a `permission.request` WebSocket event and wait up to 5 minutes for `permission.respond`.
5. In the CLI, when no UI is present, prompt via `readline` with `[Y/n]`.

#### Terminal data flow

1. `TerminalService.create` spawns `node-pty` with the configured shell and cwd.
2. PTY `onData` emits `terminal.output` events over WebSocket.
3. xterm.js writes incoming data to the terminal.
4. User keystrokes are sent as `terminal.input` messages.
5. Resize events are forwarded to node-pty.
6. When the shell exits, `terminal.closed` is emitted and the session is removed from memory but a tombstone is kept for the UI until the user closes the tab.

#### Browser data flow

1. `BrowserService.create` launches a Playwright page in a shared browser context.
2. `browser.navigate` calls `page.goto(url, { waitUntil: 'networkidle' })`.
3. `browser.readContent` returns `page.title()`, `page.url()`, and `page.locator('body').innerText()`.
4. `browser.click/type/fill` use Playwright locators with a 10-second timeout.
5. `browser.download` intercepts downloads, saves to `assets/downloads/`, and returns the project-relative path.
6. `browser.screenshot` is called on every navigation or action and emitted as `browser.frame` to the UI at most 5 fps.

#### File service safety

1. All file paths are resolved relative to the project root.
2. Absolute paths outside the project root are rejected with `403 Forbidden`.
3. Symlinks are not followed.
4. File writes trigger a `file.changed` event.
5. Monaco reads files through the same API so agent and user edits are coherent.

#### Session persistence

1. On every assistant turn, the session JSON is written to `sessions/<sessionId>.json` inside the `.singularity` bundle.
2. On project load, all `sessions/*.json` files are loaded into the in-memory session store.
3. Session files use the same `ChatMessage` schema and are versioned with a `schemaVersion` field.

## Implementation plan

1. Create `packages/shared/src/agent/` with schemas for skills, sessions, permissions, terminal, browser, and files.
2. Create `packages/backend/src/agent/` with `SkillRegistry`, `PermissionGate`, provider adapters, `TerminalService`, `BrowserService`, and `FileService`.
3. Implement built-in skills in `packages/backend/src/skills/`.
4. Implement backend HTTP routes and WebSocket handlers in `packages/backend/src/routes/agent.ts`.
5. Implement `packages/cli` with `chat`, `run`, and `mcp` commands.
6. Implement `packages/mcp` with stdio and SSE transports.
7. Implement UI panels in `packages/ui`: `AgentChatPanel`, `TerminalPanel`, `BrowserPanel`, `MonacoPanel`.
8. Wire panels into Dockview with theme-aware CSS.
9. Add skill plugin loader reading from `~/.singularity/skills/` and project-local `.singularity/skills/`.
10. Add tests and validate CLI, MCP, terminal, browser, and Monaco end-to-end.

## Testing strategy

- Unit tests:
  - Skill registry registration and invocation.
  - Provider adapters produce valid tool shapes for Anthropic/OpenAI/Codex.
  - Permission gate allows/denies/confirmations.
  - Zod schema round-trips for all agent payloads.
- Integration tests:
  - CLI `singularity-agent --version` and `chat` initialization.
  - MCP stdio server responds to `initialize` and `tools/list`.
  - MCP SSE server exposes `/sse` and `/message` endpoints.
  - Backend creates agent sessions and persists them to `.singularity/sessions/`.
  - Backend terminal sessions spawn a shell and stream output.
  - Backend browser sessions navigate to a local test page and return content.
  - Backend file API reads/writes within project root and rejects path traversal.
- E2E tests:
  - User opens agent chat, sends a message, and receives a streamed response.
  - User opens terminal panel and sees a shell prompt.
  - User opens browser panel, navigates to a URL, and sees the page.
  - User opens Monaco IDE, edits a file, and the agent sees the change.
  - Agent invokes a destructive skill; user approves and the action executes.

## Acceptance criteria

- [ ] `packages/cli` builds and `singularity-agent --version` prints `1.0.0`.
- [ ] `packages/mcp` builds and the stdio server responds to the MCP `initialize` request with name `singularity` and version `1.0.0`.
- [ ] `packages/mcp` SSE server starts on a configurable port, serves `/sse` for client connections, and accepts POST `/message` for JSON-RPC messages.
- [ ] `GET /api/v1/skills` returns all built-in skills including `track.add`, `plugin.load`, `pattern.create`, `pattern.quantize`, `project.export`, `mix.analyze`, `terminal.exec`, `browser.navigate`, `browser.readContent`, `browser.click`, `browser.type`, `browser.fill`, `browser.download`, `file.read`, `file.write`, and `file.delete`.
- [ ] Each skill in `GET /api/v1/skills/:skillId` returns a valid JSON Schema for its parameters and a `dangerous` boolean.
- [ ] `POST /api/v1/projects/:projectId/agent/sessions` creates a session and persists it to `.singularity/sessions/<sessionId>.json`.
- [ ] `POST /api/v1/projects/:projectId/agent/sessions/:sessionId/messages` streams assistant response deltas over the WebSocket `agent/stream` event within 1 second of provider response chunks.
- [ ] Invoking `track.add` results in the backend sending a `track/create` command to the engine and the project model updating.
- [ ] Invoking `terminal.exec` with policy `shellCommands: 'confirm'` emits a `permission.request` event and does not execute until the user responds with `permission.respond` `{ approved: true }`.
- [ ] `PermissionGate` denies any destructive skill when the matching policy is set to `deny`.
- [ ] Terminal panel renders an xterm.js instance and displays the shell prompt.
- [ ] Opening a second terminal tab creates an independent PTY session with a distinct `terminalId`.
- [ ] Typing in a terminal tab sends input to the correct PTY and output streams back to xterm.js within 100ms.
- [ ] Browser panel navigates to `https://example.com` and renders the page title in the address bar.
- [ ] Agent skill `browser.readContent` returns the visible text content of the active browser page.
- [ ] Agent skill `browser.download` saves a file to `assets/downloads/` and requires confirmation when policy is `downloads: 'confirm'`.
- [ ] Monaco IDE panel lists project files in a sidebar and opens a selected file in the editor.
- [ ] Agent skill `file.write` writes to a project file and emits a `file.changed` WebSocket event; the Monaco UI refreshes within 500ms.
- [ ] Agent skill `file.read` rejects paths outside the project root with HTTP `403`.
- [ ] Anthropic adapter converts every registered skill to an Anthropic `tool` definition without dropping required parameters.
- [ ] OpenAI adapter converts every registered skill to an OpenAI `function` definition without dropping required parameters.
- [ ] Codex adapter converts every registered skill to a Codex-compatible tool definition.
- [ ] Skill plugin loader reads a plugin from `~/.singularity/skills/<pluginId>/` and registers its skills.
- [ ] Chat history reloads when the project is reopened and `GET /api/v1/projects/:projectId/agent/sessions` returns previously saved sessions.
- [ ] All unit, integration, and E2E tests for the agent system pass in CI.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture — defines the monorepo packages, backend runtime, and communication paths this spec extends.
- Spec 18: Monorepo and Build System — provides workspace setup, build scripts, and package publishing for `packages/cli` and `packages/mcp`.
- Spec 19: Shared Protocol and Schemas — provides the Zod schema infrastructure and message envelopes used by agent payloads.
- Spec 23: Backend API — provides the Fastify server, project model, and engine bridge that the agent runtime calls.
- Spec 20: JUCE Audio Engine — provides the engine commands (track create, plugin load, export, etc.) that built-in skills invoke.

## Blocks

- Spec 17: Singularity v1.0 Standalone App Architecture and Spec 25: Dockview Layout and Shell Panels — require the agent panels to be registered as Dockview panels and wired into the desktop window model.
- Specs 26–30: Core DAW Panels — agent skills assume the backend project model and engine commands for Channel Rack, Piano Roll, Playlist, Mixer, Browser, and Graph are available.
- Spec 34: Export, Rendering, and AI Mastering — `project.export` skill depends on the export pipeline.
- Spec 21: Plugin Hosting and Scanner and Spec 30: Browser, Plugin Database, and Presets — `plugin.load` skill depends on plugin scanning and state management.

## Notes / open questions

- **Decision made:** The CLI connects to a running backend over HTTP/WebSocket rather than embedding the backend. This avoids duplicating engine/runtime state and matches the standalone app architecture.
- **Decision made:** The browser display surface is an iframe in the web app and a nested webview in Tauri; Playwright remains the single automation backend. This matches the existing architecture decision.
- **Decision made:** Skill plugins use plain CommonJS/ESM JavaScript with a JSON manifest. No compiled binary plugins in v1.0 to keep security review simple.
- **Decision made:** The default shell for the terminal is `process.env.SHELL` on macOS/Linux and `powershell.exe` or `cmd.exe` on Windows opportunistic builds.
- **Open question:** Whether to bundle a local LLM provider for offline use. Deferred to post-v1.0; the adapter interface supports adding a `local` provider later.
