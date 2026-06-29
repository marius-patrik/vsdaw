# VSDAW Architectural Decisions Log

This file records major product and engineering decisions. Every entry must include the date, the decision, the rationale, and any alternatives considered. Reversals are recorded as new entries, never by editing old ones.

## 2026-06-25 — Project direction

**Decision:** Pivot VSDAW from a VS Code extension into a full standalone DAW with FL Studio / OpenDAW Studio parity.

**Rationale:**
- The current VS Code webview architecture cannot deliver professional DAW UX (floating panels, multi-monitor, coherent UI).
- User feedback consistently reports the existing UI as broken and incomplete.
- A standalone app enables a real backend, native plugin hosting, and a modern component-based UI.

**Alternatives considered:**
- Keep patching the VS Code extension. Rejected because the architecture has hard limits.
- Port panels only. Rejected because the user requires a complete UI/UX rebuild, not a refactor.

## 2026-06-25 — Frontend build tool

**Decision:** Use **Rsbuild** for all frontend packages (`packages/ui`, `packages/web`, `packages/desktop` UI).

**Rationale:**
- Explicit user requirement.
- Rsbuild is Rspack-based, fast, and purpose-built for React apps.

**Alternatives considered:**
- Vite. Rejected per user directive.
- esbuild. Rejected per user directive.

## 2026-06-25 — Audio engine backend

**Decision:** Use a **JUCE-based native C++ engine** as the backend, packaged as a Tauri sidecar.

**Rationale:**
- OpenDAW's browser/Web Audio engine cannot host native VST3/AU/CLAP plugins.
- Full FL Studio parity requires real plugin hosting.
- JUCE has a mature, production-tested plugin host (`AudioPluginHost`) and handles audio I/O, MIDI, mixing, and routing.

**Alternatives considered:**
- Keep OpenDAW browser engine. Rejected because it cannot load native VSTs.
- Rust engine with `vst3-sys` / `plugin_host` / `maolan-engine`. Rejected as less mature for plugin compatibility.

## 2026-06-25 — Project file format

**Decision:** Use an OpenDAW-compatible `.vsdaw` ZIP bundle as the native save format. Add **FLP import** as a separate, lower-priority feature.

**Rationale:**
- FLP is a proprietary, reverse-engineered format.
- A native format gives us full control over serialization and plugin state.
- FLP import is valuable for migration but cannot be the canonical format.

**Alternatives considered:**
- Make FLP the native format. Rejected because it is closed and would limit plugin state serialization.

## 2026-06-25 — AI agent integration

**Decision:** Add first-class AI agent integration to VSDAW.

**Rationale:**
- User request.
- Enables natural-language project editing, code/plugin generation, and workflow assistance inside the DAW.

**Scope:**
- Generic skill format compatible with Claude / Codex style tool definitions.
- CLI tool for agent interaction.
- MCP (Model Context Protocol) server exposing the DAW as a context provider.
- Plugin system wrapping agent capabilities.
- Integrated terminal panel inside the app for agent chat.

**Alternatives considered:**
- External chat only. Rejected because the user wants the terminal integrated.
- Vendor-specific API only. Rejected in favor of a generic skill format.

## 2026-06-25 — Quality bar

**Decision:** No MVPs, no stubs, no placeholders, no skipped features. Every shipped component must be complete, tested, and wired end-to-end.

**Rationale:**
- Explicit user requirement.
- Avoids technical debt and broken UI controls.

**Enforcement:**
- Every PR reviewed by a dedicated reviewer agent against a checklist.
- No `TODO`/`FIXME` in merged code unless linked to a tracked issue.
- Acceptance criteria must be binary and verifiable.

## 2026-06-25 — Execution order

**Decision:** Build in multiple sequential batches with parallel workstreams inside each batch. The engine backend and API contract come before UI panels that depend on it.

**Rationale:**
- The JUCE backend is the highest-risk and most coupled component.
- UI panels can be built in parallel once the backend API is stable.
- The user confirmed this will not be a single swarm.

