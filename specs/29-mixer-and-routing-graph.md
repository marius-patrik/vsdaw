# Spec 29: Mixer and Routing Graph

## Objective

Define the Singularity v1.0 mixer, send/return buses, sidechain routing, and node-based routing graph (Patcher-style), including the project model, backend API, engine graph, and canvas UI panels.

## Motivation

FL Studio parity requires a full mixing surface: vertical channel strips, real-time metering, effect slots, sends/returns, sidechains, and a visual modular graph for advanced chains. This spec turns the parity requirements into a concrete, testable subsystem that connects the UI, backend, and JUCE engine.

## Scope

### In scope

- Mixer channel strips (inserts): fader, pan, mute, solo, record arm, color, name, ordering.
- Real-time peak + RMS level meters for every insert and the master.
- Per-insert effect slots (10 slots) with plugin load/unload/move/bypass and sidechain input assignment.
- Send/return buses with configurable level, pre/post-fader, and active state.
- Per-insert output routing to master, another insert, or a bus.
- Master insert fixed at the far right.
- Visual routing graph (node editor) with insert nodes, plugin nodes, I/O nodes, cables, and persisted node positions.
- Patcher-style modular connections: output, send, and sidechain edges.
- Cycle prevention when creating output/send/sidechain connections.
- Project persistence of mixer state and graph layout inside `.singularity` bundles.
- Agent/backend API for every mixer and graph operation.

### Out of scope

- Plugin scanning, database, and plugin state serialization (covered by Spec 21: Plugin Hosting and Scanner and Spec 30: Browser, Plugin Database, and Presets).
- Automation clip editing and parameter linking UI (covered by Spec 33: Automation, MIDI, and Transport).
- Audio input device enumeration and recording clip creation (covered by Spec 32: Audio Recording and Editing).
- Export/render engine internals (covered by Spec 34: Export, Rendering, and AI Mastering).
- Stock plugin DSP (covered by Spec 31: Stock Instruments and Effects).
- The obsolete Spec 09 (Mixer Routing and Sends) is superseded by this spec.

## Related decisions

From `docs/decisions.md`:

- 2026-06-25 — Routing and Patcher graph: include full Patcher-style modular graph + mixer routing.
- 2026-06-25 — Audio engine backend: JUCE C++ native engine as Tauri sidecar.
- 2026-06-25 — In-process plugin hosting.
- 2026-06-25 — Single realtime audio callback with lock-free control queues.
- 2026-06-25 — Project model: FL Studio-style Channel Rack + Patterns + Playlist.
- 2026-06-25 — Canvas rendering for timeline, piano roll, mixer, and routing graph.
- 2026-06-25 — Theme system based on VS Code themes.
- 2026-06-25 — App and project rename to Singularity / `.singularity`.

## Detailed design

### Subsystem overview

The mixer/routing subsystem spans three layers:

```
┌─────────────────────────────────────────────┐
│  UI (React + HTML5 Canvas)                  │
│  Mixer panel │ Routing Graph panel          │
└──────────────┬──────────────────────────────┘
               │ WebSocket / HTTP
┌──────────────▼──────────────────────────────┐
│  Backend (Bun/Fastify)                      │
│  Mixer model │ Validation │ Engine bridge   │
└──────────────┬──────────────────────────────┘
               │ local TCP/socket
┌──────────────▼──────────────────────────────┐
│  JUCE Engine (C++)                          │
│  Realtime mixer graph │ Meters │ Plugins    │
└─────────────────────────────────────────────┘
```

- The **engine** owns the realtime audio graph and processes inserts, effects, sends, sidechains, and meters.
- The **backend** owns the canonical project model, validates structural changes (cycle prevention, limit checks), forwards commands to the engine, and streams meter/state updates to the UI.
- The **UI** renders two Dockview panels: a vertical mixer strip view and a node-based routing graph view. Both are HTML5 Canvas.

### Data model

Shared Zod schemas live in `packages/shared/src/schemas/mixer.ts`.

