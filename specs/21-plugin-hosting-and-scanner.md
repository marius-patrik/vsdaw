# Spec 21: Plugin Hosting and Scanner

## Objective

Implement in-process native plugin hosting and discovery for Singularity v1.0, including a persistent, searchable plugin database, scanner with custom paths and blacklist, per-instance state/preset management, plugin delay compensation, track freeze, and embedded or floating plugin editor windows.

## Motivation

Full FL Studio parity requires loading third-party instruments and effects. Singularity must discover installed VST3/AU/CLAP/LV2/AAX plugins, present them in the Browser, host them inside the JUCE engine with sample-accurate timing, persist their state in the `.singularity` project bundle, and expose their editors to the user.

## Scope

### In scope

- Plugin scanner for VST3, AU, CLAP, LV2, and AAX (64-bit only).
- Default and user-configurable scan paths per format and platform.
- Persistent plugin database with search, favorites, and blacklist.
- Distinguishing instruments from effects and exposing category metadata.
- Creating plugin instances on Channel Rack channels (instruments) and Mixer inserts (effects).
- Plugin state save/load inside the `.singularity` bundle.
- Per-plugin user preset save/load outside the project bundle.
- Plugin bypass and remove from effect/instrument chain.
- Plugin delay compensation (PDC) reported to the mixer graph.
- Track/channel freeze by rendering through plugins to an audio clip.
- Plugin editor embedding inside a Dockview panel and pop-out into a separate floating Tauri window.
- Backend HTTP/WebSocket API and engine TCP command surface for all operations.
- Shared Zod schemas for plugin descriptors, database, instances, and presets.

### Out of scope

- 32-bit plugin bridge (explicitly rejected; see `docs/decisions.md`).
- Proprietary FL Studio plugins as stock devices (users load them as third-party plugins if owned).
- Out-of-process plugin sandboxing (post-v1.0).
- Plugin format conversion or wrapping.
- AAX PACE signing for distribution (scan/loading is implemented for development/Pro Tools Developer builds).
- Plugin store, marketplace, or cloud preset sharing.
- Web app plugin editor embedding when the native engine is unavailable (web falls back to no native plugin hosting).

## Related decisions

- 2026-06-25 — Plugin hosting model: in-process inside the JUCE engine.
- 2026-06-25 — Supported plugin formats: VST3, AU, CLAP, LV2, AAX.
- 2026-06-25 — Plugin editor window behavior: embedded by default, optional pop-out floating window.
- 2026-06-25 — Audio thread model: single realtime callback with lock-free control queues.
- 2026-06-25 — 32-bit plugin bridge: 64-bit plugins only.
- 2026-06-25 — Project format rename to `.singularity`.
- 2026-06-25 — Quality bar: no stubs, MVPs, or placeholders; acceptance criteria must be binary and verifiable.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  Plugin Browser │ Plugin Picker │ Embedded/Pop-out Editor   │
└─────────────┬───────────────────────────────┬─────────────────┘
              │ HTTP / WebSocket              │ native window reparent
┌─────────────▼───────────────────────────────▼─────────────────┐
│                      Backend (Bun)                           │
│  Plugin DB JSON  │ HTTP API  │ Engine bridge (TCP/socket)   │
└─────────────┬─────────────────────────────────────────────────┘
              │ local TCP/socket
┌─────────────▼─────────────────────────────────────────────────┐
│                    JUCE Engine (C++)                         │
│  PluginScanner │ PluginHost │ PluginInstance │ EditorEmbed   │
└─────────────────────────────────────────────────────────────┘
```

The JUCE engine owns all plugin code. The backend persists the plugin database and relays UI commands. The UI renders the Browser, picker, and editor containers. Plugin editor embedding is implemented by the desktop shell reparenting the native editor view into a React-owned container.

### Data model

#### Shared Zod schemas (`packages/shared/src/plugin-schemas.ts`)

```ts
export const PluginFormatSchema = z.enum([
  'vst3',
  'au',
  'clap',
  'lv2',
  'aax',
]);
export type PluginFormat = z.infer<typeof PluginFormatSchema>;

export const PluginKindSchema = z.enum([
  'instrument',
  'effect',
  'midiEffect',
  'unknown',
]);
export type PluginKind = z.infer<typeof PluginKindSchema>;

