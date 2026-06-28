# Spec 26: Channel Rack and Step Sequencer

## Objective

Implement the Singularity Channel Rack and Step Sequencer: a vertically stacked rack of up to 256 channels that drives pattern-based playback, exposes per-channel controls (mute, solo, pan, volume, pitch), supports channel groups/colors/zip-unzip compact views, and provides a velocity-sensitive step sequencer grid for every pattern.

## Motivation

FL Studio parity is built on the Channel Rack + Patterns + Playlist model. The Channel Rack is the primary instrument launcher: samplers, VST instruments, audio-clip one-shots, layer stacks, and MIDI-out devices are triggered from step sequencer patterns and routed to the mixer. Without a complete, deterministic Channel Rack the rest of the DAW (Piano Roll, Playlist, Mixer, Browser) cannot function.

## Scope

### In scope

- 64/128/256 channel rack (configurable max, hard ceiling 256).
- Vertical list of channel strips, each with name, color, mute/solo, pan, volume, pitch, and channel-settings controls.
- Per-pattern step sequencer grid with 16/32/64 steps and per-step velocity.
- Channel types: Sampler, VST Instrument, Audio Clip, Layer, MIDI Out.
- Channel groups with names/colors, collapse/expand, zip/unzip compact view, and drag membership.
- Clone, delete, and drag-to-reorder channels.
- Drag-and-drop sample loading from the Browser onto a channel strip.
- Channel settings window/panel: envelope, filter, pitch/time stretch, polyphony for Sampler; plugin editor for VST Instrument; child mapping for Layer; MIDI device/channel for MIDI Out; sample for Audio Clip.
- Output routing from each channel to a mixer insert.
- Real-time persistence of all rack, pattern, and step data in the `.singularity` project bundle.

### Out of scope

- Piano-roll note editing and per-note automation (Spec 27: Piano Roll).
- Playlist arrangement of pattern/audio/automation clips (Spec 28: Playlist and Arrangement).
- Mixer insert effects, sends, and master processing (Spec 29: Mixer and Routing Graph).
- Plugin scanner, plugin database UI, or generic preset browser (Spec 30: Browser, Plugin Database, and Presets).
- Full Edison-style destructive waveform editor (Spec 32: Audio Recording and Editing).
- AI composition tools such as chord progression / loop starter (Spec 35: AI Agent System).

## Related decisions

All 2026-06-25 decisions in `docs/decisions.md`, especially:

- Project model: FL Studio-style Channel Rack + Patterns + Playlist.
- Audio engine: JUCE C++ native engine as Tauri sidecar, single realtime audio callback, lock-free control queues.
- Backend: Fastify + `@fastify/websocket`; engine transport is local TCP/socket.
- UI: React 19 + Rsbuild + Zustand + Dockview + HTML5 Canvas + Tailwind / CSS custom properties.
- Time representation: ticks (PPQN), seconds, and bars/beats/ticks with sample-accurate offsets.
- Theme system: VS Code theme JSON files mapped to CSS custom properties.
- Quality bar: no stubs, MVPs, or placeholders; acceptance criteria must be binary and verifiable.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────┐
│  UI: ChannelRackPanel, ChannelStrip, StepGrid,              │
│       ChannelSettingsPanel (Dockview tab)                   │
│              │ HTTP / WebSocket                            │
├──────────────┼──────────────────────────────────────────────┤
│  Backend:    │ channel-rack routes, in-memory project model,│
│              │ engine bridge over TCP/socket                │
├──────────────┼──────────────────────────────────────────────┤
│  JUCE engine:│ channel-rack execution graph, step scheduler,│
│              │ layer dispatcher, MIDI-out passthrough       │
└─────────────────────────────────────────────────────────────┘
```

The backend owns the canonical project model. All mutations run through Fastify routes, update the in-memory model, persist to `project.json`, broadcast WebSocket events, and send deterministic commands to the JUCE engine over the local TCP/socket protocol.

### Data model

All schemas live in `packages/shared/src/schemas/channelRack.ts` and are imported by backend and UI.

```ts
export const MAX_CHANNELS = 256;
export const DEFAULT_PPQN = 960;
export const TICKS_PER_STEP = DEFAULT_PPQN / 4; // 16th note
export const STEP_COUNTS = [16, 32, 64] as const;