```ts
import { z } from 'zod';

export const InsertIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/);
export const PluginInstanceIdSchema = z.string().min(1).max(64);

export const InsertKindSchema = z.enum(['normal', 'send', 'master']);

export const PluginSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(9),
  plugin: z.unknown().optional(), // PluginInstance schema (Spec 19 / Spec 21)
  bypass: z.boolean().default(false),
  sidechainSourceIds: z.array(InsertIdSchema).max(2).default([]),
});

export const SendSchema = z.object({
  targetInsertId: InsertIdSchema,
  levelDb: z.number().min(-80.0).max(12.0),
  preFader: z.boolean(),
  active: z.boolean(),
});

export const AudioInputSourceSchema = z.object({
  deviceInputIndex: z.number().int().min(0),
  label: z.string(),
});

export const InsertSchema = z.object({
  id: InsertIdSchema,
  kind: InsertKindSchema,
  name: z.string().min(0).max(128),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int().min(0),
  volumeDb: z.number().min(-80.0).max(12.0),
  pan: z.number().min(-1.0).max(1.0),
  mute: z.boolean(),
  solo: z.boolean(),
  recordArm: z.boolean(),
  inputSource: AudioInputSourceSchema.nullable(),
  outputTargetId: InsertIdSchema.nullable(),
  pluginSlots: z.array(PluginSlotSchema).max(10),
  sends: z.array(SendSchema).max(16),
});

export const MixerStateSchema = z.object({
  inserts: z.array(InsertSchema).max(256),
  masterInsertId: InsertIdSchema,
  nextInsertNumber: z.number().int().min(1),
});

export const RoutingGraphPortKindSchema = z.enum([
  'audioIn',
  'audioOut',
  'sidechainIn',
  'sidechainOut',
  'sendOut',
]);

export const RoutingGraphNodeTypeSchema = z.enum([
  'insert',
  'plugin',
  'hardwareInput',
  'masterOutput',
]);

export const RoutingGraphPortSchema = z.object({
  id: z.string().min(1),
  kind: RoutingGraphPortKindSchema,
  label: z.string().optional(),
});

export const RoutingGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: RoutingGraphNodeTypeSchema,
  entityId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  ports: z.array(RoutingGraphPortSchema),
});

export const RoutingGraphEdgeKindSchema = z.enum([
  'output',
  'send',
  'sidechain',
]);

export const RoutingGraphEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPortId: z.string().min(1),
  kind: RoutingGraphEdgeKindSchema,
});

export const RoutingGraphSchema = z.object({
  nodes: z.array(RoutingGraphNodeSchema),
  edges: z.array(RoutingGraphEdgeSchema),
});
```

Engine-side C++ data structures (in `engine/src/mixer/`):

```cpp
namespace singularity {

enum class InsertKind { Normal, Send, Master };

struct PluginSlot {
    int slotIndex;
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    bool bypass = false;
    juce::StringArray sidechainSourceIds;
};

struct Send {
    juce::String targetInsertId;
    float levelDb = 0.0f;
    bool preFader = false;
    bool active = true;
};

struct MixerInsert {
    juce::String id;
    InsertKind kind;
    juce::String name;
    juce::Colour color;
    int order = 0;
    float volumeDb = 0.0f;
    float pan = 0.0f;
    bool mute = false;
    bool solo = false;
    bool recordArm = false;
    int inputSourceIndex = -1;
    juce::String outputTargetId;
    std::array<PluginSlot, 10> pluginSlots;
    std::vector<Send> sends;
};

struct MixerGraph {
    std::vector<std::unique_ptr<MixerInsert>> inserts;
    juce::String masterInsertId;
    std::unordered_map<juce::String, juce::Point<float>> nodePositions;
};

} // namespace singularity
```

Hard limits:

| Constant | Value |
|---|---|
| `MAX_MIXER_INSERTS` | 256 |
| `DEFAULT_NORMAL_INSERT_COUNT` | 8 |
| `MAX_EFFECT_SLOTS_PER_INSERT` | 10 |
| `MAX_SENDS_PER_INSERT` | 16 |
| `MAX_SIDECHAIN_SOURCES_PER_SLOT` | 2 |
| `FADER_MIN_DB` | -80.0 |
| `FADER_MAX_DB` | +12.0 |
| `PAN_MIN` | -1.0 |
| `PAN_MAX` | +1.0 |
| `METER_BROADCAST_HZ` | 30 |

### API / interface

All UI-backend messages use the shared envelope from Spec 17:

```ts
interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
}
```

#### WebSocket commands