export const PluginDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string(),
  version: z.string(),
  format: PluginFormatSchema,
  // Platform-specific stable identifier from the plugin binary.
  // VST3 = class ID string; AU = type/subtype/manufacturer code;
  // CLAP = plugin ID; LV2 = URI; AAX = effect ID.
  pluginIdentifier: z.string().min(1),
  path: z.string().min(1),
  kind: PluginKindSchema,
  category: z.string(),
  isInstrument: z.boolean(),
  isEffect: z.boolean(),
  // Number of input buses, output buses, and default main bus channel counts.
  inputBusCount: z.number().int().min(0),
  outputBusCount: z.number().int().min(0),
  mainInputChannels: z.number().int().min(0),
  mainOutputChannels: z.number().int().min(0),
  hasEditor: z.boolean(),
  // Optional thumbnail/icon hash (generated by engine during scan).
  iconHash: z.string().optional(),
});
export type PluginDescriptor = z.infer<typeof PluginDescriptorSchema>;

export const ScannedPluginSchema = z.object({
  descriptor: PluginDescriptorSchema,
  lastScannedAt: z.string().datetime(),
  scanDurationMs: z.number().int().min(0),
  isBlacklisted: z.boolean(),
  blacklistReason: z.string().optional(),
  isFavorite: z.boolean(),
});
export type ScannedPlugin = z.infer<typeof ScannedPluginSchema>;

export const PluginDatabaseSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  scanPaths: z.array(z.string()),
  // Glob or exact paths the user has excluded.
  blacklistPaths: z.array(z.string()),
  plugins: z.array(ScannedPluginSchema),
});
export type PluginDatabase = z.infer<typeof PluginDatabaseSchema>;

export const PluginInstanceRefSchema = z.object({
  instanceId: z.string().uuid(),
  descriptorId: z.string().min(1),
  // Position in the project graph.
  targetType: z.enum(['channelRackChannel', 'mixerInsert']),
  targetId: z.string().min(1),
  slotIndex: z.number().int().min(0).optional(),
});
export type PluginInstanceRef = z.infer<typeof PluginInstanceRefSchema>;

export const PluginInstanceStateSchema = z.object({
  ref: PluginInstanceRefSchema,
  bypass: z.boolean(),
  reportedLatencySamples: z.number().int().min(0),
  // Base64-encoded plugin binary state chunk.
  stateBlob: z.string().optional(),
});
export type PluginInstanceState = z.infer<typeof PluginInstanceStateSchema>;

export const PluginPresetSchema = z.object({
  presetId: z.string().uuid(),
  descriptorId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  stateBlob: z.string(),
});
export type PluginPreset = z.infer<typeof PluginPresetSchema>;
```

#### Project persistence

Within a `.singularity` bundle:

- `plugin-states/<instanceId>.bin` stores the raw binary state chunk for each plugin instance.
- `project.json` stores nested `PluginInstance` objects inside `channelRack.channels[].settings.plugin` (VST instrument channels) and `mixer.inserts[].pluginSlots[].plugin`. Each instance may reference a saved state blob in `plugin-states/` via its `stateBlobBase64` field or a bundle-relative state path.

User presets live outside the bundle at:

- macOS: `~/Library/Application Support/Singularity/plugin-presets/<descriptorId>/<presetId>.preset`
- Linux: `~/.config/Singularity/plugin-presets/<descriptorId>/<presetId>.preset`
- Windows: `%LOCALAPPDATA%\Singularity\plugin-presets\<descriptorId>\<presetId>.preset`

### API / interface

#### Backend HTTP endpoints (`packages/backend/src/plugins/router.ts`)

```ts
// Database / scanner
GET    /api/v1/plugins/scan-paths              -> { paths: string[] }
PUT    /api/v1/plugins/scan-paths              -> { paths: string[] }
POST   /api/v1/plugins/scan                    -> { scanId: string }
GET    /api/v1/plugins/scan/:scanId            -> ScanStatus
GET    /api/v1/plugins                         -> { plugins: ScannedPlugin[] }
GET    /api/v1/plugins/search?q=&format=&kind= -> { plugins: ScannedPlugin[] }
GET    /api/v1/plugins/:id                     -> ScannedPlugin
POST   /api/v1/plugins/:id/blacklist           -> ScannedPlugin
DELETE /api/v1/plugins/:id/blacklist           -> ScannedPlugin
POST   /api/v1/plugins/:id/favorite            -> ScannedPlugin
DELETE /api/v1/plugins/:id/favorite            -> ScannedPlugin