export const ChannelTypeSchema = z.enum([
  "sampler",
  "vstInstrument",
  "audioClip",
  "layer",
  "midiOut",
]);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const StepDataSchema = z.object({
  on: z.boolean(),
  velocity: z.number().min(0).max(1),
});
export type StepData = z.infer<typeof StepDataSchema>;

export const PatternSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  stepCount: z.union([z.literal(16), z.literal(32), z.literal(64)]),
});
export type Pattern = z.infer<typeof PatternSchema>;

export const StepSequenceSchema = z.object({
  patternId: z.string().uuid(),
  channelId: z.string().uuid(),
  steps: z.array(StepDataSchema),
});
export type StepSequence = z.infer<typeof StepSequenceSchema>;
```

Channel settings are discriminated by `type`.

```ts
export const AdsrEnvelopeSchema = z.object({
  attackSec: z.number().min(0).max(60),
  decaySec: z.number().min(0).max(60),
  sustain: z.number().min(0).max(1),
  releaseSec: z.number().min(0).max(60),
});

export const FilterSchema = z.object({
  type: z.enum(["lowpass", "highpass", "bandpass", "notch"]),
  cutoffHz: z.number().min(10).max(20000),
  resonance: z.number().min(0).max(10),
});

export const SamplerSettingsSchema = z.object({
  sampleAssetId: z.string().uuid(),
  rootKey: z.number().int().min(0).max(127).default(60),
  loopMode: z.enum(["noLoop", "forward", "pingPong"]),
  loopStart: z.number().int().min(0),
  loopEnd: z.number().int().min(0),
  envelope: AdsrEnvelopeSchema,
  filter: FilterSchema,
  timeStretchRatio: z.number().min(0.25).max(4).default(1),
  pitchShiftSemitones: z.number().min(-24).max(24).default(0),
  polyphony: z.union([
    z.literal("mono"),
    z.literal("legato"),
    z.object({ voices: z.number().int().min(1).max(256) }),
  ]),
});

export const VstInstrumentSettingsSchema = z.object({
  plugin: z.unknown(), // PluginInstance schema (Spec 19 / Spec 21)
  showEmbeddedEditor: z.boolean().default(true),
});

export const AudioClipSettingsSchema = z.object({
  defaultAssetId: z.string().uuid(),
});

export const LayerSettingsSchema = z.object({
  childChannelIds: z.array(z.string().uuid()).min(1),
  mode: z.enum(["stack", "cycle", "random", "velocitySplit"]),
});

export const MidiOutSettingsSchema = z.object({
  deviceId: z.string().optional(),
  channel: z.number().int().min(1).max(16).default(1),
  bank: z.number().int().min(0).max(127).optional(),
  program: z.number().int().min(0).max(127).optional(),
});

export const ChannelSettingsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sampler"), ...SamplerSettingsSchema.shape }),
  z.object({ type: z.literal("vstInstrument"), ...VstInstrumentSettingsSchema.shape }),
  z.object({ type: z.literal("audioClip"), ...AudioClipSettingsSchema.shape }),
  z.object({ type: z.literal("layer"), ...LayerSettingsSchema.shape }),
  z.object({ type: z.literal("midiOut"), ...MidiOutSettingsSchema.shape }),
]);
```

Channel and rack schemas:

```ts
export const ChannelSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().min(0).max(255),
  name: z.string().min(1).max(128),
  type: ChannelTypeSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  groupId: z.string().uuid().optional(),
  mute: z.boolean(),
  solo: z.boolean(),
  pan: z.number().min(-1).max(1),
  volume: z.number().min(0).max(1).default(0.78),
  pitch: z.number().min(-24).max(24),
  output: z.object({ insertId: z.string().uuid() }).default({ insertId: 'master' }),
  compact: z.boolean(),
  settings: ChannelSettingsSchema,
});
export type Channel = z.infer<typeof ChannelSchema>;

