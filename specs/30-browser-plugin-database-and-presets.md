# Spec 30: Browser, Plugin Database, and Presets

## Objective

Define the Browser panel, plugin scanner/database, preset manager, and cloud-content connector for Singularity v1.0 so users can browse files, plugins, and presets and load them into the Channel Rack, Mixer, or Playlist via drag-and-drop.

## Motivation

The Browser is the central content hub of the FL Studio workflow. Users need one place to find samples, MIDI files, projects, third-party instruments/effects, factory and user presets, and cloud sample libraries, then drag any item onto the composition surface. Without a complete, searchable, and persistent browser, the DAW cannot achieve workflow parity.

## Scope

### In scope

- File browser tree with folder navigation, quick-jump locations, favorites, and recent files.
- Audio file preview (play/stop) from the browser.
- Plugin scanner that discovers VST3/AU/CLAP/LV2/AAX plugins and writes descriptors to a local database.
- Plugin database with search, category filters, favorites, and blacklist management.
- Plugin picker view: grid of plugin cards with category filtering and search.
- Preset browser for plugins and stock devices (factory + user + project presets).
- Save, load, rename, and delete user presets.
- Drag-and-drop from Browser to Channel Rack, Mixer inserts, and Playlist.
- Cloud content connector framework (Splice, Loopcloud, and a testable custom provider) for remote sample browsing and import.
- Persistent metadata storage for all browser data.

### Out of scope

- Plugin audio processing, editor embedding, or delay compensation (covered by Spec 13: Plugin Hosting and the JUCE engine spec).
- Channel Rack, Piano Roll, Playlist, or Mixer panel UI details (covered by Specs 26–29).
- Audio device/driver settings (covered by the settings spec).
- Distribution service integration (explicitly out of v1.0).

## Related decisions

All 2026-06-25 decisions in `docs/decisions.md`, especially:

- Browser functionality (file browser, plugin database/scanner/picker, preset browser).
- Plugin hosting model: in-process JUCE hosting.
- Supported plugin formats: VST3, AU, CLAP, LV2, AAX.
- Plugin editor window behavior: embedded by default, optional pop-out.
- 64-bit plugins only.
- Project rename to Singularity / `.singularity`.
- Quality bar: no stubs, MVPs, or placeholders.

## Detailed design

### Subsystem overview

```
┌──────────────────────────────────────────────────────────────┐
│  UI (React + Zustand + Dockview)                             │
│  BrowserPanel / PluginPicker / PresetBrowser / FileTree      │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP + WebSocket
┌───────────────────────▼──────────────────────────────────────┐
│  Backend (Bun + Fastify)                                     │
│  BrowserService │ PluginDatabaseService │ CloudService      │
│  SQLite index   │ File system access    │ Provider modules  │
└───────────────┬──────────────────────────────────────────────┘
                │ local TCP/socket
┌───────────────▼──────────────────────────────────────────────┐
│  JUCE Engine (C++)                                           │
│  PluginDirectoryScanner │ plugin state serialization          │
└──────────────────────────────────────────────────────────────┘
```

The backend owns the canonical plugin database, preset index, favorites, recent files, and cloud connector state. The engine owns plugin scanning and state serialization. The UI renders browser trees/grids and dispatches drag-and-drop payloads to the backend.

### Decisions made in this spec

These are not in `docs/decisions.md`; they are required to make the browser concrete:

1. **Metadata index**: Use SQLite (via `bun:sqlite`) for the plugin database, preset index, favorites, recent files, and cloud connector configuration. It ships with the app and requires no external server.
2. **Plugin identity**: A plugin’s canonical `id` is the lowercase SHA-256 hex digest of `format:absolutePath`. Rescanning the same file produces the same id.
3. **Preset storage layout**:
   - User presets: `~/.singularity/presets/<pluginId>/<presetId>.spreset`.
   - Stock device factory presets: shipped under `packages/ui/public/presets/<deviceType>/`.
   - Project presets: stored inside the `.singularity` bundle at `presets/<presetId>.spreset`.
