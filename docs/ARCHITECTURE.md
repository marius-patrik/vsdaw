# Singularity v1.0 — Locked Architecture & Stack

This document records only the technologies and design decisions that are locked for v1.0. Anything not listed here is out of scope or not yet decided.

## 1. Locked stack

| Layer | Technology | Why |
|---|---|---|
| Monorepo / package manager | Bun workspaces (Node-compatible) | User preference; fast dev loop. |
| Language (UI/backend) | TypeScript 5.x strict mode | Existing project language. |
| Language (engine) | C++20 | Required for JUCE and native plugin hosting. |
| Frontend build tool | Rsbuild + `@rsbuild/plugin-react` | Explicit user requirement; replaces esbuild. |
| UI framework | React 19 | Existing choice. |
| State management | Zustand | Existing choice. |
| Styling | Tailwind CSS 3.x + CSS custom properties | Existing choice; supports VS Code theme tokens. |
| Theme system | VS Code color theme JSON files | User decision; maps to app + Monaco tokens. |
| Panel system | Dockview | Detachable/dockable panels for FL Studio layout. |
| Canvas editors | HTML5 Canvas | Timeline, piano roll, mixer, routing graph. |
| Code editor | Monaco Editor | IDE functionality inside the app. |
| Terminal | xterm.js + node-pty backend | Integrated terminal, multi-session. |
| Browser | In-app webview + Playwright headless backend | Agent-driven web browsing. |
| Icons | Lucide React | Existing choice. |
| Forms | React Hook Form + Zod resolvers | Existing choice. |
| Validation / schemas | Zod | Shared across UI/backend. |
| Server state | TanStack Query (React Query) | Existing choice. |
| Desktop shell | Tauri v2 | Native desktop wrapper, sidecars, auto-updater. |
| Audio engine | JUCE 8 (C++) | Required for VST3/AU/CLAP/LV2/AAX hosting. |
| Engine build | CMake | Standard for JUCE. |
| Backend runtime | Bun / Node | API server, project I/O, agent runtime. |
| Backend framework | Fastify + `@fastify/websocket` | HTTP API and WebSocket in one server. |
| Backend transport | HTTP + WebSocket | Real-time UI sync and request/response. |
| Engine transport | Local TCP/socket | Decouples backend from JUCE engine. |
| Agent LLM format | Generic skill format | Provider-agnostic; adapters for Claude/Codex/OpenAI. |
| Agent interfaces | CLI, MCP server (stdio + SSE), plugin wrapper | User decision. |
| Terminal backend | node-pty | Real shell PTY sessions. |
| Headless browser | Playwright + chrome-launcher | Agent web automation. |
| Project format | `.singularity` ZIP bundle | Native format with JSON + assets + plugin states. |
| Project I/O | JSZip | Read/write ZIP bundles. |
| MIDI | Web MIDI API + `webmidi` wrapper | Existing choice. |
| Lint/format | Biome | Existing choice. |
| Tests | Jest + ts-jest | Existing choice. |
| C++ lint/format | clang-format + clang-tidy | Standard C++ tooling. |
| Versioning | standard-version | Existing choice. |

## 2. Locked monorepo layout

```
vsdaw/
├── packages/shared/      # Zod schemas, types, pure utilities
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

## 3. Locked communication paths

1. **UI ↔ Backend**: WebSocket for real-time state; HTTP for request/response.
2. **Backend ↔ JUCE engine**: local TCP/socket command protocol.
3. **Backend ↔ Agent**: tools/skills map to backend API commands.
4. **Agent ↔ Terminal**: node-pty spawned by backend.
5. **Agent ↔ Browser**: Playwright headless backend; UI webview for display.
6. **Agent ↔ Monaco**: backend file API.

## 4. Locked runtime architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  React + Zustand + Dockview + Canvas + Monaco + xterm.js    │
│              (shared by Tauri desktop and Web app)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket / HTTP
┌──────────────────────────▼──────────────────────────────────┐
│                      Backend (Bun)                           │
│  HTTP/WS server │ Project model │ Engine bridge │ Agent     │
│  node-pty       │ Playwright    │ MCP server    │ CLI       │
└──────────────────────────┬──────────────────────────────────┘
                           │ local TCP/socket
┌──────────────────────────▼──────────────────────────────────┐
│                    JUCE Engine (C++)                         │
│  Audio I/O │ Plugin host │ Mixer │ MIDI │ Transport │ Render │
└─────────────────────────────────────────────────────────────┘
```

## 5. Locked engine responsibilities

- Audio device selection and management.
- Single realtime audio callback with lock-free control queues.
- In-process hosting of VST3, AU, CLAP, LV2, AAX plugins.
- Plugin scanning, state save/load, delay compensation.
- Channel Rack + Pattern + Playlist model execution.
- Mixer graph: inserts, sends/returns, buses, sidechain.
- MIDI input/output and timing.
- Audio recording and rendering.
- Stock instruments/effects DSP.
- Video playback sync.

## 6. Locked backend responsibilities

- Manage in-memory project model.
- Persist/restore `.singularity` bundles.
- Translate UI messages to engine commands.
- Stream engine state (position, meters) to UI.
- Serve web UI and static assets.
- Run agent runtime and dispatch tool calls.
- Host MCP server (stdio + SSE).
- Spawn terminal PTY sessions.
- Spawn headless browser sessions.
- Provide file API for Monaco file explorer.

## 7. Locked UI responsibilities

- Render all DAW panels (Channel Rack, Piano Roll, Playlist, Mixer, Browser, Graph).
- Render IDE panels (Terminal, Browser, Monaco).
- Render AI chat/terminal panel.
- Apply VS Code theme tokens to the whole app.
- Handle user input and forward actions to backend.
- Display real-time playback state, meters, and playhead.

## 8. Locked agent model

- Agent receives full project context and can drive any feature.
- Tool definitions are provider-agnostic skills.
- Destructive actions require user confirmation.
- Agent can:
  - Modify project (tracks, plugins, notes, automation, export).
  - Execute shell commands via terminal.
  - Browse the web and download files.
  - Read/write files in Monaco.

## 9. Locked project format

`.singularity` ZIP bundle:
- `project.json` — canonical model.
- `assets/` — audio samples, recordings, thumbnails.
- `plugin-states/` — per-plugin state blobs.
- `sessions/` — chat/agent history.
- `meta.json` — version, timestamps.

## 10. Locked platforms

- macOS Intel + Apple Silicon (hard target).
- Linux x64 (hard target).
- Web app (hard target).
- Windows 10/11 (opportunistic, not a blocker).
- VS Code extension (dropped from v1.0).

## 11. Locked quality gates

- TypeScript strict mode.
- Biome lint/format.
- clang-format / clang-tidy for C++.
- Unit tests for shared logic and engine model.
- Integration tests for backend API.
- E2E tests for critical flows.
- Separate reviewer agent for every PR.
- No stubs/MVPs/placeholders merged into `integration/fl-studio-rewrite`.

## 12. Explicitly out of v1.0

- Proprietary FL Studio plugins (Sytrus, Harmor, FLEX full, Gross Beat).
- Distribution service integration.
- ReWire.
- 32-bit plugin bridge.
- Full video editor (post-v1.0 roadmap item).