| Type | Payload | Response event |
|---|---|---|
| `mixer.state.subscribe` | `{}` | `mixer.state.snapshot` |
| `mixer.state.unsubscribe` | `{}` | — |
| `mixer.insert.create` | `{ kind?: 'normal' \| 'send', name?: string, color?: string, index?: number }` | `mixer.insert.created` |
| `mixer.insert.delete` | `{ insertId: string }` | `mixer.insert.deleted` |
| `mixer.insert.reorder` | `{ insertId: string, newIndex: number }` | `mixer.insert.reordered` |
| `mixer.insert.setName` | `{ insertId: string, name: string }` | `mixer.insert.updated` |
| `mixer.insert.setColor` | `{ insertId: string, color: string }` | `mixer.insert.updated` |
| `mixer.insert.setVolumeDb` | `{ insertId: string, volumeDb: number }` | `mixer.insert.updated` |
| `mixer.insert.setPan` | `{ insertId: string, pan: number }` | `mixer.insert.updated` |
| `mixer.insert.setMute` | `{ insertId: string, mute: boolean }` | `mixer.insert.updated` |
| `mixer.insert.setSolo` | `{ insertId: string, solo: boolean }` | `mixer.insert.updated` |
| `mixer.insert.setRecordArm` | `{ insertId: string, recordArm: boolean }` | `mixer.insert.updated` |
| `mixer.insert.setInputSource` | `{ insertId: string, inputSource: AudioInputSource \| null }` | `mixer.insert.updated` |
| `mixer.insert.setOutputTarget` | `{ insertId: string, targetInsertId: string \| null }` | `mixer.insert.updated` |
| `mixer.effect.loadPlugin` | `{ insertId: string, slotIndex: number, pluginInstanceId: string }` | `mixer.effect.loaded` |
| `mixer.effect.unloadPlugin` | `{ insertId: string, slotIndex: number }` | `mixer.effect.unloaded` |
| `mixer.effect.move` | `{ sourceInsertId: string, sourceSlotIndex: number, targetInsertId: string, targetSlotIndex: number }` | `mixer.effect.moved` |
| `mixer.effect.setBypass` | `{ insertId: string, slotIndex: number, bypass: boolean }` | `mixer.effect.updated` |
| `mixer.effect.setSidechainSources` | `{ insertId: string, slotIndex: number, sourceIds: string[] }` | `mixer.effect.updated` |
| `mixer.send.create` | `{ insertId: string, targetInsertId: string, levelDb?: number, preFader?: boolean }` | `mixer.send.created` |
| `mixer.send.delete` | `{ insertId: string, targetInsertId: string }` | `mixer.send.deleted` |
| `mixer.send.setLevelDb` | `{ insertId: string, targetInsertId: string, levelDb: number }` | `mixer.send.updated` |
| `mixer.send.setPreFader` | `{ insertId: string, targetInsertId: string, preFader: boolean }` | `mixer.send.updated` |
| `mixer.send.setActive` | `{ insertId: string, targetInsertId: string, active: boolean }` | `mixer.send.updated` |
| `mixer.graph.setNodePosition` | `{ nodeId: string, x: number, y: number }` | `mixer.graph.updated` |
| `mixer.graph.createConnection` | `{ sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string }` | `mixer.graph.connected` |
| `mixer.graph.deleteConnection` | `{ edgeId: string }` | `mixer.graph.disconnected` |

#### WebSocket broadcast events

```ts
interface MixerStateSnapshotEvent {
  type: 'mixer.state.snapshot';
  payload: {
    mixer: z.infer<typeof MixerStateSchema>;
    graph: z.infer<typeof RoutingGraphSchema>;
  };
}

interface MixerMeterEvent {
  type: 'mixer.meter';
  payload: {
    insertId: string;
    peakDb: number;
    rmsDb: number;
    clipping: boolean;
  }[];
}

interface MixerErrorEvent {
  type: 'mixer.error';
  payload: { commandId: string; code: string; message: string };
}
```

#### REST endpoints

All endpoints return JSON validated by the shared schemas.

```
GET    /api/v1/mixer
POST   /api/v1/mixer/inserts
PATCH  /api/v1/mixer/inserts/:id
DELETE /api/v1/mixer/inserts/:id
POST   /api/v1/mixer/inserts/:id/reorder
POST   /api/v1/mixer/inserts/:id/plugin-slots
PATCH  /api/v1/mixer/inserts/:id/plugin-slots/:slotIndex
DELETE /api/v1/mixer/inserts/:id/plugin-slots/:slotIndex
POST   /api/v1/mixer/inserts/:id/plugin-slots/:slotIndex/sidechain
POST   /api/v1/mixer/inserts/:id/sends
PATCH  /api/v1/mixer/inserts/:id/sends/:targetId
DELETE /api/v1/mixer/inserts/:id/sends/:targetId
GET    /api/v1/mixer/graph
POST   /api/v1/mixer/graph/connections
DELETE /api/v1/mixer/graph/connections/:edgeId
```

