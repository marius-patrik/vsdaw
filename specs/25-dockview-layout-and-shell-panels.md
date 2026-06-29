# Spec 25: Dockview Layout and Shell Panels

## Objective

Define the Singularity shell built on Dockview: a dockable, tabbed, multi-window panel host that registers every DAW, IDE, and agent panel, persists named layouts, manages detachable multi-monitor windows, and provides the global toolbar, status bar, UI-scaling, and theme services used by every other panel spec.

## Motivation

Full FL Studio parity depends on layout freedom: dockable panels, saved custom layouts, detachable multi-monitor windows, a customizable toolbar, and a status bar. A single shell layer lets individual panel specs focus on their content and state without re-implementing docking, windowing, or chrome. It is also the integration surface for the design system (Spec 24), the backend API (Spec 23), and the Tauri desktop shell (Spec 17).

## Scope

### In scope

- Dockview integration in `packages/ui/shell`.
- A typed panel registry that maps every `PanelId` to a React component, tab renderer, default position, and lifecycle rules.
- A default FL Studio-like layout and user-defined layout save/load/reset.
- Detachable panels on multi-monitor setups:
  - Tauri desktop: native OS windows via Tauri multi-window commands.
  - Web app: Dockview `addPopoutGroup` against `/popout.html`.
- Cross-window shell state synchronization (transport position, selection, theme, scale).
- Edge groups for persistent side/bottom panels (Browser, Mixer/Graph, Channel Rack/Terminal).
- Global toolbar with customizable button order/visibility.
- Global status bar with transport state, load meters, project name, and context hint.
- UI scaling at 75%, 100%, 125%, 150%, 200%.
- Global keyboard shortcut dispatch for opening/focusing panels (F5–F9 and single-key tool switches in editors).
- Layout persistence backend: REST endpoints and WebSocket events.
- Theme integration: apply the active VS Code theme class to the shell and propagate CSS custom properties.

### Out of scope

- Internal behavior of DAW panels (Playlist, Piano Roll, Channel Rack, Mixer, Browser, Graph) — covered by Specs 26–30.
- AI agent/chat internals — covered by Spec 35.
- Theme token mapping itself — covered by Spec 24.
- Settings persistence beyond layout/toolbar/scale — covered by Spec 23 (Backend API).
- Native plugin editor window embedding behavior — covered by the plugin-hosting spec.
- Project model and shared message envelopes — covered by Spec 19.

## Related decisions

All `docs/decisions.md` entries from 2026-06-25, especially:

- Pivot to standalone FL Studio parity.
- Panel system: Dockview.
- Theme system: VS Code theme JSON + CSS custom properties + Tailwind.
- Window and panel behavior: dockable panels and detachable multi-monitor windows.
- VS Code extension dropped from v1.0.
- Tauri v2 desktop shell and JUCE sidecar.
- Backend framework: Fastify + `@fastify/websocket`.
- Quality bar: no stubs, MVPs, or placeholders; binary acceptance criteria.

## Detailed design

### Subsystem overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Shell (packages/ui/shell)                 │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐   │
│  │   Toolbar    │  │         DockviewReact                    │   │
│  │  (custom)    │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  └──────────────┘  │  │ Browser  │ │ Playlist │ │ Mixer    │  │   │
│  ┌──────────────┐  │  │ (left)   │ │ (center) │ │ (right)  │  │   │
│  │  Status Bar  │  │  └──────────┘ └──────────┘ └──────────┘  │   │
│  └──────────────┘  └──────────────────────────────────────────┘   │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ Zustand + ShellApi
┌──────────────────────────────▼─────────────────────────────────────┐
│                Backend layout service (packages/backend)           │
│  REST: /api/v1/layouts  │  WS: shell.* events                      │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ user data dir / .singularity
```

The shell owns the `DockviewReact` instance, a `ShellApi` object exposed through a React context, and a Zustand store. Individual panel components receive a typed `panelId`, `params`, and the `ShellApi` through React props/context. The backend stores layouts and toolbar configurations on disk and broadcasts layout changes over the existing WebSocket.

### Data model

All schemas live in `packages/shared/src/shell/`.

```ts
// packages/shared/src/shell/panel.ts
import { z } from 'zod';