4. **Preset file format**: JSON with fields `version`, `pluginId`, `pluginName`, `meta`, and `state` (Base64-encoded plugin blob for third-party plugins; JSON object for stock devices).
5. **Cloud connector interface**: A generic provider interface implemented as backend modules. A `custom` provider is included for testing and user-built integrations.
6. **Browser drag payload**: All draggable browser items expose the same typed payload so drop targets do not need to parse multiple MIME types.
7. **Plugin icons**: If the plugin binary exposes an icon, the engine returns a PNG data URI; otherwise the UI renders a generated placeholder (two-letter initials on a category-colored surface).
8. **File watching**: Manual refresh is required; optional OS-level file watchers may be added later without changing the API.

### Data model

All schemas live in `packages/shared/src/schemas/browser.ts` and are enforced by Zod on the backend and in shared hooks.

```ts
import { z } from "zod";

export const PluginFormatSchema = z.enum(["vst3", "au", "clap", "lv2", "aax"]);
export type PluginFormat = z.infer<typeof PluginFormatSchema>;

export const PluginCategorySchema = z.enum(["instrument", "effect", "midi", "other"]);
export type PluginCategory = z.infer<typeof PluginCategorySchema>;

export const PluginParameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultValue: z.number(),
  min: z.number(),
  max: z.number(),
  automatable: z.boolean(),
});

export const PluginFactoryPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const PluginDescriptorSchema = z.object({
  id: z.string().length(64),
  name: z.string().min(1),
  vendor: z.string(),
  version: z.string(),
  format: PluginFormatSchema,
  category: PluginCategorySchema,
  subcategories: z.array(z.string()),
  path: z.string().min(1),
  isInstrument: z.boolean(),
  isEffect: z.boolean(),
  hasEditor: z.boolean(),
  parameters: z.array(PluginParameterSchema).optional(),
  factoryPresets: z.array(PluginFactoryPresetSchema).optional(),
  favorite: z.boolean(),
  blacklisted: z.boolean(),
  blacklistReason: z.string().optional(),
  lastScannedAt: z.string().datetime(),
  iconUrl: z.string().optional(),
});
export type PluginDescriptor = z.infer<typeof PluginDescriptorSchema>;

export const DeviceTypeSchema = z.enum([
  "sampler",
  "subtractive-synth",
  "drum-machine",
  "soundfont-player",
  "effect-chain",
  "unknown",
]);

export const PresetDescriptorSchema = z.object({
  id: z.string().length(64),
  pluginId: z.string().length(64).optional(),
  deviceType: DeviceTypeSchema.optional(),
  name: z.string().min(1),
  author: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  filePath: z.string().optional(),
  isFactory: z.boolean(),
  isProject: z.boolean(),
  projectId: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});
export type PresetDescriptor = z.infer<typeof PresetDescriptorSchema>;

export const FileNodeKindSchema = z.enum([
  "audio",
  "midi",
  "project",
  "preset",
  "folder",
  "other",
]);

export const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(["file", "folder", "section"]),
    name: z.string(),
    path: z.string(),
    kind: FileNodeKindSchema,
    ext: z.string(),
    size: z.number().optional(),
    modifiedAt: z.string().datetime().optional(),
    children: z.array(FileNodeSchema).optional(),
  })
);
export type FileNode = z.infer<typeof FileNodeSchema>;

export const BrowserSectionSchema = z.enum([
  "files",
  "plugins",
  "presets",
  "cloud",
  "favorites",
  "recent",
]);
export type BrowserSection = z.infer<typeof BrowserSectionSchema>;

export const CloudProviderSchema = z.enum(["splice", "loopcloud", "custom"]);

export const CloudConnectorSchema = z.object({
  id: z.string(),
  provider: CloudProviderSchema,
  displayName: z.string(),
  enabled: z.boolean(),
  authenticated: z.boolean(),
  rootNodeId: z.string().optional(),
  config: z.record(z.unknown()),
});
export type CloudConnector = z.infer<typeof CloudConnectorSchema>;

export const BrowserDragPayloadSchema = z.object({
  source: z.literal("browser"),
  kind: z.enum(["plugin", "preset", "file", "cloud-file"]),
  pluginId: z.string().length(64).optional(),
  presetId: z.string().length(64).optional(),
  filePath: z.string().optional(),
  cloudFileId: z.string().optional(),
});
export type BrowserDragPayload = z.infer<typeof BrowserDragPayloadSchema>;
```