// Instances
POST   /api/v1/plugins/instances
       body: { descriptorId, targetType, targetId, slotIndex? }
       -> PluginInstanceState
DELETE /api/v1/plugins/instances/:instanceId
POST   /api/v1/plugins/instances/:instanceId/bypass   -> PluginInstanceState
DELETE /api/v1/plugins/instances/:instanceId/bypass   -> PluginInstanceState
GET    /api/v1/plugins/instances/:instanceId/state    -> { stateBlob?: string }
POST   /api/v1/plugins/instances/:instanceId/state
       body: { stateBlob: string } -> PluginInstanceState

// Presets
GET    /api/v1/plugins/:descriptorId/presets          -> PluginPreset[]
POST   /api/v1/plugins/:descriptorId/presets
       body: { name, stateBlob } -> PluginPreset
PUT    /api/v1/plugins/:descriptorId/presets/:presetId
       body: { name?, stateBlob? } -> PluginPreset
DELETE /api/v1/plugins/:descriptorId/presets/:presetId

// Freeze
POST   /api/v1/plugins/instances/:instanceId/freeze
       body: { targetType, targetId, slotIndex?, timeRange? }
       -> { audioClipId: string }
```

#### Backend WebSocket events

```ts
// Engine -> backend -> UI
plugin.scan.progress      { scanId, scanned, total, currentPath }
plugin.scan.complete      { scanId, added, updated, removed, failed }
plugin.scan.error         { scanId, path, error }
plugin.instance.created   { instance: PluginInstanceState }
plugin.instance.removed   { instanceId }
plugin.instance.latency   { instanceId, latencySamples }
plugin.instance.bypass    { instanceId, bypass }
plugin.editor.opened      { instanceId, windowId }
plugin.editor.closed      { instanceId }
```

#### Engine TCP commands (`engine/src/plugin/PluginCommands.h`)

```cpp
struct PluginCommand {
    std::string id;          // command uuid
    std::string type;
    nlohmann::json payload;
};

// Scanner
{ "type": "plugin.scan", "payload": { "scanPaths": [...], "blacklistPaths": [...] } }
{ "type": "plugin.query", "payload": { "descriptorId": "..." } }

// Lifecycle
{ "type": "plugin.createInstance", "payload": { "descriptorId", "targetType", "targetId", "slotIndex" } }
{ "type": "plugin.destroyInstance", "payload": { "instanceId" } }
{ "type": "plugin.prepareToPlay", "payload": { "instanceId", "sampleRate", "blockSize" } }

// State / parameters
{ "type": "plugin.getState", "payload": { "instanceId" } }
{ "type": "plugin.setState", "payload": { "instanceId", "stateBlob": "base64..." } }
{ "type": "plugin.setBypass", "payload": { "instanceId", "bypass": true } }

// Editor
{ "type": "plugin.openEditor", "payload": { "instanceId", "parentWindowId?": "..." } }
{ "type": "plugin.closeEditor", "payload": { "instanceId" } }

// Freeze
{ "type": "plugin.freeze", "payload": { "instanceId", "startSample", "endSample" } }
```

#### JUCE engine C++ interfaces

```cpp
class PluginScanner {
public:
    juce::PluginDirectoryScanner scan(const std::vector<juce::File>& paths,
                                      const std::vector<juce::File>& blacklistPaths);
    std::vector<PluginDescriptor> getResults() const;
    void abort();
};