**Batch outline:**
1. Infrastructure + design system + AI agent system scaffolding.
2. JUCE engine + backend API + project model.
3. Core DAW panels (channel rack, piano roll, playlist, mixer, browser, graph).
4. Tauri shell + VS Code embedder + QA.

## 2026-06-25 — AI model provider strategy

**Decision:** Use a **provider-agnostic generic skill format** with adapters for Claude, Codex, OpenAI, and future providers.

**Rationale:**
- Avoids vendor lock-in.
- A single skill definition can be translated to Anthropic tools, OpenAI functions, or MCP tools at runtime.

**Alternatives considered:**
- Claude-only. Rejected because it excludes Codex and other models.
- Codex-only. Rejected for the same reason.

## 2026-06-25 — Integrated terminal backend

**Decision:** Use **xterm.js in the webview UI**, backed by a PTY proxy in the native backend/sidecar.

**Rationale:**
- Works across web app, Tauri desktop, and VS Code embedder with one implementation.
- Native backend can spawn real shells and stream output over WebSocket.

**Alternatives considered:**
- Tauri native PTY only. Rejected because it would not work in web or VS Code.
- Both xterm.js and native PTY. Rejected as unnecessary; xterm.js covers all targets.

## 2026-06-25 — MCP server transport

**Decision:** Support **both stdio and Server-Sent Events (SSE)** transports.

**Rationale:**
- stdio is simplest for CLI and local tooling.
- SSE enables remote/networked MCP clients.

**Alternatives considered:**
- stdio only. Rejected because it limits remote use cases.
- SSE only. Rejected because it complicates local CLI usage.

## 2026-06-25 — Plugin hosting model

**Decision:** Host native plugins **in-process** inside the JUCE engine for v1.

**Rationale:**
- Lowest latency and simplest implementation.
- Out-of-process sandboxing can be added later without changing the UI/backend API.

**Alternatives considered:**
- Out-of-process sandbox per plugin. Rejected for v1 due to IPC complexity.
- Hybrid instruments/effects split. Rejected as unnecessary complexity.

## 2026-06-25 — Supported plugin formats

**Decision:** Support **VST3, AU, CLAP, LV2, and AAX** at launch.

**Rationale:**
- User wants full FL Studio parity and maximum plugin compatibility.
- AAX requires PACE signing for distribution, but scanning/loading can still be implemented for development/Pro Tools Developer builds.

**Alternatives considered:**
- VST3 only. Rejected because it excludes macOS AU and newer CLAP plugins.
- VST3 + AU only. Rejected because CLAP and LV2 are explicitly part of full parity.

## 2026-06-25 — Plugin editor window behavior

**Decision:** Embed plugin editor windows **inside the app UI by default**, with the option to pop any tab out into a separate floating window.

**Rationale:**
- Matches FL Studio tabbed plugin windows.
- Requires platform-specific embedding (HWND / X11 / NSView) but is expected for parity.

**Alternatives considered:**
- Always floating native windows. Rejected because it feels less integrated.
- Generic parameter panel only. Rejected because it breaks plugin GUI parity.

## 2026-06-25 — Audio thread model

**Decision:** Use a **single realtime audio callback** with lock-free queues for control/metering.

**Rationale:**
- Standard, predictable, low-latency model for JUCE-based hosts.
- Multi-threaded graph can be added later if CPU profiling demands it.

**Alternatives considered:**
- Multi-threaded audio graph. Rejected for v1 complexity.
- Process-per-plugin. Rejected because it conflicts with in-process hosting.

---

## 2026-06-25 — Project model

**Decision:** Use **FL Studio-style Channel Rack + Patterns + Playlist** as the primary model.

**Rationale:**
- Required for FL Studio workflow parity.
- Channel Rack drives instruments; Playlist arranges pattern/audio/automation clips.

**Alternatives considered:**
- Traditional track-based DAW. Rejected because it is not FL Studio parity.
- Hybrid instrument/audio split. Rejected as unnecessary complexity for v1.

## 2026-06-25 — Time representation