#### SQLite schema

The backend creates the following tables on first start:

```sql
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  version TEXT NOT NULL,
  format TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategories TEXT NOT NULL, -- JSON array
  path TEXT NOT NULL UNIQUE,
  isInstrument INTEGER NOT NULL,
  isEffect INTEGER NOT NULL,
  hasEditor INTEGER NOT NULL,
  parameters TEXT,             -- JSON
  factoryPresets TEXT,         -- JSON
  favorite INTEGER NOT NULL DEFAULT 0,
  blacklisted INTEGER NOT NULL DEFAULT 0,
  blacklistReason TEXT,
  lastScannedAt TEXT NOT NULL
);

CREATE TABLE presets (
  id TEXT PRIMARY KEY,
  pluginId TEXT,
  deviceType TEXT,
  name TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT NOT NULL,          -- JSON array
  filePath TEXT,
  isFactory INTEGER NOT NULL,
  isProject INTEGER NOT NULL DEFAULT 0,
  projectId TEXT,
  FOREIGN KEY(pluginId) REFERENCES plugins(id)
);

CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  path TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE recent_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  section TEXT NOT NULL,
  openedAt TEXT NOT NULL
);

CREATE TABLE cloud_connectors (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  displayName TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  authenticated INTEGER NOT NULL,
  rootNodeId TEXT,
  config TEXT NOT NULL         -- JSON
);
```

### API / interface

#### HTTP endpoints

All routes are mounted under `/api/v1`.

| Method | Path | Query / Body | Response |
|---|---|---|---|
| `GET` | `/browser/tree` | `section`, `path`, `depth` (default 1) | `FileNode[]` |
| `GET` | `/browser/locations` | — | `FileNode[]` |
| `GET` | `/browser/favorites` | — | `FileNode[]` |
| `POST` | `/browser/favorites` | `{ section, path }` | `FileNode` |
| `DELETE` | `/browser/favorites/:id` | — | `204` |
| `GET` | `/browser/recent` | `limit` (default 20) | `FileNode[]` |
| `POST` | `/browser/preview` | `{ path, action: "play" \| "stop" }` | `204` |
| `GET` | `/plugins` | `category`, `format`, `query`, `favorite`, `includeBlacklisted` | `PluginDescriptor[]` |
| `GET` | `/plugins/:id` | — | `PluginDescriptor` |
| `POST` | `/plugins/scan` | `{ paths?: string[] }` | `{ jobId: string }` |
| `POST` | `/plugins/scan/:jobId/cancel` | — | `204` |
| `POST` | `/plugins/:id/favorite` | `{ favorite: boolean }` | `PluginDescriptor` |
| `POST` | `/plugins/:id/blacklist` | `{ blacklisted: boolean, reason?: string }` | `PluginDescriptor` |
| `GET` | `/plugins/:id/presets` | `includeFactory`, `includeUser`, `includeProject` | `PresetDescriptor[]` |
| `POST` | `/plugins/:id/presets` | `{ pluginInstanceId, name, category, tags, isProject? }` | `PresetDescriptor` |
| `GET` | `/presets/:presetId` | — | `PresetDescriptor` |
| `PATCH` | `/presets/:presetId` | `{ name?, category?, tags? }` | `PresetDescriptor` |
| `DELETE` | `/presets/:presetId` | — | `204` |
| `POST` | `/presets/:presetId/load` | `{ pluginInstanceId }` | `204` |
| `GET` | `/cloud/connectors` | — | `CloudConnector[]` |
| `POST` | `/cloud/connectors` | `{ provider, displayName, config }` | `CloudConnector` |
| `PATCH` | `/cloud/connectors/:id` | `{ enabled?, config? }` | `CloudConnector` |
| `DELETE` | `/cloud/connectors/:id` | — | `204` |
| `GET` | `/cloud/connectors/:id/tree` | `nodeId?` | `FileNode[]` |
| `POST` | `/cloud/connectors/:id/import` | `{ nodeId, destinationPath? }` | `{ filePath: string }` |