#### Backend → engine TCP/socket commands

The engine command envelope is:

```ts
interface EngineCommand<T = unknown> {
  id: string;
  type: string;
  payload: T;
}
```

Mixer-related `type` values:

- `MIXER_CREATE_INSERT`
- `MIXER_DELETE_INSERT`
- `MIXER_REORDER_INSERT`
- `MIXER_SET_INSERT_PARAM` (payload keys: `volumeDb`, `pan`, `mute`, `solo`, `recordArm`, `inputSourceIndex`, `outputTargetId`)
- `MIXER_LOAD_PLUGIN`
- `MIXER_UNLOAD_PLUGIN`
- `MIXER_MOVE_PLUGIN`
- `MIXER_SET_PLUGIN_BYPASS`
- `MIXER_SET_PLUGIN_SIDECHAIN`
- `MIXER_CREATE_SEND`
- `MIXER_DELETE_SEND`
- `MIXER_SET_SEND_PARAM`
- `MIXER_GRAPH_SET_NODE_POSITION`
- `MIXER_GRAPH_CONNECT`
- `MIXER_GRAPH_DISCONNECT`

The engine acknowledges with `{ ack: true, id }` or rejects with `{ error: true, id, code, message }`.

### UI/UX

#### Mixer panel

- Dockview panel ID: `mixer`.
- Canvas-based vertical strips, default strip width `72px`, header height `96px`, fader area `160px`.
- Each strip displays:
  - Name label and color bar.
  - Mute / Solo / Record Arm toggle buttons.
  - Pan knob / numeric field (range -1..1, center detent).
  - Volume fader (range -80 dB..+12 dB, 0 dB at 75% travel).
  - Peak/RMS meter with green/yellow/red segments; clip hold indicator.
  - 10 effect slots (rectangular buttons); empty slots show "+"; loaded slots show plugin name; bypassed slots are dimmed.
  - Send section listing active sends with target name and level knob.
  - Output target dropdown (`Master`, or list of send/bus inserts).
- Interactions:
  - Drag a strip header left/right to reorder.
  - Drag a plugin from the Browser onto an effect slot to load it.
  - Drag a plugin between slots to move it; if target occupied, swap slots.
  - Right-click a control or plugin parameter to open the "Link to automation" menu (creates an automation target; details in Spec 33: Automation, MIDI, and Transport).
  - `F9` focuses or opens the Mixer panel.
  - Shift+drag on fader for fine adjustment.
- Master insert is always the right-most strip; its background uses the theme's `master.background` token.

#### Routing graph panel

- Dockview panel ID: `routing-graph`.
- Infinite canvas with pannable/zoomable grid.
- Node types:
  - `insert` nodes — one per mixer insert, with `audioIn`, `audioOut`, `sendOut`, and `sidechainOut` ports.
  - `plugin` nodes — one per loaded effect-slot plugin, with `audioIn`, `audioOut`, `sidechainIn` ports.
  - `hardwareInput` node — audio interface inputs.
  - `masterOutput` node — final stereo output.
- Edges:
  - `output` edges (solid) from `audioOut` to `audioIn`/`masterOutput`.
  - `send` edges (dashed) from `sendOut` to `audioIn`.
  - `sidechain` edges (dotted) from `sidechainOut` to `sidechainIn`.
- Interactions:
  - Drag from an output/send/sidechain port to another port to create a connection.
  - Drag a node body to reposition; positions persist in the project model.
  - Click an edge to select it; press `Delete` or use context menu to remove it.
  - Scroll wheel zooms; drag on canvas background pans.
  - Double-click an insert node opens its mixer strip in focus.

#### Theme tokens

Mixer and graph use these CSS custom properties (mapped from VS Code themes):

```css
--mixer-strip-bg
--mixer-strip-selected-bg
--mixer-master-bg
--mixer-fader-track
--mixer-fader-thumb
--mixer-meter-green
--mixer-meter-yellow
--mixer-meter-red
--mixer-meter-clip
--mixer-cable-output
--mixer-cable-send
--mixer-cable-sidechain
--mixer-port-audio
--mixer-port-sidechain
```