export const PanelIdSchema = z.enum([
  // DAW panels
  'playlist',
  'piano-roll',
  'channel-rack',
  'mixer',
  'browser',
  'graph',
  'video',
  // IDE / agent panels
  'terminal',
  'embedded-browser',
  'monaco',
  'chat',
  // Utility panels
  'settings',
  'export',
  'plugin-editor',
  'hint-panel',
]);
export type PanelId = z.infer<typeof PanelIdSchema>;

export const PanelKindSchema = z.enum(['daw', 'ide', 'agent', 'plugin', 'utility']);
export type PanelKind = z.infer<typeof PanelKindSchema>;

export const PanelPositionSchema = z.enum([
  'center',
  'left',
  'right',
  'bottom',
  'floating',
  'popout',
]);
export type PanelPosition = z.infer<typeof PanelPositionSchema>;

export const PanelDefinitionSchema = z.object({
  id: PanelIdSchema,
  component: z.string().min(1),
  title: z.string().min(1),
  kind: PanelKindSchema,
  defaultPosition: PanelPositionSchema,
  singleton: z.boolean().default(false),
  allowPopout: z.boolean().default(true),
  allowClose: z.boolean().default(true),
  defaultParams: z.record(z.unknown()).default({}),
});
export type PanelDefinition = z.infer<typeof PanelDefinitionSchema>;
```

Dynamic plugin-editor panels use a composite ID `plugin-editor:{instanceId}` and a runtime-registered definition cloned from the base `plugin-editor` definition.

```ts
// packages/shared/src/shell/layout.ts
export const SavedLayoutSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  isDefault: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeProjectId: z.string().nullable().default(null),
  uiScale: z.number().min(0.5).max(4).default(1),
  toolbarButtons: z.array(z.string()).default(() => [
    'play', 'stop', 'record', 'loop', 'metronome',
    'bpm', 'time-sig',
    'view-playlist', 'view-channel-rack', 'view-piano-roll', 'view-browser', 'view-mixer', 'view-graph',
    'export', 'settings',
  ]),
  edgeGroups: z.record(z.boolean()).default({ left: true, right: true, bottom: true }),
  // Opaque Dockview serialization; validated only as a JSON object.
  dockview: z.record(z.unknown()),
});
export type SavedLayout = z.infer<typeof SavedLayoutSchema>;

export const SavedLayoutSummarySchema = SavedLayoutSchema.pick({
  id: true,
  name: true,
  isDefault: true,
  updatedAt: true,
});
export type SavedLayoutSummary = z.infer<typeof SavedLayoutSummarySchema>;
```

```ts
// packages/shared/src/shell/state.ts
export interface ShellState {
  layoutId: string | null;
  uiScale: number;
  activePanelId: PanelId | null;
  toolbarButtons: string[];
  status: StatusBarState;
}

export interface StatusBarState {
  projectName: string | null;
  dirty: boolean;
  transport: 'stopped' | 'playing' | 'recording' | 'paused';
  position: string; // bars/beats/ticks display
  cpuLoadPercent: number;
  memoryMb: number;
  sampleRate: number;
  bufferSize: number;
  hint: string;
}
```

### API / interface

#### ShellApi

Exposed via a React context in `packages/ui/shell/ShellContext.tsx`.

```ts
// packages/shared/src/shell/shell-api.ts
import type { DockviewApi, IDockviewPanel } from 'dockview-react';

export interface OpenPanelOptions<TParams extends Record<string, unknown> = Record<string, unknown>> {
  id: PanelId;
  params?: TParams;
  position?: PanelPosition;
  inactive?: boolean;
}

export interface ShellApi {
  readonly api: DockviewApi;
  readonly state: ShellState;

  registerPanel(def: PanelDefinition): void;
  unregisterPanel(id: PanelId): void;