#### WebSocket events

The backend emits these events to all connected UI clients:

- `plugin.scan.started` `{ jobId: string }`
- `plugin.scan.progress` `{ jobId: string; scanned: number; total: number; currentPath?: string }`
- `plugin.scan.completed` `{ jobId: string; added: number; updated: number; removed: number }`
- `plugin.scan.failed` `{ jobId: string; error: string }`
- `plugin.database.updated` `{ changedIds: string[] }`
- `browser.favorites.changed` `{ ids: string[] }`
- `browser.recent.changed` `{ ids: string[] }`
- `cloud.connector.changed` `{ connectorId: string }`

#### Engine command protocol

Over the local TCP/socket channel (`docs/architecture.md`):

**Scan request**

Backend → Engine:

```json
{
  "id": "<uuid>",
  "type": "plugin.scan",
  "payload": {
    "formats": ["vst3", "au", "clap", "lv2", "aax"],
    "paths": ["/Library/Audio/Plug-Ins", "~/Library/Audio/Plug-Ins", ...]
  }
}
```

Engine → Backend:

```json
{
  "id": "<uuid>",
  "type": "plugin.scan.result",
  "payload": {
    "plugins": [ /* PluginDescriptor[] */ ]
  }
}
```

**Preset state request**

Backend → Engine:

```json
{
  "id": "<uuid>",
  "type": "plugin.getState",
  "payload": { "instanceId": "<uuid>" }
}
```

Engine → Backend:

```json
{
  "id": "<uuid>",
  "type": "plugin.state",
  "payload": { "instanceId": "<uuid>", "state": "<base64>" }
}
```

**Preset load request**

Backend → Engine:

```json
{
  "id": "<uuid>",
  "type": "plugin.setState",
  "payload": { "instanceId": "<uuid>", "state": "<base64>" }
}
```

#### Backend service signatures

`packages/backend/src/browser/browser.service.ts`:

```ts
export interface PluginFilters {
  category?: PluginCategory;
  format?: PluginFormat;
  query?: string;
  favorite?: boolean;
  includeBlacklisted?: boolean;
}

export async function startPluginScan(paths?: string[]): Promise<string>;
export async function cancelPluginScan(jobId: string): Promise<void>;
export async function listPlugins(filters: PluginFilters): Promise<PluginDescriptor[]>;
export async function getPlugin(id: string): Promise<PluginDescriptor>;
export async function setPluginFavorite(id: string, favorite: boolean): Promise<PluginDescriptor>;
export async function setPluginBlacklist(
  id: string,
  blacklisted: boolean,
  reason?: string
): Promise<PluginDescriptor>;
export async function listPresets(
  pluginId: string,
  options?: { includeFactory?: boolean; includeUser?: boolean; includeProject?: boolean }
): Promise<PresetDescriptor[]>;
export async function saveUserPreset(
  pluginInstanceId: string,
  meta: { name: string; category: string; tags: string[]; isProject?: boolean }
): Promise<PresetDescriptor>;
export async function loadPreset(presetId: string, pluginInstanceId: string): Promise<void>;
export async function renamePreset(presetId: string, newName: string): Promise<PresetDescriptor>;
export async function deletePreset(presetId: string): Promise<void>;
export async function getFileTree(
  section: BrowserSection,
  path: string,
  depth: number
): Promise<FileNode[]>;
export async function getQuickLocations(): Promise<FileNode[]>;
export async function addFavorite(section: string, path: string): Promise<FileNode>;
export async function removeFavorite(id: string): Promise<void>;
export async function getFavorites(): Promise<FileNode[]>;
export async function addRecentFile(path: string, section: string): Promise<void>;
export async function getRecentFiles(limit: number): Promise<FileNode[]>;
export async function previewFile(path: string, action: "play" | "stop"): Promise<void>;
export async function listCloudConnectors(): Promise<CloudConnector[]>;
export async function getCloudTree(connectorId: string, nodeId?: string): Promise<FileNode[]>;
export async function importCloudFile(
  connectorId: string,
  nodeId: string,
  destinationPath?: string
): Promise<{ filePath: string }>;
```