export const ChannelGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  channelIds: z.array(z.string().uuid()),
  compact: z.boolean(),
  collapsed: z.boolean(),
});
export type ChannelGroup = z.infer<typeof ChannelGroupSchema>;

export const ChannelRackSchema = z.object({
  channels: z.array(ChannelSchema).max(MAX_CHANNELS),
  groups: z.array(ChannelGroupSchema),
  currentPatternId: z.string().uuid(),
  selectedChannelIds: z.array(z.string().uuid()),
});
export type ChannelRack = z.infer<typeof ChannelRackSchema>;

// Patterns are global (project.patterns), not nested inside the channel rack.
// Each pattern stores per-channel data in channelData.
export const PatternChannelDataSchema = z.object({
  notes: z.array(z.any()).default([]), // NoteEvent schema from Spec 19 / Spec 27
  events: z.array(z.any()).default([]), // parameter events from Spec 33
  stepSequence: z.array(StepDataSchema).max(64).optional(),
});

export const PatternSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  stepCount: z.union([z.literal(16), z.literal(32), z.literal(64)]),
  lengthTicks: z.number().int().min(1).default(DEFAULT_PPQN * 4),
  channelData: z.record(z.string().uuid(), PatternChannelDataSchema).default({}),
});
export type Pattern = z.infer<typeof PatternSchema>;
```

The canonical `project.json` fragment:

```json
{
  "channelRack": {
    "channels": [...],
    "groups": [...],
    "currentPatternId": "...",
    "selectedChannelIds": []
  },
  "patterns": [
    {
      "id": "...",
      "channelData": {
        "<channelId>": {
          "notes": [...],
          "events": [...],
          "stepSequence": [...]
        }
      }
    }
  ]
}
```

### API / interface

#### REST endpoints (Fastify)

All routes are prefixed with `/api/projects/:projectId` and validate request/response bodies with the shared Zod schemas.

```ts
// packages/backend/src/routes/channelRack.ts
export async function channelRackRoutes(fastify: FastifyInstance) {
  fastify.get("/channel-rack", getChannelRackSchema, getChannelRackHandler);
  fastify.patch("/channel-rack/current-pattern", setCurrentPatternSchema, setCurrentPatternHandler);

  fastify.post("/channels", createChannelSchema, createChannelHandler);
  fastify.patch("/channels/:channelId", updateChannelSchema, updateChannelHandler);
  fastify.delete("/channels/:channelId", deleteChannelHandler);
  fastify.post("/channels/:channelId/clone", cloneChannelHandler);
  fastify.post("/channels/reorder", reorderChannelsSchema, reorderChannelsHandler);

  fastify.post("/channel-groups", createGroupSchema, createGroupHandler);
  fastify.patch("/channel-groups/:groupId", updateGroupSchema, updateGroupHandler);
  fastify.delete("/channel-groups/:groupId", deleteGroupHandler);

  fastify.post("/patterns", createPatternSchema, createPatternHandler);
  fastify.patch("/patterns/:patternId", updatePatternSchema, updatePatternHandler);
  fastify.delete("/patterns/:patternId", deletePatternHandler);

  fastify.get("/patterns/:patternId/step-sequences/:channelId", getStepSequenceHandler);
  fastify.put("/patterns/:patternId/step-sequences/:channelId/steps", setStepsSchema, setStepsHandler);
  fastify.patch("/patterns/:patternId/step-sequences/:channelId/steps/:stepIndex", updateStepSchema, updateStepHandler);
}
```

Key request bodies:

```ts
// POST /channels
interface CreateChannelBody {
  name: string;
  type: ChannelType;
  output: { insertId: string };
  settings?: ChannelSettings; // optional defaults for sampler/vst/etc.
}

// PATCH /channels/:channelId
interface UpdateChannelBody {
  name?: string;
  color?: string;
  groupId?: string | null;
  mute?: boolean;
  solo?: boolean;
  pan?: number;
  volume?: number;
  pitch?: number;
  output?: { insertId: string };
  compact?: boolean;
  settings?: ChannelSettings;
}

// POST /channels/reorder
interface ReorderChannelsBody {
  sourceIndex: number;
  targetIndex: number;
}