**Decision:** Support **multiple time representations** internally: ticks (PPQN), seconds, and bars/beats/ticks with sample-accurate offsets.

**Rationale:**
- FL Studio exposes musical time, real time, and sample-accurate editing depending on context.
- A single canonical representation (samples) can be projected into the others.

**Alternatives considered:**
- Ticks only. Rejected because audio regions need sample accuracy.
- Samples only. Rejected because MIDI/sequencer editing needs musical units.

## 2026-06-25 — Theme system

**Decision:** Implement the design system with **CSS custom properties + Tailwind CSS**.

**Rationale:**
- Works cleanly with Rsbuild.
- Runtime theme switching is trivial.
- Tokens map directly to Tailwind config and CSS variables.

**Alternatives considered:**
- CSS-in-JS. Rejected for performance and complexity.
- Sass variables. Rejected because runtime switching is harder.

## 2026-06-25 — Canvas rendering for editors

**Decision:** Use **HTML5 Canvas** for the timeline, piano roll, mixer, and routing graph.

**Rationale:**
- WebGL works in Tauri and browsers, but mixing React UI overlays with a WebGL surface is complex.
- HTML5 Canvas is sufficient for professional DAW editors (most DAWs use custom 2D raster backends).
- WebGL can be reconsidered later if profiling shows canvas as a bottleneck.

**Alternatives considered:**
- WebGL. Rejected for v1 due to complexity; possible future optimization.
- SVG. Rejected because large timelines and smooth scrolling are hard.

## 2026-06-25 — Stock plugins scope

**Decision:** Ship **full open-source equivalents** in v1.0: sampler, subtractive synth, drum machine, SoundFont player, and 8+ built-in effects.

**Rationale:**
- Required for FL Studio parity.
- Proprietary FL plugins (Sytrus, Harmor, FLEX full, Gross Beat) cannot be shipped; users can load them as third-party VSTs if they own them.

**Alternatives considered:**
- Minimal stock devices. Rejected because it breaks parity.
- No stock devices. Rejected because it is not a DAW replacement.

## 2026-06-25 — Creative AI tools in v1.0

**Decision:** Include **stem separation, chord progression tool, and loop starter / idea generator** in v1.0.

**Rationale:**
- User wants full FL Studio 2024+ parity.
- These are headline features in recent FL Studio versions.

## 2026-06-25 — Audio recording and editing

**Decision:** Include **full Edison-style audio recording and editing** in v1.0.

**Rationale:**
- FL Studio parity requires recording and destructive sample editing.
- Includes loop takes, waveform editor, cut/fade/normalize/reverse/time-stretch.

## 2026-06-25 — Routing and Patcher graph

**Decision:** Include **full Patcher-style modular graph + mixer routing** in v1.0.

**Rationale:**
- FL Studio's routing and Patcher are central to its workflow.
- Sends, returns, buses, sidechain, and visual node graph are all required.

## 2026-06-25 — AI agent context and control

**Decision:** The AI agent must receive **full project context** and have the ability to **drive any feature** in the DAW.

**Rationale:**
- User requirement: the agent should not be limited to a subset of operations.
- This means every backend API must be exposed as a tool/skill to the agent.

## 2026-06-25 — MIDI features in v1.0

**Decision:** Include **full MIDI support**: input/output device selection, typing keyboard to piano, MIDI learn, remote control, and MIDI file import/export.

**Rationale:**
- Required for FL Studio parity.
- MIDI learn and remote control are essential workflow features.

## 2026-06-25 — Export and mastering in v1.0

**Decision:** Include **WAV/FLAC/OGG/MP3 export** with sample rate/bit depth options, **split mixer tracks / stem export**, and **AI mastering via the agent**.

**Rationale:**
- AI mastering should be a capability of the agent/assistant using full project context and skills, not a separate external service.
- Distribution services are not in v1.0 unless explicitly requested later.

## 2026-06-25 — Window and panel behavior

**Decision:** Support **dockable panels and detachable multi-monitor windows** in v1.0.