class PluginHost {
public:
    std::string createInstance(const PluginDescriptor& descriptor,
                               juce::AudioProcessorGraph::NodeID node);
    void destroyInstance(const std::string& instanceId);
    void setBypass(const std::string& instanceId, bool bypass);
    int getLatencySamples(const std::string& instanceId) const;
    juce::MemoryBlock getState(const std::string& instanceId) const;
    void setState(const std::string& instanceId, const juce::MemoryBlock& state);
    bool openEditor(const std::string& instanceId, juce::Component* parent);
    void closeEditor(const std::string& instanceId);
};
```

### UI/UX

- **Plugin Browser** (left sidebar): tree view grouped by format (`VST3`, `AU`, `CLAP`, `LV2`, `AAX`) and category; search field filters name/vendor/category in real time; favorite star and blacklist context-menu actions.
- **Plugin Picker** (dedicated Browser tab): grid of plugin tiles showing icon, name, vendor, format badge; filters for instruments/effects/all and per-format checkboxes.
- **Drag-and-drop**: dragging a plugin from Browser/Picker to a Channel Rack channel creates an instrument instance; dragging to a Mixer insert slot creates an effect instance. The drop payload is the `descriptorId`.
- **Mixer insert slot**: shows plugin name, bypass button, preset menu, and remove button. Right-click opens context menu with save/load preset, bypass, remove, replace.
- **Channel Rack channel instrument slot**: same controls as mixer insert, plus a button to open the plugin editor.
- **Plugin editor**: embedded inside a Dockview panel by default. A toolbar button pops the panel out into a separate Tauri window. Closing the pop-out returns it to the Dockview tab. On platforms where reparenting is unavailable, the editor opens in a standalone native window.

### Algorithms / behavior

#### Scanner

1. For each scan path, recursively find files matching the format extensions (`.vst3`, `.component`, `.clap`, `.lv2`, `.aaxplugin`).
2. Skip paths matching `blacklistPaths`.
3. For each candidate, attempt to instantiate via the appropriate JUCE `AudioPluginFormat` inside a `try/catch`.
4. On success, extract `PluginDescriptor` fields from `juce::PluginDescription` and bus layouts.
5. On crash/exception, mark the plugin blacklisted with the failure reason and continue scanning.
6. Emit `plugin.scan.progress` after every candidate; emit `plugin.scan.complete` when finished.
7. Write `plugin-database.json` atomically (write to temp, rename) only after a successful full scan.

#### Plugin instance lifecycle

1. `plugin.createInstance` instantiates the plugin via JUCE, inserts it into the mixer graph or Channel Rack instrument chain, and assigns a UUID `instanceId`.
2. `prepareToPlay(sampleRate, blockSize)` is called before the first audio callback.
3. The audio callback calls `processBlock(audioBuffer, midiBuffer)` unless `bypass` is true, in which case audio passes through unchanged.
4. `destroyInstance` removes the node from the graph and releases the JUCE instance.

#### Delay compensation

1. After `prepareToPlay`, query `getLatencySamples()`.
2. Report the value to the mixer via `plugin.instance.latency`.
3. The mixer graph computes the maximum latency per output path and applies sample-accurate delay to downstream nodes that do not contribute to that latency.
4. When bypass is active, latency remains reported if the plugin still introduces latency in the path; otherwise the mixer recomputes path latency without the plugin.

#### State and presets

1. On project save, the backend calls `plugin.getState` for each instance, base64-encodes the `juce::MemoryBlock`, and writes it to `plugin-states/<instanceId>.bin`.
2. On project load, the backend reads each state file and sends `plugin.setState` after instance creation and `prepareToPlay`.
3. User presets store the same state blob in the per-descriptor preset directory with a JSON sidecar containing name and creation date.

#### Freeze

1. The user selects a Channel Rack channel or Mixer insert and chooses Freeze.
2. The engine renders the source audio/MIDI offline through the plugin chain up to and including the selected plugin using the current mixer graph state.
3. A new audio clip is created in the Playlist (for instruments, the MIDI pattern is rendered; for effects, the source audio is rendered).
4. The source plugin is bypassed after freeze. The user can unfreeze by deleting the rendered clip and unbypassing the plugin.

## Implementation plan

1. Add shared Zod schemas to `packages/shared/src/plugin-schemas.ts`.
2. Implement `PluginScanner` and `PluginHost` in `engine/src/plugin/` using JUCE `AudioPluginFormatManager`.
3. Add engine TCP command handlers for scan, instance lifecycle, state, editor, and freeze.
4. Implement backend plugin database persistence (`packages/backend/src/plugins/pluginDatabase.ts`) and HTTP/WebSocket router.
5. Implement default platform scan paths in backend settings.
6. Integrate plugin loading into Channel Rack and Mixer models (coordinate with Spec 26 and Spec 29).
7. Implement Plugin Browser and Plugin Picker UI panels (coordinate with Spec 30).
8. Implement plugin editor embedding in the Tauri desktop shell and pop-out multi-window support.
9. Implement freeze rendering path in the engine.
10. Add unit, integration, and E2E tests.

## Testing strategy

- **Unit tests**: validate Zod schemas for `PluginDescriptor`, `PluginDatabase`, `PluginInstanceState`, and `PluginPreset`; test scanner path matching and blacklist logic with mock filesystem entries.
- **Integration tests**: trigger a scan, verify database writes and search endpoints; create/destroy an instance via backend API; round-trip plugin state through save/load; set bypass and verify latency events.
- **Engine tests**: instantiate a known test plugin and verify audio passthrough, bypass, and state chunk identity (`getState` after `setState` equals the original blob).
- **E2E tests**: open Plugin Browser, search for a scanned plugin, drag it to a Mixer insert, open the editor, save the project, reload, and confirm the plugin settings are restored.

## Acceptance criteria

- [ ] Scanning a directory containing one valid 64-bit plugin of each supported format adds exactly five entries to `plugin-database.json` with correct `format`, `pluginIdentifier`, `path`, and `kind`.
- [ ] Scanning a directory containing a 32-bit plugin file does not add the plugin to the database and logs it as skipped.
- [ ] A plugin that crashes during scan is added to the database with `isBlacklisted: true` and a non-empty `blacklistReason`, and scanning continues to the next file.
- [ ] Blacklisting a plugin via the API removes it from `/api/v1/plugins/search` results and persists after app restart.
- [ ] Marking a plugin favorite via the API surfaces it in a dedicated "Favorites" group in the Plugin Browser after restart.
- [ ] Searching `/api/v1/plugins/search?q=serum` returns only plugins whose name or vendor contains the query (case-insensitive) within 100 ms for a database of 1,000 plugins.
- [ ] Creating an instrument plugin instance on a Channel Rack channel and playing MIDI through it produces non-silent audio output.
- [ ] Creating an effect plugin instance on a Mixer insert and routing audio through it produces non-silent processed output.
- [ ] Toggling bypass on a plugin immediately stops processing (effect becomes clean passthrough, instrument becomes silent) and toggling back restores processing.
- [ ] Plugin state round-trips through project save/load: after reloading the `.singularity` bundle, calling `plugin.getState` returns the same base64 blob that was saved.
- [ ] Saving a user preset and loading it into a plugin instance restores the same audio behavior as when the preset was saved.
- [ ] Plugin delay compensation reports the exact value returned by the plugin's `getLatencySamples()` and the mixer graph applies at least that many samples of delay to the affected output path.
- [ ] Freezing a Mixer insert renders a new audio clip and sets the source plugin to bypass; deleting the clip and unbypassing restores real-time processing.
- [ ] Opening a plugin editor on desktop creates a visible embedded panel within 1 second; clicking pop-out moves it to a separate Tauri window without closing the plugin.
- [ ] Removing a plugin instance from a Mixer insert updates the mixer graph within one audio block and releases the JUCE instance.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture
- Spec 18: Monorepo and Build System
- Spec 19: Shared Protocol and Schemas
- Spec 20: JUCE Audio Engine Foundation
- Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)

## Blocks

- Spec 22: Project Model and .singularity Bundle Format
- Spec 26: Channel Rack and Step Sequencer
- Spec 29: Mixer and Routing Graph
- Spec 30: Browser, Plugin Database, and Presets
- Spec 31: Stock Instruments and Effects

## Notes / open questions

- **Supersedes Spec 13: Plugin Hosting**. The old spec covered only VST3/AU loading into inserts; this spec expands to all approved formats, scanner, database, presets, delay compensation, freeze, and editor embedding.
- **AAX loading scope**: AAX scanning and loading are implemented for development/Pro Tools Developer builds. Signed AAX distribution is out of scope for v1.0 and will require a future code-signing workflow.
- **Plugin editor embedding on web**: The web app build cannot reparent native plugin editor windows. When running against a native backend, plugin editors are opened in separate native windows managed by the desktop shell; when running in degraded Web Audio mode, no native plugin hosting occurs.
- **Plugin ID stability**: A plugin is identified by `format:pluginIdentifier`. Moving a plugin file updates the `path` field on the next scan but preserves favorites/blacklist as long as the identifier is unchanged. Project files store the `descriptorId`; if the identifier changes, the project will report a missing plugin on load.