// PUT /patterns/:patternId/step-sequences/:channelId/steps
interface SetStepsBody {
  steps: StepData[]; // length must equal pattern.stepCount
}
```

Error contract: every route returns JSON `{ error: string, code: string }` with the appropriate HTTP status (`400` for validation failure, `404` for missing entity, `409` for duplicate/conflict, `422` for business-rule violations such as exceeding `MAX_CHANNELS`).

#### WebSocket events

The backend broadcasts validated delta events to all UI clients subscribed to the project namespace.

```ts
type ChannelRackEvent =
  | { type: "channel.created"; payload: Channel }
  | { type: "channel.updated"; payload: { channelId: string; changes: Partial<Channel> } }
  | { type: "channel.deleted"; payload: { channelId: string } }
  | { type: "channels.reordered"; payload: { channelIds: string[] } }
  | { type: "channelGroup.created"; payload: ChannelGroup }
  | { type: "channelGroup.updated"; payload: { groupId: string; changes: Partial<ChannelGroup> } }
  | { type: "channelGroup.deleted"; payload: { groupId: string; channelIds: string[] } }
  | { type: "pattern.created"; payload: Pattern }
  | { type: "pattern.updated"; payload: { patternId: string; changes: Partial<Pattern> } }
  | { type: "pattern.deleted"; payload: { patternId: string } }
  | { type: "stepSequence.updated"; payload: { patternId: string; channelId: string; steps: StepData[] } }
  | { type: "channelRack.currentPatternChanged"; payload: { currentPatternId: string } };
```

#### Engine commands (TCP/socket)

The backend engine bridge serializes mutations into commands for the JUCE engine.

```ts
interface EngineCommand<T = unknown> {
  id: string; // UUID
  type: string;
  payload: T;
}