**Rationale:**
- FL Studio's layout freedom is a core part of its workflow.
- Tauri and Dockview can support detachable windows.

## 2026-06-25 — Browser functionality

**Decision:** Include **file browser, plugin database with scanner/picker, and preset browser** in v1.0.

**Rationale:**
- Browser is central to FL Studio workflow.
- Drag-and-drop from browser to Channel Rack, Mixer, and Playlist is required.

## 2026-06-25 — Testing requirements

**Decision:** Full testing stack: unit tests for shared logic/engine model, integration tests for backend API, E2E tests for critical user flows, and a separate reviewer agent for every PR.

**Rationale:**
- User wants no stubs/MVPs and full quality.
- Reviewer agents enforce the no-placeholder policy.

## 2026-06-25 — Platform support

**Decision:** Primary v1.0 targets are **macOS (Intel + Apple Silicon), Linux x64, and web app**. **Windows 10/11 is included if it is low-effort** but is not a v1.0 blocker. **VS Code extension is dropped from v1.0.**

**Rationale:**
- Tauri and JUCE both support Windows, so builds are likely easy to add.
- User explicitly said Windows is "not necessary" but to "do it if it's easy."
- User decided to drop the VS Code extension package to focus on Tauri + web.

## 2026-06-25 — VS Code extension target

**Decision:** **Drop the VS Code extension from v1.0**.

**Rationale:**
- User decision to focus on Tauri desktop and web app.
- Can be revisited after v1.0.

## 2026-06-25 — Backend framework

**Decision:** Use **Fastify + `@fastify/websocket`** for the backend.

**Rationale:**
- Better than tRPC for this project because the agent/MCP/web app all need a universal REST/WebSocket API.
- Single server handles HTTP and WebSocket.
- Type safety comes from shared Zod schemas.

**Alternatives considered:**
- tRPC. Rejected because it does not fit the agent/MCP/web app surface well.
- Express. Rejected because Fastify has better TypeScript/WebSocket integration.
- Custom Node server. Rejected because Fastify provides the right primitives with less code.

## 2026-06-25 — Backend-to-engine transport

**Decision:** Use **local TCP/socket** between backend and JUCE engine.

**Rationale:**
- Decouples backend and engine.
- Works for both Tauri sidecar and standalone engine processes.
- More flexible than stdio for debugging and remote setups.

**Alternatives considered:**
- stdio. Rejected because it forces the engine to be a child process.
- Both stdio and socket. Rejected because a single local socket covers all cases.

## 2026-06-25 — React version

**Decision:** Use **React 19**.

**Rationale:**
- User decision.
- Latest React features; monitor library compatibility during implementation.

## 2026-06-25 — Embedded browser tab implementation

**Decision:** Use **iframe in web app** and **nested webview in Tauri**, both driven by the Playwright backend.

**Rationale:**
- Web app cannot run a native webview; iframe is the only option.
- Tauri can embed a nested webview for better isolation.
- Agent automation is backend-driven via Playwright regardless of shell.

## 2026-06-25 — Embedded browser tab

**Decision:** Include an **embedded browser tab** in the app with full navigation, tabs, and agent control.

**Rationale:**
- User request.
- Enables agent to research, download samples/plugins, and interact with web services without leaving the DAW.

**Implementation:**
- **Headless browser backend** (Playwright/Puppeteer) for agent automation: open URLs, read content, click/type, fill forms, download files.
- **In-app webview/iframe** for user browsing and viewing pages controlled by the agent.
- Agent can import downloaded files directly into the project.

**Agent permissions:**
- Open URLs and read page content.
- Click, type, fill forms.
- Download files and import into project.

## 2026-06-25 — AI agent permission model

**Decision:** Agent has **full permissions** but must **ask for confirmation before destructive actions**.

**Rationale:**
- User wants the agent to drive any feature, run terminal commands, and browse the web.
- Destructive actions (deleting project data, running shell commands, overwriting files) require explicit user approval.

**Permission levels:**
- Read project and provide advice.
- Modify project (tracks, plugins, notes, automation, export).
- Run external tools (terminal + browser).
- Full permissions with confirmation for destructive actions.