### Algorithms / behavior

#### Signal flow

For each process block, the engine evaluates inserts in `order` index order:

1. **Source audio**: a normal insert receives audio from the Playlist / Channel Rack; a send insert receives only summed sends; the master receives its routed inputs.
2. **Effect chain**: process effects slots `0..9` in order. A bypassed slot copies its input to output. A slot with sidechain sources mixes those sources into the plugin's sidechain input bus before `processBlock`.
3. **Pan and fader**: apply constant-power pan law, then apply volume fader (gain = `dbToGain(volumeDb)`).
4. **Sends**: for each active send, take pre-fader signal (before step 3) if `preFader` is true, otherwise post-fader signal, scale by `dbToGain(levelDb)`, and accumulate into the target insert's input buffer.
5. **Output routing**: accumulate the post-fader signal into the output target insert's input buffer (or the master if `outputTargetId` is null and the insert is not master).
6. **Master output**: the master insert runs steps 2–3 and writes to the hardware output.

#### Mute and solo

- `mute` silences the insert's own output and its post-fader sends. Pre-fader sends remain active.
- If any normal insert has `solo = true`, the engine enters "solo mode":
  - All unsoloed normal inserts have their output and post-fader sends muted.
  - Pre-fader sends from unsoloed inserts remain active.
  - Soloed inserts, master, and send inserts continue to process normally.
  - Multiple soloed inserts are additive.
- `mute` and `solo` are independent toggles; both are reflected in the UI but solo logic is evaluated engine-side.

#### Cycle prevention

Before forwarding any `MIXER_SET_INSERT_PARAM` (output target), `MIXER_CREATE_SEND`, or `MIXER_GRAPH_CONNECT` command, the backend builds a directed graph where edges are output targets and active sends. It rejects the command if the new edge creates a path from the target back to the source. Sidechain edges do not participate in cycle detection (they are tap-only auxiliary inputs). The check runs in `O(V + E)` using DFS.

#### Metering

- Meters are computed on the audio thread after fader processing.
- Peak: maximum absolute sample value in the block, converted to dB.
- RMS: root-mean-square of the block, converted to dB.
- Peak fall: 8 dB/second decay.
- Clip indicator latches when peak ≥ -0.5 dBFS and clears on click or after 2 seconds.
- Meter data is broadcast at 30 Hz via `mixer.meter`.

#### Delay compensation

Plugin delay compensation (PDC) is applied by the engine's graph scheduler. The mixer inserts no additional delay; it exposes per-insert PDC latency to the transport/record head so recorded material aligns with processed signals. (See Spec 21: Plugin Hosting and Scanner for plugin latency reporting.)

## Implementation plan

1. Implement shared Zod schemas and TypeScript types in `packages/shared/src/schemas/mixer.ts`.
2. Implement engine C++ mixer graph (`engine/src/mixer/MixerGraph.cpp/h`) with insert, effect, send, sidechain, and metering logic.
3. Add engine TCP/socket command handlers for all mixer and graph commands.
4. Implement backend mixer model service (`packages/backend/src/mixer/mixerService.ts`) with validation, cycle detection, and engine bridge.
5. Add backend WebSocket command handlers and REST routes for mixer and graph.
6. Implement the Mixer canvas panel (`packages/ui/src/panels/MixerPanel.tsx`) with strips, meters, drag/drop, and effect slots.
7. Implement the Routing Graph canvas panel (`packages/ui/src/panels/RoutingGraphPanel.tsx`) with nodes, ports, cables, and pan/zoom.
8. Wire project save/load to persist `mixer` and `routingGraph` sections in `project.json`.
9. Add unit, integration, and E2E tests.

## Testing strategy

- **Unit tests (engine / shared)**
  - Gain/pan math and dB conversion.
  - Mute/solo truth tables.
  - Cycle detection on sample graphs.
  - Send pre/post-fader mixing.
  - Zod schema validation for all command payloads.
- **Integration tests (backend)**
  - Each REST endpoint returns the expected state and rejects invalid payloads.
  - WebSocket commands produce the correct broadcast events.
  - Cycle creation is rejected with `400` / `mixer.error`.
  - Plugin load/unload/move commands round-trip to the engine mock.