#### Frontend hooks

`packages/ui/src/browser/useBrowser.ts`:

```ts
export function useBrowserStore(): BrowserState;
export function useFileBrowser(section: BrowserSection, path: string): {
  nodes: FileNode[];
  isLoading: boolean;
  refresh: () => void;
};
export function usePluginDatabase(filters: PluginFilters): {
  plugins: PluginDescriptor[];
  isLoading: boolean;
};
export function usePluginScanner(): {
  startScan: (paths?: string[]) => Promise<string>;
  cancelScan: (jobId: string) => Promise<void>;
  activeJob: { jobId: string; progress: number } | null;
};
export function usePresets(pluginId: string): {
  presets: PresetDescriptor[];
  savePreset: (instanceId: string, meta: { name: string; category: string; tags: string[] }) => Promise<PresetDescriptor>;
  loadPreset: (presetId: string, instanceId: string) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;
};
export function useCloudConnectors(): {
  connectors: CloudConnector[];
  addConnector: (provider: CloudProvider, displayName: string, config: Record<string, unknown>) => Promise<CloudConnector>;
};
```

### UI/UX

#### Browser panel layout

The Browser is a Dockview panel that defaults to the left sidebar. It contains:

1. **Toolbar**: section tabs (Files, Plugins, Presets, Cloud), global search input, refresh button, and settings button.
2. **Content area**:
   - **Files**: tree with quick-jump locations at the top, favorites, recent, and folder/file nodes.
   - **Plugins**: toggle between tree view (by category/vendor) and plugin picker grid view.
   - **Presets**: tree grouped by plugin/stock device, then factory/user/project folders.
   - **Cloud**: list of configured connectors; selecting one shows its remote tree.
3. **Preview bar** (bottom, visible for audio files): play/stop, waveform peek, file name.

#### Trees and grids

- Tree rows are `28px` high (`--vsdaw-size-browserRowHeight`).
- Folders expand/collapse with a chevron icon.
- Files display a kind icon (`audio`, `midi`, `project`, `preset`, `folder`).
- Plugin picker grid cards are `96px × 96px` with a `48px` icon area, name, and vendor.
- Right-click context menus: Favorite, Remove favorite, Blacklist plugin, Show in folder, Rename preset, Delete preset.

#### Drag-and-drop

All draggable items set `dataTransfer` with:

```ts
dataTransfer.setData("application/x-singularity-browser", JSON.stringify(BrowserDragPayload));
```

Drop targets are implemented in other panel specs; this spec only defines the payload contract. The backend routes a drop to one of these commands:

| Target | Payload kind | Backend command |
|---|---|---|
| Channel Rack empty area | `plugin` instrument | `POST /channels/create-with-plugin` |
| Channel Rack sampler channel | `file` audio | `POST /channels/:channelId/load-sample` |
| Mixer insert slot | `plugin` effect or `preset` | `POST /mixer/strips/:stripId/inserts` |
| Playlist track lane | `file` audio/MIDI | `POST /playlist/import-audio` / `import-midi` |
| Preset browser | `preset` onto same plugin | `POST /presets/:presetId/load` |

#### Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Show/hide Browser | `F8` |
| Focus Browser search | `Ctrl/Cmd+Shift+F` |
| Refresh current Browser section | `F5` |
| Toggle Plugin picker / tree view | `Ctrl/Cmd+Shift+P` |

#### Theme tokens

Browser components use the design tokens from Spec 15:

- `--vsdaw-surface-0` for the panel background.
- `--vsdaw-surface-1` for tree row hover.
- `--vsdaw-border-subtle` for dividers.
- `--vsdaw-text-primary` for file/plugin names.
- `--vsdaw-text-secondary` for paths and vendors.
- `--vsdaw-accent` for selected rows and search highlight.
- Category colors: `--vsdaw-plugin-instrument`, `--vsdaw-plugin-effect`, `--vsdaw-plugin-midi`.

### Algorithms / behavior

#### Plugin scan flow

1. Backend collects default system plugin paths per platform plus user-configured paths from settings.
2. Backend generates `jobId`, emits `plugin.scan.started`, and sends `plugin.scan` to the engine.
3. Engine walks the paths with JUCE `PluginDirectoryScanner` for each supported format.
4. Engine returns descriptors for successfully scanned plugins. Crashed or unloadable plugins are returned with `blacklisted=true` and a reason.
5. Backend upserts rows in `plugins`, marks plugins not seen in this scan as removed (but does not delete them; UI hides them unless explicitly queried), and emits `plugin.scan.completed`.
6. The UI refreshes the plugin list and picker.

#### Search behavior

- `GET /plugins?query=...` matches `name`, `vendor`, and `subcategories` with a case-insensitive substring match.
- Results are sorted by favorite first, then name.
- The backend builds an in-memory trigram index on first query after startup and keeps it warm; query latency for 10,000 plugins must be under 200 ms on representative developer hardware.

#### Preset save flow

1. User opens a plugin instance, adjusts parameters, and chooses **Save preset**.
2. UI collects name/category/tags and calls `POST /plugins/:id/presets` with the active `pluginInstanceId`.
3. Backend sends `plugin.getState` to the engine.
4. Backend writes `{ version: 1, pluginId, pluginName, meta, state }` to the appropriate presets directory.
5. Backend inserts/updates the `presets` table row and returns the descriptor.
6. UI refreshes the preset tree.

#### Preset load flow

1. User selects a preset in the browser.
2. UI calls `POST /presets/:presetId/load` with the target `pluginInstanceId`.
3. Backend reads the preset file, sends `plugin.setState` to the engine, and optionally maps stock-device JSON state to the stock DSP model.
4. The plugin instance updates and the corresponding Channel Rack / Mixer UI reflects the new state.

#### Cloud connector flow

1. User adds a connector via the cloud settings dialog (`provider`, `displayName`, API key/config).
2. Backend stores the connector config (API keys are stored in the OS keychain when available; otherwise in the SQLite `config` JSON encrypted at rest via a Tauri secure store on desktop).
3. `GET /cloud/connectors/:id/tree` delegates to the provider module, which paginates remote results and returns `FileNode[]`.
4. Drag or **Import** downloads the remote file into the project `assets/` folder (or a temp cache if no project is open) and returns the local `filePath`.

## Implementation plan

1. **Schemas and types**: Add `packages/shared/src/schemas/browser.ts` with all Zod schemas and TypeScript types.
2. **SQLite schema**: Add migration script in `packages/backend/src/db/migrations/003-browser.sql`.
3. **Engine scanner**: Implement JUCE `PluginDirectoryScanner` integration and `plugin.scan` / `plugin.getState` / `plugin.setState` commands.
4. **Backend services**: Implement `BrowserService`, `PluginDatabaseService`, and `CloudService` in `packages/backend/src/browser/`.
5. **HTTP/WebSocket routes**: Mount `/browser`, `/plugins`, `/presets`, `/cloud` routes and broadcast events.
6. **UI components**:
   - `BrowserPanel`, `BrowserSectionTabs`, `BrowserSearch`, `FileTree`, `PluginTree`, `PluginPicker`, `PresetTree`, `CloudTree`, `PreviewBar`.
   - Drag source wrappers (`BrowserDragSource`).