// Examples:
{ type: "channelRack.loadChannels", payload: { channels: Channel[] } }
{ type: "channelRack.setChannel", payload: { channel: Channel } }
{ type: "channelRack.removeChannel", payload: { channelId: string } }
{ type: "channelRack.reorderChannels", payload: { channelIds: string[] } }
{ type: "channelRack.setStepSequence", payload: { patternId: string; channelId: string; steps: StepData[] } }
{ type: "channelRack.setCurrentPattern", payload: { patternId: string } }
{ type: "channelRack.setTransportMode", payload: { mode: "song" | "pattern" } }
```

The engine acknowledges each command with `{ type: "ack", commandId: string }` or `{ type: "error", commandId: string, message: string }`. The backend surfaces engine errors to the UI as WebSocket `engine.error` events.

#### UI hooks

```ts
// packages/ui/src/panels/ChannelRack/useChannelRack.ts
export function useChannelRackState(): ChannelRack;
export function useCurrentPattern(): Pattern;
export function useChannels(): Channel[];
export function useChannelGroups(): ChannelGroup[];
export function useStepSequence(patternId: string, channelId: string): StepData[];
export function useCreateChannel(): (body: CreateChannelBody) => Promise<Channel>;
export function useUpdateChannel(channelId: string): (changes: UpdateChannelBody) => Promise<void>;
export function useDeleteChannel(channelId: string): () => Promise<void>;
export function useCloneChannel(channelId: string): () => Promise<Channel>;
export function useReorderChannels(): (sourceIndex: number, targetIndex: number) => Promise<void>;
export function useSetSteps(patternId: string, channelId: string): (steps: StepData[]) => Promise<void>;
```

### UI/UX

#### Panel layout

- Dockview panel id: `channel-rack`.
- Default position: left sidebar under the toolbar.
- Shortcut: `F6` (FL Studio-compatible).
- The panel is rendered with HTML5 Canvas for the step grid and React controls for the per-channel chrome.

#### Channel strip

Each channel is one horizontal row:

1. **Drag handle** — reorder channels by dragging up/down.
2. **Color swatch** — opens color picker.
3. **Name field** — inline editable.
4. **Mute / Solo** toggle buttons (M / S).
5. **Volume** numeric field / vertical fader (-96 dB … +12 dB).
6. **Pan** knob/slider (-100 L … 0 … +100 R).
7. **Pitch** numeric field (-24 … +24 semitones).
8. **Channel settings** button — opens the channel-settings Dockview tab for this channel.
9. **Step grid** — `pattern.stepCount` buttons aligned horizontally.

Compact / zipped mode collapses the controls row to: drag handle, color, name, M/S, and a single "zipper" toggle.

#### Step grid

- Columns = steps 1..N (16/32/64).
- Rows = channels in rack order.
- Each cell is a button whose brightness reflects velocity and whose color reflects the on state.
- Left click toggles `on`.
- Right-click + vertical drag adjusts velocity in 0.01 increments.
- Shift-click sets a rectangular selection for multi-step edits.
- The grid follows the current pattern (`currentPatternId`).

#### Channel groups

- A group header sits above its member channels when channels are grouped.
- Header shows group name, color, collapse toggle, zip/unzip toggle, and mute/solo aggregates (visual only; individual channel mute/solo still apply).
- Drag a channel onto a group header to assign it to the group.
- Collapsing a group hides member channel strips; zipping reduces them to a single compact row per group.

#### Drag-and-drop from Browser

- Browser tree items set `dataTransfer` with MIME type `application/singularity-asset` and JSON `{ assetId, assetType: "audio" | "plugin" | "preset" }`.
- Dropping an audio asset onto an empty area creates a new Sampler channel at the end of the rack and copies the sample into the `.singularity` bundle.
- Dropping an audio asset onto an existing Sampler channel replaces its `sampleAssetId`.
- Dropping an audio asset onto a non-Sampler channel creates a new Sampler channel (no automatic type conversion).
- Dropping a plugin asset onto an empty area or existing channel creates a VST Instrument channel / replaces settings.

#### Channel settings window

- Opens as a Dockview tab with id `channel-settings:<channelId>`.
- Title bar shows channel name, color, and close button.
- **Sampler**: waveform viewer, ADSR envelope editor, filter panel, time-stretch ratio, pitch-shift semitones, polyphony selector (mono/legato/voices), loop points, root key.
- **VST Instrument**: embedded plugin editor (Spec 21: Plugin Hosting and Scanner) and a fallback generic parameter list.
- **Layer**: list of child channels with add/remove/reorder and layer-mode selector.
- **MIDI Out**: MIDI output device dropdown, channel 1-16 selector, optional bank/program.
- **Audio Clip**: waveform viewer, root key.

### Algorithms / behavior

#### Mute / solo effective muting

```ts
function isChannelAudible(channel: Channel, rack: ChannelRack): boolean {
  if (channel.mute) return false;
  const anySolo = rack.channels.some((c) => c.solo);
  if (anySolo && !channel.solo) return false;
  return true;
}
```

This affects step-sequencer and piano-roll-triggered playback for the channel. Mixer-level mute/solo is independent (Spec 29: Mixer and Routing Graph).

#### Step timing

- Each step is exactly `TICKS_PER_STEP = PPQN / 4` ticks (one 16th note).
- Pattern duration in ticks = `pattern.stepCount * TICKS_PER_STEP`.
- When the transport is in pattern mode, the engine loops the current pattern.
- A step at index `i` triggers at `patternStartTick + i * TICKS_PER_STEP`.
- Step velocity `v ∈ [0,1]` is scaled to MIDI velocity `clamp(round(v * 127), 1, 127)` for note-on events; `v = 0` is treated as off even if `on` were true.

#### Channel reorder

- `channels` array order is the source of truth.
- Reordering updates the array, emits `channels.reordered`, and sends `channelRack.reorderChannels` to the engine.
- Groups are rebuilt from `channel.groupId`; group order does not change the global channel order.

#### Layer channel dispatch

When a Layer channel receives a trigger event:

- `stack`: forward the event to every child channel.
- `cycle`: forward to the next child in round-robin order per trigger.
- `random`: choose one child uniformly per trigger.
- `velocitySplit`: choose child based on incoming velocity ranges (equal splits across child count).

Children may themselves be Sampler, VST, or MIDI Out channels. Layer channels do not produce audio directly.

#### MIDI Out channel

- Step-sequencer triggers generate MIDI note-on/off messages for the configured output device and MIDI channel.
- Per-channel pitch is applied as a note-number transpose, not pitch bend.
- Volume and pan are ignored at the MIDI-out stage (controlled by the target device).

#### Audio Clip channel

- Treats the sample as a one-shot triggered by the step sequencer.
- Uses the same sampler voice pool as a Sampler channel but with default neutral envelope settings.

## Implementation plan

1. **Shared schemas** — create `packages/shared/src/schemas/channelRack.ts` with all Zod schemas and constants; wire into `packages/shared/src/schemas/project.ts`.
2. **Backend project model** — extend the in-memory project store with `channelRack` state and pure mutation helpers in `packages/backend/src/project/channelRackMutations.ts`.
3. **Backend routes** — implement `packages/backend/src/routes/channelRack.ts` with full CRUD, validation, and persistence hooks.
4. **Engine bridge** — implement `packages/backend/src/engine/channelRackBridge.ts` to translate mutations into TCP/socket commands.
5. **JUCE engine module** — add `engine/Source/ChannelRack/` with node factory, step scheduler, layer dispatcher, and MIDI-out output.
6. **UI panel shell** — create `packages/ui/src/panels/ChannelRack/ChannelRackPanel.tsx`, `ChannelStrip.tsx`, `StepGrid.tsx`, `ChannelGroupHeader.tsx`, and Zustand store slice.
7. **Channel settings panels** — implement per-type settings components and open them as Dockview tabs.
8. **Browser drop integration** — accept `application/singularity-asset` drops and call the backend routes.
9. **Shortcuts and toolbar** — bind `F6`, add toolbar button, integrate with Spec 25: Dockview Layout and Shell Panels view-switching logic.
10. **Tests** — unit tests for schemas/mutations/algorithms, integration tests for routes/WS/engine bridge, E2E tests for the full create-channel/draw-steps/play flow.

## Testing strategy

- **Unit tests**
  - Zod schema validation (valid/invalid channels, patterns, step sequences).
  - `isChannelAudible` for every mute/solo combination.
  - Step tick calculation for 16/32/64 step patterns at multiple BPM values.
  - Reorder, clone, delete mutations preserve invariants (max channels, unique ids, group membership).
  - Layer dispatch logic for stack/cycle/random/velocitySplit.

- **Integration tests**
  - Every Fastify route returns correct status, body, and persisted state.
  - WebSocket events are emitted within one event loop after a mutation.
  - Engine bridge produces the expected TCP/socket command sequence for a realistic editing session.
  - Backend rejects operations that would exceed `MAX_CHANNELS` or mismatch `stepCount`.

- **E2E tests**
  - Open Channel Rack with `F6`, create a Sampler channel, drag a sample from Browser, draw steps, press Play, and assert the engine reports active voices / mixer meters.
  - Clone a channel and verify the new channel is a deep copy with a unique id.
  - Reorder channels by drag and verify the backend array order and engine `reorderChannels` command.
  - Toggle mute/solo and verify audible channels match `isChannelAudible`.
  - Open channel settings, change Sampler envelope/filter, and verify engine state reflects the change.

## Acceptance criteria

- [ ] `project.json` stores a `channelRack` object matching `ChannelRackSchema` and round-trips through save/load without data loss.
- [ ] The backend enforces a hard maximum of 256 channels and rejects creation beyond the limit with HTTP `422`.
- [ ] The UI renders one channel strip per channel in a vertically scrollable list, with drag handles for reordering.
- [ ] Each channel strip displays name, color swatch, Mute toggle, Solo toggle, Volume control (0–1 normalized linear), Pan control (-1 to 1), Pitch control (-24 to +24 semitones), and a Channel Settings button.
- [ ] The step sequencer grid renders the current pattern with exactly 16, 32, or 64 columns and one row per channel.
- [ ] Left-clicking a step toggles its `on` state; right-click drag sets velocity in 0..1 with live visual feedback.
- [ ] Step sequence mutations persist, emit `stepSequence.updated` over WebSocket, and update the JUCE engine within 50 ms.
- [ ] The backend supports creation of all five channel types (Sampler, VST Instrument, Audio Clip, Layer, MIDI Out) with validated settings schemas.
- [ ] Sampler playback is affected by envelope, filter, time-stretch ratio, pitch shift, and polyphony settings from the channel settings panel.
- [ ] VST Instrument channels load the specified plugin and display its embedded editor or a generic parameter list.
- [ ] Layer channels dispatch triggers to child channels according to the selected mode (stack/cycle/random/velocitySplit).
- [ ] MIDI Out channels send note-on/off messages to the selected hardware/device and MIDI channel.
- [ ] Channels can be cloned; the clone receives a new UUID and a "Copy" suffix but otherwise identical settings.
- [ ] Channels can be deleted; deletion removes the channel from groups, patterns, and step sequences.
- [ ] Channels can be reordered by drag; the backend array order, the UI order, and the engine order remain synchronized.
- [ ] Channel groups can be created, renamed, colored, collapsed, zipped, and deleted; group membership is persisted.
- [ ] Dragging an audio asset from the Browser onto a channel strip or empty rack area creates/updates a Sampler channel and copies the asset into the `.singularity` bundle.
- [ ] The channel settings panel opens as a Dockview tab and exposes type-appropriate controls for every channel type.
- [ ] Effective mute/solo follows `isChannelAudible`: muted channels are silent, and when any channel is soloed only soloed channels are audible.
- [ ] The current pattern can be switched via the UI and backend; the step grid updates immediately and the engine receives `channelRack.setCurrentPattern`.
- [ ] All unit tests for schemas, mutations, and algorithms pass.
- [ ] All integration tests for routes, WebSocket events, and engine-bridge commands pass.
- [ ] All E2E tests for channel creation, step sequencing, drag/drop, and playback pass.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture — provides the runtime stack, package layout, and UI/backend/engine communication paths.
- Spec 24: Design System and VS Code Theme Integration — provides tokens, buttons, inputs, sliders, and panel layout conventions used by the channel strip and settings panel.
- Spec 29: Mixer and Routing Graph — defines mixer inserts/buses to which channels route.
- Spec 21: Plugin Hosting and Scanner — defines VST/AU plugin scanning, loading, and editor embedding for VST Instrument channels.
- Spec 22: Project Model and .singularity Bundle Format — establishes the `.singularity` ZIP bundle and `project.json` persistence strategy.
- Spec 20: JUCE Audio Engine Foundation — establishes the engine lifecycle and transport commands that the step scheduler relies on.

## Blocks

- None among currently committed specs. This spec is the first core DAW panel and its model must be complete before downstream panel specs (Piano Roll, Playlist, Mixer, Browser) can rely on channel/pattern data.

## Notes / open questions

### Decisions made in this spec (not in `docs/decisions.md`)

1. **Step duration**: one step equals one 16th note (`PPQN / 4` ticks). Pattern length is therefore `stepCount * PPQN / 4` ticks.
2. **Step data ownership**: step sequences are stored per pattern per channel, not globally per channel. This matches the FL Studio pattern model.
3. **Rack layout**: "vertical channel strips" is interpreted as a vertically stacked list of horizontal channel rows; each row contains the channel chrome and the step grid.
4. **Channel settings window**: opens as a Dockview tab (`channel-settings:<channelId>`), not a modal dialog, to stay consistent with the detachable panel design.
5. **Control ranges**: volume -96 dB..+12 dB, pan -1..1, pitch -24..+24 semitones, velocity 0..1 mapped to MIDI velocity 1..127.
6. **Mute/solo scope**: channel rack mute/solo affects instrument triggering only. Mixer strip mute/solo remains independent (Spec 29: Mixer and Routing Graph).
7. **Browser drop behavior**: dropping an audio sample onto a non-Sampler channel creates a new Sampler channel rather than converting the existing channel, preserving the original channel and its data.
8. **Audio Clip channel**: implemented as a one-shot sample triggered by the step sequencer, sharing the sampler voice pool with a neutral default envelope.