- **E2E tests**
  - Open Mixer panel, create/delete/reorder inserts.
  - Drag a plugin onto an effect slot and bypass it.
  - Create a send and verify target meter rises.
  - Create a sidechain route and verify compressor-style plugin receives sidechain.
  - Save, close, reopen project and verify mixer layout/effects/sends/graph positions.

## Acceptance criteria

- [ ] A new project contains exactly 8 normal inserts named "Insert 1".."Insert 8" and one master insert named "Master", with the master at order index 8.
- [ ] Pressing `F9` opens the Mixer panel if closed, or focuses it if already open.
- [ ] Creating a normal insert via `POST /api/v1/mixer/inserts` adds the insert at the requested index and returns a valid `InsertSchema`; the master remains the right-most insert.
- [ ] Deleting an insert removes it from the model and UI; deleting the master insert returns `400`.
- [ ] Reordering inserts via `POST /api/v1/mixer/inserts/:id/reorder` updates the `order` field of all affected inserts and persists in `project.json`.
- [ ] Setting `volumeDb` or `pan` on an insert updates engine audio within one process block and the UI fader/knob within 50 ms.
- [ ] Toggling `mute` on an insert silences its output and post-fader sends while leaving pre-fader sends unaffected.
- [ ] Toggling `solo` on one or more normal inserts mutes output and post-fader sends of all unsoloed normal inserts; master output remains audible.
- [ ] Each insert exposes exactly 10 effect slots; loading a plugin into a slot via `mixer.effect.loadPlugin` renders the plugin name in the slot and persists the assignment.
- [ ] Moving a plugin between slots via drag or API updates both source and target slot states without data loss.
- [ ] Bypassing a loaded slot disables its audio processing; the engine's processed output is identical to an empty slot.
- [ ] Each insert supports up to 16 active sends; creating a 17th send returns `400`.
- [ ] A send has a level fader (-80..+12 dB) and a pre/post-fader switch; switching changes the tap point in the engine signal flow.
- [ ] A sidechain source assignment on an effect slot accepts 0–2 source insert IDs; assigning a third source returns `400`.
- [ ] The routing graph panel displays nodes for every insert, loaded plugin, hardware input, and master output, and distinguishes output/send/sidechain cables by color and dash style.
- [ ] Creating a graph connection that would form a cycle is rejected, and the existing graph remains unchanged.
- [ ] Real-time peak/RMS meters broadcast at 30 Hz and turn red when any insert peaks ≥ -0.5 dBFS.
- [ ] Insert colors and group colors render on mixer strips and graph nodes using the VS Code theme token mapping.
- [ ] Save/reload of a `.singularity` bundle restores insert order, names, colors, volume/pan/mute/solo/record-arm, effect slots, sends, sidechain assignments, and graph node positions exactly.
- [ ] The engine mixer graph supports 256 inserts at 48 kHz / 512-sample buffer without xruns on the reference test machine (Apple M2 / 16 GB RAM or equivalent).

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture
- Spec 18: Monorepo and Build System
- Spec 19: Shared Protocol and Schemas
- Spec 20: JUCE Audio Engine Foundation
- Spec 22: Project Model and .singularity Bundle Format
- Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)
- Spec 33: Automation, MIDI, and Transport
- Spec 21: Plugin Hosting and Scanner

## Blocks

- Spec 33: Automation, MIDI, and Transport
- Spec 32: Audio Recording and Editing
- Spec 34: Export, Rendering, and AI Mastering
- Spec 35: AI Agent System

## Notes / open questions

- This spec supersedes the obsolete Spec 09 (Mixer Routing and Sends). Spec 09 remains in the repository for historical reference but is no longer authoritative.
- Decisions made in this spec that are not in `docs/decisions.md`:
  - `MAX_MIXER_INSERTS = 256` and `DEFAULT_NORMAL_INSERT_COUNT = 8`.
  - `MAX_EFFECT_SLOTS_PER_INSERT = 10` and `MAX_SENDS_PER_INSERT = 16`.
  - `MAX_SIDECHAIN_SOURCES_PER_SLOT = 2`.
  - Fader range `-80 dB..+12 dB` and pan range `-1..+1` with constant-power pan law.
  - Mute silences output and post-fader sends only; pre-fader sends remain active.
  - Solo logic mutes unsoloed normal inserts at output and post-fader sends; master remains audible.
  - Cycle prevention is performed by the backend before forwarding commands to the engine.
  - Graph node positions are persisted inside the project bundle.
- Future consideration: multi-threaded audio graph scheduling can be added later without changing the public API.