7. **Stock device preset folders**: Populate `packages/ui/public/presets/` for sampler, subtractive synth, drum machine, and SoundFont player.
8. **Tests**: Unit tests for service functions, integration tests for all routes, E2E tests for drag-and-drop flows.
9. **Design review**: Attach screenshots of the four Browser sections to the PR.

## Testing strategy

- **Unit tests** (`packages/backend/test/browser/`):
  - Plugin ID generation from format/path.
  - SQLite CRUD for plugins, presets, favorites, recent files.
  - Scan path normalization per platform.
  - Preset file serialization/deserialization.
- **Integration tests** (`packages/backend/test/integration/browser.test.ts`):
  - `GET /plugins` returns valid `PluginDescriptor[]` and respects `category`/`format` filters.
  - `POST /plugins/scan` starts a job and emits WebSocket progress/completed events.
  - Blacklist/favorite mutations update the database and subsequent reads.
  - `POST /plugins/:id/presets` writes a `.spreset` file and returns a descriptor.
  - `POST /presets/:presetId/load` sends the expected engine command.
  - `GET /browser/tree` returns folder/file nodes with correct `kind` values.
  - Favorites and recent files persist across backend restarts.
  - Cloud `custom` connector returns mocked tree nodes and imports a file.
- **E2E tests** (`packages/web/e2e/browser.spec.ts`):
  - Browser panel opens with `F8` and shows the Files section.
  - Dragging an audio file from the browser onto the playlist creates a clip.
  - Dragging a plugin from the plugin picker onto the mixer adds it to an insert slot.
  - Saving and loading a preset round-trips plugin state.

## Acceptance criteria