  openPanel<TParams extends Record<string, unknown>>(
    options: OpenPanelOptions<TParams>
  ): IDockviewPanel;
  closePanel(id: PanelId): boolean;
  focusPanel(id: PanelId): boolean;
  togglePanel(id: PanelId): IDockviewPanel | null;

  toggleEdgeGroup(position: 'left' | 'right' | 'bottom'): void;
  popoutGroup(groupId: string): Promise<string | null>; // returns windowId or null
  closePopout(windowId: string): Promise<void>;

  saveLayout(name: string): Promise<SavedLayout>;
  restoreLayout(layoutId: string): Promise<void>;
  resetLayout(): Promise<void>;
  deleteLayout(layoutId: string): Promise<void>;

  setUiScale(scale: number): void;
  setToolbarButtons(buttonIds: string[]): Promise<void>;
  setStatus(partial: Partial<StatusBarState>): void;

  dispatchShortcut(shortcutId: string): boolean;
}
```

`ShellApi` is created by `createShellApi(dockviewApi, windowManager, backendClient, initialState): ShellApi`.

#### Backend REST endpoints

Implemented in `packages/backend/src/layout/layout.routes.ts` under the existing Fastify server.

| Method | Path | Request body | Response | Description |
|--------|------|--------------|----------|-------------|
| `GET` | `/api/v1/layouts` | — | `SavedLayoutSummary[]` | List saved layouts. |
| `GET` | `/api/v1/layouts/default` | — | `SavedLayout` | Factory default layout. |
| `GET` | `/api/v1/layouts/:layoutId` | — | `SavedLayout` | Load a single layout. |
| `POST` | `/api/v1/layouts` | `Pick<SavedLayout, 'name' \| 'dockview' \| 'uiScale' \| 'toolbarButtons' \| 'edgeGroups'>` | `SavedLayout` | Save a new or updated layout. If `name` matches an existing non-default layout, it updates that record. |
| `DELETE` | `/api/v1/layouts/:layoutId` | — | `204` | Delete a layout. Default layout cannot be deleted. |
| `POST` | `/api/v1/layouts/:layoutId/apply` | — | `204` | Notify backend that this layout is active for the current project/session. |
| `GET` | `/api/v1/toolbar` | — | `{ buttons: string[] }` | Load current toolbar configuration. |
| `PUT` | `/api/v1/toolbar` | `{ buttons: string[] }` | `{ buttons: string[] }` | Save toolbar configuration. |

All endpoints validate request/response bodies with the shared Zod schemas. Errors return `{ error: string }` with HTTP 400/404/500.

#### WebSocket events

Broadcast over the existing `/ws` route defined in Spec 23.

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `shell.layoutChanged` | Backend → UI | `{ layoutId: string, name: string }` | A layout was saved, restored, or reset. |
| `shell.panelOpened` | UI → Backend (and broadcast) | `{ panelId: string, groupId: string }` | Panel added to the layout. |
| `shell.panelClosed` | UI → Backend (and broadcast) | `{ panelId: string }` | Panel removed. |
| `shell.panelFocused` | UI → Backend (and broadcast) | `{ panelId: string }` | Active panel changed. |
| `shell.uiScaleChanged` | UI → Backend | `{ scale: number }` | User changed UI scale. |
| `shell.toolbarChanged` | Backend → UI | `{ buttons: string[] }` | Toolbar configuration persisted. |
| `shell.statusChanged` | Backend → UI | `Partial<StatusBarState>` | Transport/load/project updates for the status bar. |

#### Window manager abstraction

`packages/ui/shell/window-manager.ts`:

```ts
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShellEvent {
  sourceWindowId: string;
  type: 'transport' | 'selection' | 'theme' | 'scale' | 'layout';
  payload: unknown;
}