## 2026-06-25 — Cloud content integration

**Decision:** Include a **generic connector for cloud sample libraries** (Splice, Loopcloud, etc.) in v1.0.

**Rationale:**
- User wants cloud content integration.
- Implemented as third-party connectors via API keys, not FL Cloud itself.

## 2026-06-25 — Distribution integration

**Decision:** **No distribution service integration** in v1.0.

**Rationale:**
- User wants to export audio and distribute manually.
- Can be added later.

## 2026-06-25 — Windows 10/11 target

**Decision:** **Windows 10/11 is opportunistic**, not a hard v1.0 blocker.

**Rationale:**
- User said "I dont care if its easy do it but not necessary."
- macOS, Linux, and web app are the primary targets.

## 2026-06-25 — Video playback

**Decision:** Include **video playback with audio sync** in v1.0.

**Rationale:**
- User wants full parity including film-scoring workflows.
- Requires a video track in the playlist and frame-accurate sync with audio transport.

## 2026-06-25 — ReWire support

**Decision:** **No ReWire support** in v1.0.

**Rationale:**
- ReWire is deprecated/discontinued by Propellerhead.
- Modern alternatives include plugin hosting and audio/MIDI export.

## 2026-06-25 — 32-bit plugin bridge

**Decision:** **64-bit plugins only** in v1.0.

**Rationale:**
- Modern VST3/AU/CLAP plugins are 64-bit.
- 32-bit bridge adds significant complexity and crash risk.

## 2026-06-25 — Auto-updater

**Decision:** Include a **built-in auto-updater** for desktop builds in v1.0.

**Rationale:**
- Standard for desktop applications.
- Tauri has built-in updater support.

## 2026-06-25 — Post-v1.0 video editor

**Decision:** A **full video editor** will be implemented after the DAW is finished, as a separate set of video-specific tabs sharing the same backend.

**Rationale:**
- User request.
- Keeping it out of v1.0 avoids scope explosion.
- The backend should be designed so video support can be added later without rewriting the DAW.

## 2026-06-25 — Post-v1.0 image editor

**Decision:** A **full image editor** will be implemented after the DAW is finished, sharing the same backend and asset model.

**Rationale:**
- User request.
- The `.singularity` project bundle is designed to hold multiple media types (audio, video, images).

## 2026-06-25 — Monaco IDE integration

**Decision:** Include a **Monaco code editor** with a file explorer sidebar in v1.0, making the app usable as an IDE alongside the DAW.

**Rationale:**
- User request.
- Enables editing project scripts, agent skills, plugin code, and general source files inside the app.

**Scope:**
- Monaco editor as an openable tab.
- File explorer sidebar for the project directory.
- Agent can read and write files through Monaco.
- Terminal, browser, and Monaco tabs can be opened multiple times by the user.

## 2026-06-25 — Theme system based on VS Code themes

**Decision:** Use **VS Code theme JSON files** as the base for the entire app theme system, including Monaco styling.

**Rationale:**
- User request.
- VS Code themes are widely available and familiar.
- Monaco natively supports VS Code theme format.

**Scope:**
- Parse standard VS Code color theme JSON.
- Map VS Code tokens to app design tokens (e.g., `editor.background` to app background, `activityBar.background` to sidebar).
- Ship with curated themes (Dark+, Light+, and popular community themes).
- Allow users to import any VS Code theme file.

## 2026-06-25 — App and project rename to Singularity

**Decision:** Rename the app to **Singularity** and the project file format to **`.singularity`**.

**Rationale:**
- User decision.
- Stronger brand.
- `.singularity` bundle is designed to hold audio, video, images, code, agent sessions, and plugin states — a single creative project container.

**Scope:**
- App display name: Singularity.
- Project file extension: `.singularity`.
- Package names: `@singularity/*`.
- Repo renamed to `singularity` when implementation begins.

---

## Pending decisions

No pending architectural or parity decisions. Next step is to finalize the parity spec, write implementation specs, and open GitHub issues.