- [ ] `packages/shared/src/schemas/browser.ts` exists and exports every schema listed in the Data model section; `tsc --noEmit` passes in strict mode.
- [ ] `GET /plugins` returns a JSON array where every element validates against `PluginDescriptorSchema` and contains `id`, `name`, `vendor`, `format`, `category`, `path`, `favorite`, and `blacklisted`.
- [ ] Filtering `GET /plugins?category=effect&query=reverb` returns only effects whose name/vendor/subcategories contain the substring `reverb`.
- [ ] `POST /plugins/scan` returns `{ jobId }`, emits WebSocket `plugin.scan.progress` events with monotonically increasing `scanned`/`total`, and ends with `plugin.scan.completed` or `plugin.scan.failed`.
- [ ] Plugins that crash or fail validation during scan are inserted with `blacklisted=true` and a non-empty `blacklistReason`; they are excluded from `GET /plugins` unless `includeBlacklisted=true`.
- [ ] `POST /plugins/:id/blacklist` sets `blacklisted=true`; `DELETE /plugins/:id/blacklist` sets it false; both immediately affect subsequent `GET /plugins` responses.
- [ ] `POST /plugins/:id/favorite` toggles the favorite flag and the plugin appears in or is removed from favorite-filtered results.
- [ ] The plugin picker view renders plugins as a grid, supports category filter buttons (Instruments, Effects, MIDI), and updates in real time as search text changes.
- [ ] Every plugin card displays either the returned `iconUrl` or a generated two-letter initials placeholder on a category-colored background; no broken image icons are visible.
- [ ] `GET /browser/tree?section=files&path=<dir>&depth=1` returns folders and files with correct `kind` (`audio`, `midi`, `project`, `preset`, `folder`, `other`) and never more than one level of children when `depth=1`.
- [ ] `GET /browser/locations` returns at least Home, Desktop, Downloads, Projects, and Samples quick-jump entries.
- [ ] Adding a favorite via `POST /browser/favorites` and restarting the backend preserves the favorite; `DELETE /browser/favorites/:id` removes it.
- [ ] Opening a file from the browser adds it to `GET /browser/recent`; the list respects `limit` and persists across restarts.
- [ ] `POST /browser/preview` starts and stops audio playback for supported audio files (`wav`, `aiff`, `mp3`, `ogg`, `flac`).
- [ ] `GET /plugins/:id/presets` returns factory presets supplied by the engine and user presets stored on disk; each entry validates against `PresetDescriptorSchema`.
- [ ] `POST /plugins/:id/presets` writes a file named `<presetId>.spreset` to `~/.singularity/presets/<pluginId>/` (or `presets/` inside the project bundle when `isProject=true`), persists a row in the `presets` table, and returns the new descriptor.
- [ ] `POST /presets/:presetId/load` reads the preset file and sends a `plugin.setState` engine command for third-party plugins (or maps JSON state for stock devices); the target plugin instance reports the new state.
- [ ] `PATCH /presets/:presetId` renames a user/project preset and updates both the filesystem and database; `DELETE /presets/:presetId` removes both.
- [ ] Dragging a plugin from the browser onto the Channel Rack calls `POST /channels/create-with-plugin` and creates a new instrument channel.
- [ ] Dragging a plugin or preset onto a Mixer insert slot calls `POST /mixer/strips/:stripId/inserts` and adds the effect to the chain.
- [ ] Dragging an audio file from the browser onto the Playlist calls `POST /playlist/import-audio` and creates an audio clip at the drop position.
- [ ] The Cloud section lists configured connectors with their `authenticated` status; the built-in `custom` provider returns mocked tree nodes and imports a file when tested against a local mock HTTP server.
- [ ] Browser search queries for 10,000 plugins complete within 200 ms on a 2023-era laptop.
- [ ] Pressing `F8` toggles the Browser Dockview panel; pressing `Ctrl/Cmd+Shift+F` moves focus to the Browser search input.
- [ ] All browser UI components use the design tokens from Spec 15; no arbitrary inline style values are introduced.

## Dependencies

- Spec 22: Project Model and .singularity Bundle Format — project bundle structure and `plugin-states/` persistence.
- Spec 24: Design System and VS Code Theme Integration — Browser tab location, shared chrome, tokens, buttons, inputs, and tree row styling.
- Spec 29: Mixer and Routing Graph — insert slots as drop targets.
- Spec 21: Plugin Hosting and Scanner — in-process plugin loading and editor behavior.
- Spec 17: Singularity v1.0 Standalone App Architecture — monorepo layout, backend/engine split, WebSocket/HTTP transport.

## Blocks

- Spec 26: Channel Rack — consumes instrument plugin and sample drag sources.
- Spec 27: Piano Roll — may consume MIDI file and preset drag sources.
- Spec 28: Playlist — consumes audio/MIDI file and cloud sample drag sources.
- Spec 29: Mixer — consumes effect plugin and preset drag sources.

> The numbers 26–29 are inferred from Spec 17’s note that detailed panel designs are covered by Specs 26–30, ordered by the parity-spec list (Channel Rack, Piano Roll, Playlist, Mixer, Browser). If the numbering changes, update the references only; the dependency direction remains the same.

## Notes / open questions

- No additional decisions are pending. The next step is implementation and GitHub issue creation.
- Cloud provider secrets: on desktop, store API keys in Tauri’s secure store and persist only a reference in SQLite; in the web app, cloud connectors are disabled unless a secure backend is configured.
- Plugin icon extraction is best-effort; the generated-placeholder fallback is the guaranteed behavior and is sufficient for acceptance.
- The `.spreset` extension is chosen to avoid collision with existing `.preset` files and to keep presets clearly inside the Singularity ecosystem.