export interface WindowManager {
  readonly windowId: string;
  popout(groupId: string, bounds?: Rectangle): Promise<string | null>;
  close(windowId: string): Promise<void>;
  broadcast(event: ShellEvent): void;
  onEvent(listener: (event: ShellEvent) => void): () => void;
}
```

Two implementations:

- `WebWindowManager`: uses `DockviewApi.addPopoutGroup` for popouts and `BroadcastChannel('singularity-shell')` for event sync.
- `TauriWindowManager`: uses Tauri commands for native windows and Tauri events for sync.

#### Tauri commands

Implemented in `packages/desktop/src-tauri/src/commands/window.rs` and exposed through `invoke`:

```rs
#[tauri::command]
async fn open_popout_window(
    app: AppHandle,
    window_label: String,
    panel_id: String,
    layout_json: String,
    bounds: Option<WindowBounds>,
) -> Result<(), String>;

#[tauri::command]
async fn close_popout_window(
    app: AppHandle,
    window_label: String,
) -> Result<(), String>;

#[tauri::command]
async fn sync_shell_event(
    app: AppHandle,
    target_window_label: Option<String>,
    event_json: String,
) -> Result<(), String>;
```

The Tauri popout window loads the same Rsbuild entry (`index.html`) with query parameters `?popout=1&panelId={panelId}`. In popout mode the app renders a minimal `DockviewReact` instance hosting only the popped-out group, deserialized from `layout_json`.

### UI/UX

#### Default layout

The factory default (`SavedLayout` `isDefault: true`) is:

- **Top**: fixed global toolbar (`44px` height).
- **Left edge group** (`240px`): `browser` tab.
- **Center grid**: `playlist` panel active.
- **Right edge group** (`280px`): `mixer` tab and `graph` tab.
- **Bottom edge group** (`220px`): `channel-rack` tab and `terminal` tab.
- **Bottom**: fixed global status bar (`24px` height).

Piano Roll and plugin editors open in the center grid by default but can be dragged anywhere. `video`, `embedded-browser`, `monaco`, `chat`, and `export` panels are opened on demand.

#### Toolbar

The toolbar is a fixed-height flex container outside Dockview. It has three zones: left (transport/project), center (view tabs), right (tools/settings). Buttons are rendered from `toolbarButtons` order. Each button ID maps to a registry entry in `packages/ui/shell/toolbarButtons.ts`:

```ts
export interface ToolbarButtonDef {
  id: string;
  label: string;
  icon: LucideIcon;
  action: (shell: ShellApi) => void;
  shortcut?: string;
}
```

Default order is listed in the `SavedLayout` schema. Users can reorder or hide buttons; the configuration is persisted through `/api/v1/toolbar` and included in saved layouts.

#### Status bar

A fixed bottom strip (`24px`) displays, left to right:

1. Project name + dirty dot.
2. Context hint (`hint` from `StatusBarState`).
3. Transport state pill (`stopped`/`playing`/`recording`/`paused`).
4. Musical position (`StatusBarState.position`).
5. CPU load and memory.
6. Sample rate / buffer size.
7. Current UI scale percentage.

The status bar subscribes to backend `shell.statusChanged` events and to engine transport/ metering streams already defined in Spec 23.

#### Panel tab context menu

Right-clicking a tab shows:

- Close (hidden if `allowClose: false`).
- Close others.
- Close all.
- Duplicate (only for non-singleton panels).
- Maximize group.
- Pop out into new window (hidden if `allowPopout: false` or unsupported).
- Move to edge group (Left / Right / Bottom / Center).

#### Keyboard shortcuts

The shell registers global handlers for view-switching shortcuts:

- `F5` → open/focus `playlist`.
- `F6` → open/focus `channel-rack`.
- `F7` → open/focus `piano-roll`.
- `F8` → open/focus `browser`.
- `F9` → open/focus `mixer`.
- `Ctrl/Cmd + Shift + P` → open command palette panel.

When a canvas editor (Playlist, Piano Roll) is focused, single-key tool switching is routed to the active panel via `ShellApi.dispatchShortcut` and consumed by the panel.

### Algorithms / behavior

#### Layout save/restore

1. On `saveLayout(name)`:
   - Call `dockviewApi.toJSON()`.
   - Strip non-serializable state (panel component refs).
   - Build `SavedLayout` with `dockview` equal to the Dockview JSON.
   - `POST /api/v1/layouts`.
2. On `restoreLayout(layoutId)`:
   - `GET /api/v1/layouts/:layoutId`.
   - Set `uiScale`, `toolbarButtons`, `edgeGroups` from the saved record.
   - Call `dockviewApi.fromJSON(savedLayout.dockview, { reuseExistingPanels: true })`.
   - Emit `shell.layoutChanged`.
3. On `resetLayout()`:
   - `GET /api/v1/layouts/default` and restore it.

#### Singleton enforcement

Before calling `dockviewApi.addPanel`, `openPanel` checks `dockviewApi.panels.find(p => p.id === options.id)`. If found and the definition is `singleton`, it activates the existing panel and returns it. If `singleton` is false, it opens a new panel with an auto-generated unique ID `'{id}:{n}'`.

#### Multi-window state sync

When any window or popout changes a shared value, the local `WindowManager.broadcast` emits a `ShellEvent`. Other windows receive it and update their Zustand store. Events are idempotent: the receiver compares the payload timestamp/version and ignores stale events.

#### UI scaling

`setUiScale(scale)` writes `--singularity-ui-scale: {scale}` on `document.documentElement`. All design-token sizes in `packages/ui/styles/tokens.css` are multiplied by this variable. Valid scales are `0.75`, `1`, `1.25`, `1.5`, and `2`.

#### Project-open layout selection

When the backend finishes loading a `.singularity` project, it sends `shell.layoutChanged` with the last layout ID recorded for that project (or the default). The shell calls `restoreLayout`. If the saved layout references panels that the current project cannot support (e.g., a plugin editor for a missing plugin), the missing panel is skipped and a warning is logged.

## Implementation plan

1. Create `packages/shared/src/shell/` with `panel.ts`, `layout.ts`, `state.ts`, `shell-api.ts`, and Zod schemas. Add Jest tests for schema validation.
2. Create `packages/ui/shell/` with:
   - `Shell.tsx` — root shell component.
   - `ShellProvider.tsx` — React context + `createShellApi`.
   - `usePanelRegistry.ts` — panel registration map.
   - `defaultLayout.ts` — factory default layout JSON.
   - `WindowManager.ts`, `WebWindowManager.ts`, `TauriWindowManager.ts`.
   - `Toolbar.tsx`, `StatusBar.tsx`, `HintBar.tsx`.
3. Create `packages/backend/src/layout/` with `layout.service.ts` and `layout.routes.ts`, wired into the Fastify app from Spec 23.
4. Add Tauri commands in `packages/desktop/src-tauri/src/commands/window.rs` and the popout-mode query-parameter handling in `packages/web/src/main.tsx`.
5. Add `/popout.html` to `packages/web/public/` and configure Rsbuild to copy it.
6. Wire the shell into `packages/web/src/App.tsx` and the Tauri main window.
7. Implement integration tests for layout endpoints and E2E tests for desktop/web popouts.

## Testing strategy

- **Unit tests** (`packages/shared`):
  - `SavedLayout` schema rejects invalid scales, missing names, and malformed Dockview JSON.
  - Panel registry rejects duplicate IDs and resolves dynamic `plugin-editor:*` IDs.
  - `WindowManager` event serialization round-trips.
- **Integration tests** (`packages/backend`):
  - `GET /api/v1/layouts/default` returns a valid default layout.
  - `POST /api/v1/layouts` persists and returns a layout; `GET /api/v1/layouts/:id` retrieves it.
  - `PUT /api/v1/toolbar` persists button order; `GET /api/v1/toolbar` returns it.
  - WebSocket `shell.layoutChanged` is emitted after `POST /api/v1/layouts/:layoutId/apply`.
- **E2E tests** (`packages/desktop` and `packages/web`):
  - Default layout renders with Browser, Playlist, Mixer, Channel Rack, Terminal, Toolbar, and Status Bar visible.
  - Dragging the Mixer panel to the center creates a new group and serializes correctly.
  - Saving a layout, rearranging panels, and restoring reproduces the exact tab/group structure.
  - Tauri desktop pops out a group into a second OS window that stays in sync with transport state.
  - Web app pops out a group to `/popout.html` and receives `BroadcastChannel` shell events.
- **Visual regression**:
  - Screenshots of default layout at 100% and 150% scale are attached to the PR.

## Acceptance criteria

- [ ] `DockviewReact` is the only docking host in the app; no other panel containers exist.
- [ ] Every shipped panel has a registered `PanelDefinition` in `packages/ui/shell/panelRegistry.ts` and a deterministic `PanelId`.
- [ ] `ShellApi.openPanel({ id: 'mixer' })` activates an existing singleton `mixer` panel or creates it in the right edge group if absent.
- [ ] `ShellApi.saveLayout('My Layout')` calls `POST /api/v1/layouts` and the resulting record can be retrieved with `GET /api/v1/layouts/:id` and restored via `ShellApi.restoreLayout` to the same visible tab set and group structure.
- [ ] `GET /api/v1/layouts/default` always returns a valid factory default layout; `ShellApi.resetLayout()` restores it.
- [ ] Tauri desktop supports popping a Dockview group into a separate native OS window using `open_popout_window`; closing the popout window re-docks the group or closes it according to user preference.
- [ ] Web app supports popping a group into a same-origin `/popout.html` window using `addPopoutGroup`, and transport/selection changes propagate to the popout through `BroadcastChannel`.
- [ ] UI scale can be set to 75%, 100%, 125%, 150%, or 200%, and all shell chrome and canvas panels honor `--singularity-ui-scale` without clipping or overflow.
- [ ] The toolbar renders buttons in the order stored by `GET/PUT /api/v1/toolbar`, and reordering buttons persists across reloads.
- [ ] The status bar displays the current project name, dirty state, transport state, musical position, CPU load, sample rate, buffer size, and a context hint, all updated from backend events.
- [ ] `F5`–`F9` open/focus Playlist, Channel Rack, Piano Roll, Browser, and Mixer respectively; single-key tool shortcuts are routed to the focused canvas panel.
- [ ] No layout-related `TODO`, `FIXME`, or placeholder code is merged into `integration/fl-studio-rewrite`.

## Dependencies

- **Spec 17: Singularity v1.0 Standalone App Architecture** — provides monorepo layout, stack, and runtime diagram.
- **Spec 18: Monorepo and Build System** — provides Bun workspaces, Rsbuild, and Tauri build wiring.
- **Spec 19: Shared Protocol and Schemas** — provides message envelopes, Zod conventions, and project types.
- **Spec 23: Backend API** — provides Fastify server, WebSocket route, and authentication/authorization middleware.
- **Spec 17: Singularity v1.0 Standalone App Architecture** — provides the Tauri desktop shell, native window management commands, and auto-updater integration.

## Blocks

- **Specs 26–30: DAW Panel Designs** — Playlist, Channel Rack, Piano Roll, Mixer, Browser/Graph panels depend on the shell registry and layout services.
- **Spec 35: AI Agent System** — Terminal, Chat, Embedded Browser, and Monaco panels are hosted by the shell.
- **Spec 24: Design System and VS Code Theme Integration** — design tokens and primitive components are consumed by the shell chrome.

## Notes / open questions

- **Layout storage location**: Layouts are stored in the backend user-data directory (`<userData>/layouts/`) and referenced by ID from `project.json` via an `activeLayoutId` field. This avoids duplicating large layout JSON inside every project bundle while still allowing per-project defaults.
- **Dynamic plugin-editor panels**: Plugin editors are registered at runtime with IDs `plugin-editor:{instanceId}`. They inherit the base `plugin-editor` definition, are singleton per instance, and are saved/restored inside the Dockview layout.
- **Web popout security**: `/popout.html` is served from the same origin and contains only the shell bootstrap. No project secrets or tokens are passed in the URL; cross-window state travels through `BroadcastChannel` events authenticated by the existing WebSocket session.
- **Multi-monitor on Linux**: Tauri multi-window support on Linux x64 is required; if a platform limitation prevents native popouts, the implementation degrades to floating Dockview groups and documents the limitation.
