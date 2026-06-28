# Spec 17: Singularity v1.0 Standalone App Architecture

## Objective

Define the overall architecture for Singularity v1.0: a standalone FL Studio-parity DAW with a JUCE C++ audio engine, Rsbuild+React UI, Bun backend, Tauri desktop shell, web app, and integrated AI agent system.

## Motivation

The previous VS Code extension-centric architecture cannot deliver professional DAW UX (floating/detachable panels, native plugin hosting, multi-monitor support, cohesive theming). A standalone app with a real backend and native engine is required for full parity.

## Scope

### In scope

- Monorepo layout and package responsibilities.
- Technology stack for UI, backend, engine, desktop, and web.
- Communication paths between UI, backend, and engine.
- Tauri desktop shell and web app shell.
- High-level data flow.
- Migration approach from the old codebase.

### Out of scope

- VS Code extension (dropped from v1.0; see `docs/decisions.md`).
- Detailed panel designs (covered by Specs 26–30).
- AI agent internals (covered by Spec 35).
- JUCE engine internals (covered by Spec 20).

## Related decisions

All entries in `docs/decisions.md` from 2026-06-25, especially:
- Pivot to standalone FL Studio parity.
- Rsbuild, Tauri v2, React 19, Zustand, Tailwind.
- JUCE C++ native engine as Tauri sidecar.
- `.singularity` native project format.
- Fastify + `@fastify/websocket` backend.
- Local TCP/socket backend-to-engine transport.
- VS Code theme-based theming.
- macOS/Linux/web hard targets; Windows opportunistic.

## Detailed design

### Monorepo layout

```
singularity/
├── packages/shared/      # Zod schemas, types, constants, pure utilities
├── packages/ui/          # React components, Dockview panels, design system
├── packages/web/         # Web app entry (Rsbuild)
├── packages/backend/     # Bun backend: HTTP/WS, engine bridge, agent runtime
├── packages/desktop/     # Tauri v2 desktop shell
├── packages/cli/         # Agent CLI tool
├── packages/mcp/         # MCP server (stdio + SSE)
├── engine/               # JUCE C++ audio engine (CMake)
├── docs/                 # decisions.md, parity-spec.md, architecture.md, specs/
└── scripts/              # Build, package, CI helpers
```

### Technology stack

| Layer | Technology |
|---|---|
| UI build | Rsbuild + `@rsbuild/plugin-react` |
| UI framework | React 19, Zustand, Tailwind CSS |
| Panels | Dockview |
| Canvas | HTML5 Canvas |
| Code editor | Monaco Editor |
| Terminal | xterm.js + node-pty |
| Browser | In-app webview/iframe + Playwright |
| Desktop | Tauri v2 |
| Backend | Bun/Node + Fastify + `@fastify/websocket` |
| Engine | JUCE 8 + CMake |
| Schemas | Zod |
| Tests | Jest + ts-jest |
| C++ | clang-format, clang-tidy |

### Runtime architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  React + Zustand + Dockview + Canvas + Monaco + xterm.js    │
│              (shared by Tauri desktop and Web app)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                      Backend (Bun)                           │
│  Fastify HTTP/WS │ Project model │ Engine bridge │ Agent    │
│  node-pty        │ Playwright    │ MCP server    │ CLI      │
└──────────────────────────┬──────────────────────────────────┘
                           │ local TCP/socket
┌──────────────────────────▼──────────────────────────────────┐
│                    JUCE Engine (C++)                         │
│  Audio I/O │ Plugin host │ Mixer │ MIDI │ Transport │ Render │
└─────────────────────────────────────────────────────────────┘
```

### Communication paths

1. **UI ↔ Backend**: HTTP request/response and WebSocket real-time events.
2. **Backend ↔ JUCE engine**: Local TCP/socket command protocol with lock-free audio thread isolation.
3. **Backend ↔ Agent**: Tools/skills map to backend API commands.
4. **Agent ↔ Terminal**: node-pty spawned by backend.
5. **Agent ↔ Browser**: Playwright headless backend; UI webview/iframe for display.
6. **Agent ↔ Monaco**: Backend file API.

### Message format

All UI-backend messages use the canonical envelopes defined in Spec 23 and re-exported from `packages/shared`:

```ts
interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

interface Reply<T = unknown> {
  id: string;
  type: 'reply';
  inReplyTo: string;
  success: boolean;
  payload?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface Event<T = unknown> {
  id: string;
  type: 'event';
  topic: string;
  payload: T;
}
```

Payloads are validated with shared Zod schemas in `packages/shared`.

### Tauri desktop shell

- Bundles the Rsbuild UI output.
- Spawns the JUCE engine sidecar.
- Exposes Tauri commands for native file dialogs, OS theme, menus, auto-updater, and multi-window management.
- Detachable Dockview panels use Tauri multi-window + state sync.

### Web app shell

- Static build served by the backend or a CDN.
- Connects to backend over HTTP/WebSocket.
- Embedded browser tab uses iframe.
- If native backend is unavailable, the web app runs in a degraded Web Audio preview mode (not full parity).

## Implementation plan

1. Set up the monorepo skeleton with all packages and build scripts.
2. Implement `packages/shared` with Zod schemas and protocol types.
3. Implement `packages/backend` Fastify server with WebSocket support.
4. Implement `engine/` JUCE skeleton with TCP/socket command listener.
5. Implement `packages/ui` shell with Dockview and theme provider.
6. Wire `packages/desktop` Tauri shell to backend and UI.
7. Wire `packages/web` to backend.
8. Remove obsolete code from `src/` once the new packages are functional.

## Testing strategy

- Integration test: backend starts and accepts a WebSocket connection.
- Integration test: engine binary starts and responds to a ping command.
- E2E test: Tauri desktop app launches and renders the shell.
- E2E test: web app serves and connects to backend.

## Acceptance criteria

- [ ] Monorepo builds all packages without errors.
- [ ] Backend starts and serves health endpoint plus WebSocket.
- [ ] JUCE engine binary builds and responds to commands over TCP/socket.
- [ ] Tauri desktop app launches and loads the UI.
- [ ] Web app serves from backend and connects via WebSocket.
- [ ] Dockview panels render and can be rearranged.
- [ ] VS Code theme tokens apply to the app background and Monaco editor.
- [ ] Old VS Code extension-specific code is removed or isolated in `archive/`.

## Dependencies

- None (foundational spec).

## Blocks

- Spec 18 (Monorepo and Build System)
- Spec 19 (Shared Protocol and Schemas)
- Spec 23 (Backend API)
- Spec 25: Dockview Layout and Shell Panels

## Notes

- The backend and engine must be designed so the web app can run against a remote backend in the future.
- The engine binary must be built for macOS, Linux, and opportunistically Windows.
