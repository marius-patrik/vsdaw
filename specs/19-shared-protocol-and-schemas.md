# Spec 19: Shared Protocol and Schemas

## Objective

Define the canonical Zod schemas, TypeScript types, and wire-protocol envelopes that all Singularity v1.0 packages (`packages/backend`, `packages/ui`, `packages/cli`, `packages/mcp`, and the JUCE engine TCP consumer) use to exchange project state, commands, events, and errors.

## Motivation

The UI, backend, engine bridge, agent tooling, and persistence layer all operate on the same project model and message bus. Without a single source of truth in `packages/shared`, schema drift between layers causes serialization bugs, broken undo/redo, and incompatible save files. This spec establishes that source of truth and the exact bytes on the wire.

## Scope

### In scope

- Public API of `packages/shared`: Zod schemas, inferred TypeScript types, protocol constants, and validation helpers.
- UI-backend message envelope for HTTP request/response and WebSocket real-time events.
- Backend-engine TCP frame layout and payload schema.
- Canonical `.singularity` project JSON schema (the contents of `project.json`).
- Core domain schemas: time, channel rack, patterns, notes, playlist, mixer, routing graph, automation, plugins, assets, transport, MIDI.
- Error envelope and protocol-versioning constants.
- Pure conversion utilities between ticks, seconds, samples, and bars/beats/ticks.

### Out of scope

- Concrete REST endpoint handlers and WebSocket room logic (Spec 23 — Backend API).
- JUCE audio-thread internals and DSP graph scheduling (Spec 20 — JUCE Audio Engine Foundation).
- Canvas rendering, panel layouts, and editor interactions (Specs 26–30).
- Detailed AI skill catalog and tool implementations (Spec 35 — AI Agent System).
- ZIP bundle packaging, autosave, and crash recovery (Spec 22: Project Model and .singularity Bundle Format).

## Related decisions

All 2026-06-25 entries in `docs/decisions.md` that affect cross-package contracts, especially:

- Fastify + `@fastify/websocket` for the backend transport.
- Local TCP/socket between backend and JUCE engine.
- `.singularity` native project format with JSON canonical model.
- Zod as the validation/schema layer.
- TypeScript 5.x strict mode.
- Multiple time representations: ticks (PPQN), seconds, bars/beats/ticks, samples.
- FL Studio-style Channel Rack + Patterns + Playlist project model.
- No stubs, MVPs, or placeholders; every acceptance criterion must be binary.

## Detailed design

### Subsystem overview

`packages/shared` is a pure TypeScript package with no React, audio, or shell dependencies. It exports three layers:

1. **`constants`** — protocol version, PPQN, engine frame limits.
2. **`schemas`** — Zod schemas for the wire protocol and project model.
3. **`utils`** — validation helpers, frame serialization, and time conversion functions.

Consumers:

- `packages/backend` validates every incoming WebSocket/HTTP message and serializes engine frames.
- `packages/ui` validates server events and builds Zustand state from typed payloads.
- `packages/cli` and `packages/mcp` validate tool-call requests against the same schemas.
- The C++ engine implements a byte-compatible TCP frame parser and JSON payload consumer.

```
┌──────────────────────────────────────────────────────────────┐
│                     packages/shared                           │
│  constants  │  Zod schemas  │  validation / frame / time     │
└─────────────┬───────────────┬────────────────────────────────┘
              │               │
   backend ◄──┘               └──► ui / cli / mcp
              │
              └──► TCP frame format consumed by JUCE engine
```

### Data model

All identifiers use a single `EntityId` type to keep references homogeneous across the project model and the protocol.

```ts
export const ENTITY_ID_MAX_LEN = 64;
export const EntityIdSchema = z
  .string()
  .min(1)
  .max(ENTITY_ID_MAX_LEN)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: 'EntityId must be URL-safe (alphanumeric, _, -)',
  });
export type EntityId = z.infer<typeof EntityIdSchema>;

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
export type HexColor = z.infer<typeof HexColorSchema>;
```

#### Time

```ts
export const PPQN = 960 as const;
export const MAX_BPM = 999 as const;
export const MIN_BPM = 1 as const;

export const TickSchema = z.number().int().safe();
export type Tick = z.infer<typeof TickSchema>;

export const SampleSchema = z.number().int().safe();
export type Sample = z.infer<typeof SampleSchema>;

export const SecondSchema = z.number().finite().safe();
export type Second = z.infer<typeof SecondSchema>;

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().min(1).max(64),
  denominator: z
    .number()
    .int()
    .min(1)
    .max(64)
    .refine((v) => Number.isInteger(Math.log2(v)), {
      message: 'time-signature denominator must be a power of two',
    }),
});
export type TimeSignature = z.infer<typeof TimeSignatureSchema>;

export const BarBeatTickSchema = z.object({
  bar: z.number().int().min(0),
  beat: z.number().int().min(0),
  tick: z.number().int().min(0),
});
export type BarBeatTick = z.infer<typeof BarBeatTickSchema>;
```

#### Channel rack

```ts
export const CHANNEL_TYPES = [
  'sampler',
  'vstInstrument',
  'audioClip',
  'layer',
  'midiOut',
] as const;
export const ChannelTypeSchema = z.enum(CHANNEL_TYPES);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const MixerInsertRefSchema = z.object({
  insertId: EntityIdSchema,
});
export type MixerInsertRef = z.infer<typeof MixerInsertRefSchema>;

export const SamplerChannelSettingsSchema = z.object({
  type: z.literal('sampler'),
  sampleAssetId: EntityIdSchema,
  rootNote: z.number().int().min(0).max(127).default(60),
  loopMode: z.enum(['none', 'forward', 'pingPong']).default('none'),
});

export const VstInstrumentChannelSettingsSchema = z.object({
  type: z.literal('vstInstrument'),
  plugin: PluginInstanceSchema,
});

export const AudioClipChannelSettingsSchema = z.object({
  type: z.literal('audioClip'),
  defaultAssetId: EntityIdSchema,
});

export const LayerChannelSettingsSchema = z.object({
  type: z.literal('layer'),
  childChannelIds: z.array(EntityIdSchema).max(256),
});

export const MidiOutChannelSettingsSchema = z.object({
  type: z.literal('midiOut'),
  deviceId: z.string().max(256).optional(),
  channel: z.number().int().min(1).max(16).default(1),
});

export const ChannelSettingsSchema = z.discriminatedUnion('type', [
  SamplerChannelSettingsSchema,
  VstInstrumentChannelSettingsSchema,
  AudioClipChannelSettingsSchema,
  LayerChannelSettingsSchema,
  MidiOutChannelSettingsSchema,
]);
export type ChannelSettings = z.infer<typeof ChannelSettingsSchema>;

export const ChannelSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0).max(255),
  name: z.string().min(1).max(128),
  type: ChannelTypeSchema,
  color: HexColorSchema.optional(),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  // Normalized linear 0–1; 0.78 ≈ −2 dB, matching FL default fader feel.
  volume: z.number().min(0).max(1).default(0.78),
  pan: z.number().min(-1).max(1).default(0),
  pitch: z.number().default(0),
  output: MixerInsertRefSchema.default({ insertId: 'master' }),
  settings: ChannelSettingsSchema,
});
export type Channel = z.infer<typeof ChannelSchema>;

export const ChannelRackSchema = z.object({
  channels: z.array(ChannelSchema).max(256),
});
export type ChannelRack = z.infer<typeof ChannelRackSchema>;
```

#### Patterns and notes

```ts
export const NoteEventSchema = z.object({
  id: EntityIdSchema,
  key: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127).default(100),
  pan: z.number().int().min(-64).max(63).default(0),
  startTick: TickSchema,
  durationTicks: TickSchema,
  channelId: EntityIdSchema.optional(),
  color: HexColorSchema.optional(),
});
export type NoteEvent = z.infer<typeof NoteEventSchema>;

export const PatternChannelDataSchema = z.object({
  notes: z.array(NoteEventSchema).default([]),
  events: z.array(AutomationPointSchema).default([]),
  stepSequence: z
    .array(z.boolean())
    .max(64)
    .optional(),
});
export type PatternChannelData = z.infer<typeof PatternChannelDataSchema>;

export const PatternSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0),
  name: z.string().max(128),
  color: HexColorSchema.optional(),
  lengthTicks: TickSchema.default(PPQN * 4),
  channelData: z.record(EntityIdSchema, PatternChannelDataSchema).default({}),
});
export type Pattern = z.infer<typeof PatternSchema>;
```

(Automation point schema is defined in the Automation section below.)

#### Playlist

```ts
export const FadeTypeSchema = z.enum([
  'linear',
  'logarithmic',
  'exponential',
  'sCurve',
]);

export const FadeSchema = z.object({
  type: FadeTypeSchema,
  durationTicks: TickSchema,
});
export type Fade = z.infer<typeof FadeSchema>;

export const PatternClipSchema = z.object({
  type: z.literal('pattern'),
  id: EntityIdSchema,
  patternId: EntityIdSchema,
  startTick: TickSchema,
  durationTicks: TickSchema,
  offsetTicks: TickSchema.default(0),
  loop: z.boolean().default(false),
  color: HexColorSchema.optional(),
});

export const AudioClipSchema = z.object({
  type: z.literal('audio'),
  id: EntityIdSchema,
  assetId: EntityIdSchema,
  startTick: TickSchema,
  durationTicks: TickSchema,
  offsetSamples: SampleSchema.default(0),
  fadeIn: FadeSchema.default({ type: 'linear', durationTicks: 0 }),
  fadeOut: FadeSchema.default({ type: 'linear', durationTicks: 0 }),
  pitch: z.number().default(0),
  timeStretchRatio: z.number().positive().default(1),
  color: HexColorSchema.optional(),
});

export const AutomationClipRefSchema = z.object({
  type: z.literal('automation'),
  id: EntityIdSchema,
  automationClipId: EntityIdSchema,
  startTick: TickSchema,
  durationTicks: TickSchema,
  color: HexColorSchema.optional(),
});

export const ClipSchema = z.discriminatedUnion('type', [
  PatternClipSchema,
  AudioClipSchema,
  AutomationClipRefSchema,
]);
export type Clip = z.infer<typeof ClipSchema>;

export const PlaylistTrackSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0),
  name: z.string().max(128),
  color: HexColorSchema.optional(),
  heightPx: z.number().int().min(20).default(60),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  recordArm: z.boolean().default(false),
  input: z.enum(['none', 'stereo', 'mono']).default('none'),
  output: MixerInsertRefSchema.default({ insertId: 'master' }),
  clips: z.array(ClipSchema),
});
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;

export const PlaylistSchema = z.object({
  tracks: z.array(PlaylistTrackSchema).min(1),
});
export type Playlist = z.infer<typeof PlaylistSchema>;
```

#### Mixer

```ts
export const PluginFormatSchema = z.enum(['vst3', 'au', 'clap', 'lv2', 'aax']);
export type PluginFormat = z.infer<typeof PluginFormatSchema>;

export const PluginInstanceSchema = z.object({
  id: EntityIdSchema,
  descriptorId: EntityIdSchema,
  name: z.string().max(256),
  vendor: z.string().max(256),
  version: z.string().max(64),
  format: PluginFormatSchema,
  stateBlobBase64: z.string().optional(),
  parameters: z.record(z.string(), z.number()).default({}),
  delaySamples: z.number().int().min(0).default(0),
});
export type PluginInstance = z.infer<typeof PluginInstanceSchema>;

export const PluginSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(9),
  plugin: PluginInstanceSchema.optional(),
  bypass: z.boolean().default(false),
});
export type PluginSlot = z.infer<typeof PluginSlotSchema>;

export const SendSchema = z.object({
  targetInsertId: EntityIdSchema,
  levelDb: z.number().min(-80).max(12).default(0),
  preFader: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type Send = z.infer<typeof SendSchema>;

export const InsertKindSchema = z.enum(['normal', 'send', 'master']);
export type InsertKind = z.infer<typeof InsertKindSchema>;

export const AudioInputSourceSchema = z.object({
  deviceInputIndex: z.number().int().min(0),
  label: z.string(),
});
export type AudioInputSource = z.infer<typeof AudioInputSourceSchema>;

export const MixerInsertSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int().min(0),
  name: z.string().max(128),
  color: HexColorSchema.optional(),
  kind: InsertKindSchema.default('normal'),
  volumeDb: z.number().min(-80).max(12).default(0),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  recordArm: z.boolean().default(false),
  inputSource: AudioInputSourceSchema.nullable().default(null),
  outputTargetId: EntityIdSchema.nullable().default(null),
  pluginSlots: z.array(PluginSlotSchema).max(10).default([]),
  sends: z.array(SendSchema).max(16).default([]),
});
export type MixerInsert = z.infer<typeof MixerInsertSchema>;

export const MixerSchema = z.object({
  inserts: z.array(MixerInsertSchema).min(1),
});
export type Mixer = z.infer<typeof MixerSchema>;
```

#### Routing graph

```ts
export const RoutingGraphPortKindSchema = z.enum([
  'audioIn',
  'audioOut',
  'sidechainIn',
  'sidechainOut',
  'sendOut',
]);
export type RoutingGraphPortKind = z.infer<typeof RoutingGraphPortKindSchema>;

export const RoutingGraphPortSchema = z.object({
  id: EntityIdSchema,
  kind: RoutingGraphPortKindSchema,
  label: z.string().max(64).optional(),
});
export type RoutingGraphPort = z.infer<typeof RoutingGraphPortSchema>;

export const RoutingGraphNodeTypeSchema = z.enum([
  'insert',
  'plugin',
  'hardwareInput',
  'masterOutput',
]);
export type RoutingGraphNodeType = z.infer<typeof RoutingGraphNodeTypeSchema>;

export const RoutingGraphNodeSchema = z.object({
  id: EntityIdSchema,
  type: RoutingGraphNodeTypeSchema,
  entityId: EntityIdSchema,
  x: z.number(),
  y: z.number(),
  ports: z.array(RoutingGraphPortSchema).default([]),
});
export type RoutingGraphNode = z.infer<typeof RoutingGraphNodeSchema>;

export const RoutingGraphEdgeKindSchema = z.enum([
  'output',
  'send',
  'sidechain',
]);
export type RoutingGraphEdgeKind = z.infer<typeof RoutingGraphEdgeKindSchema>;

export const RoutingGraphEdgeSchema = z.object({
  id: EntityIdSchema,
  sourceNodeId: EntityIdSchema,
  sourcePortId: EntityIdSchema,
  targetNodeId: EntityIdSchema,
  targetPortId: EntityIdSchema,
  kind: RoutingGraphEdgeKindSchema,
});
export type RoutingGraphEdge = z.infer<typeof RoutingGraphEdgeSchema>;

export const RoutingGraphSchema = z.object({
  nodes: z.array(RoutingGraphNodeSchema),
  edges: z.array(RoutingGraphEdgeSchema),
});
export type RoutingGraph = z.infer<typeof RoutingGraphSchema>;
```

#### Automation

```ts
export const AutomationTargetTypeSchema = z.enum([
  'channelParam',
  'pluginParam',
  'mixerParam',
  'transportParam',
]);

export const AutomationTargetSchema = z.object({
  type: AutomationTargetTypeSchema,
  entityId: EntityIdSchema,
  parameterId: z.string().min(1).max(128),
});
export type AutomationTarget = z.infer<typeof AutomationTargetSchema>;

export const AutomationPointSchema = z.object({
  tick: TickSchema,
  value: z.number().finite(),
  curve: z
    .enum(['linear', 'smooth', 'hold', 'exponential', 'sine'])
    .default('linear'),
});
export type AutomationPoint = z.infer<typeof AutomationPointSchema>;

export const AutomationClipSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(128),
  target: AutomationTargetSchema,
  points: z.array(AutomationPointSchema),
});
export type AutomationClip = z.infer<typeof AutomationClipSchema>;
```

#### Assets

```ts
export const AssetKindSchema = z.enum([
  'audio',
  'video',
  'image',
  'preset',
  'soundfont',
  'midi',
  'pluginState',
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetRefSchema = z.object({
  id: EntityIdSchema,
  kind: AssetKindSchema,
  name: z.string().max(256),
  originalPath: z.string().max(4096).optional(),
  bundlePath: z.string().max(4096),
  hashSha256: z.string().length(64).optional(),
  sizeBytes: z.number().int().min(0),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;
```

#### Project

```ts
export const SUPPORTED_SAMPLE_RATES = [44100, 48000, 88200, 96000] as const;

export const ProjectSettingsSchema = z.object({
  audioBufferSize: z.number().int().min(16).max(8192).default(512),
  defaultTemplateId: EntityIdSchema.optional(),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectSchema = z
  .object({
    version: z.literal('1.0.0'),
    id: EntityIdSchema,
    name: z.string().min(1).max(256),
    createdAt: z.string().datetime(),
    modifiedAt: z.string().datetime(),
    bpm: z.number().min(MIN_BPM).max(MAX_BPM).default(120),
    timeSignature: TimeSignatureSchema.default({ numerator: 4, denominator: 4 }),
    sampleRate: z
      .union([
        z.literal(44100),
        z.literal(48000),
        z.literal(88200),
        z.literal(96000),
      ])
      .default(48000),
    channelRack: ChannelRackSchema,
    patterns: z.array(PatternSchema),
    playlist: PlaylistSchema,
    mixer: MixerSchema,
    routing: RoutingGraphSchema,
    automationClips: z.array(AutomationClipSchema).default([]),
    assets: z.array(AssetRefSchema).default([]),
    settings: ProjectSettingsSchema.default({}),
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;
```

#### Transport and MIDI

```ts
export const TransportStateSchema = z.enum([
  'stopped',
  'playing',
  'recording',
  'paused',
]);
export type TransportState = z.infer<typeof TransportStateSchema>;

export const TransportModeSchema = z.enum(['song', 'pattern']);
export type TransportMode = z.infer<typeof TransportModeSchema>;

export const MidiMessageSchema = z.object({
  bytes: z.array(z.number().int().min(0).max(255)).min(1).max(3),
  timestampSamples: SampleSchema.optional(),
});
export type MidiMessage = z.infer<typeof MidiMessageSchema>;
```

### API / interface

#### Protocol constants

```ts
export const PROTOCOL_VERSION = '1.0.0' as const;
export const ENGINE_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16 MiB
export const WS_SUBPROTOCOL = 'singularity.v1' as const;
```

#### Error envelope

```ts
export const ErrorCodeSchema = z.enum([
  'ERR_INVALID_MESSAGE',
  'ERR_UNKNOWN_TYPE',
  'ERR_VALIDATION_FAILED',
  'ERR_ENGINE_TIMEOUT',
  'ERR_ENGINE_NOT_CONNECTED',
  'ERR_PROJECT_NOT_FOUND',
  'ERR_UNAUTHORIZED_ACTION',
  'ERR_INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorEnvelopeSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().max(1024),
  details: z.unknown().optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
```

#### UI-backend envelopes

The canonical UI-backend envelopes are defined in Spec 23. `packages/shared` re-exports the same schemas so all packages validate against one shape.

```ts
export const MessageSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(128),
  payload: z.unknown(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ReplySchema = z.object({
  id: z.string().uuid(),
  type: z.literal('reply'),
  inReplyTo: z.string().uuid(),
  success: z.boolean(),
  payload: z.unknown().optional(),
  error: ErrorEnvelopeSchema.optional(),
});
export type Reply = z.infer<typeof ReplySchema>;

export const EventSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('event'),
  topic: z.string().min(1).max(256),
  payload: z.unknown(),
});
export type Event = z.infer<typeof EventSchema>;

export function createMessage<T>(type: string, payload: T): Message;

export function createReply<T>(
  requestId: string,
  success: boolean,
  payload?: T,
  error?: ErrorEnvelope,
): Reply;

export function createEvent<T>(topic: string, payload: T): Event;

export function validateMessage(input: unknown): Message;
export function validateReply(input: unknown): Reply;
export function validateEvent(input: unknown): Event;
```

#### Backend-engine TCP frame

A frame is a length-prefixed JSON blob:

```
| payloadLength (4 bytes BE uint32) | payload (UTF-8 JSON) |
```

The payload JSON must conform to `EngineMessageSchema`:

```ts
export const EngineMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(128),
  payload: z.unknown(),
});
export type EngineMessage = z.infer<typeof EngineMessageSchema>;

export function serializeEngineFrame(message: EngineMessage): Uint8Array;

export function parseEngineFrames(
  buffer: Uint8Array,
): {
  messages: EngineMessage[];
  remainder: Uint8Array;
};

export function validateEngineMessage(
  input: unknown,
): EngineMessage;
```

#### HTTP/WebSocket surface

- `GET /api/v1/health` returns:

```ts
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});
```

- WebSocket is exposed at `/ws` with subprotocol `singularity.v1`. After the connection opens, the server emits an event of type `connection.ready` with payload `{ protocolVersion: '1.0.0' }`.

- Example UI-backend request types (payload schemas defined in later specs): `project.create`, `project.open`, `project.save`, `transport.play`, `transport.stop`, `transport.record`, `mixer.setVolumeDb`, `mixer.setPan`, `channel.setName`, `channel.setOutput`, `pattern.addNote`, `playlist.addClip`, `plugin.load`, `plugin.setParameter`.

- Example backend-UI event types: `project.loaded`, `project.updated`, `transport.state`, `transport.position`, `mixer.meters`, `engine.error`, `browser.pageEvent`, `terminal.output`.

- Example engine message types: `engine/ping`, `engine/pong`, `engine/init`, `engine/loadProject`, `engine/transportCommand`, `engine/setParameter`, `engine/meterUpdate`, `engine/positionUpdate`, `engine/error`.

#### Validation helpers

```ts
export function validateProject(input: unknown): Project;
export function isValidProject(input: unknown): input is Project;
export function validateAssetRef(input: unknown): AssetRef;
export function validateNoteEvent(input: unknown): NoteEvent;
export function validateClip(input: unknown): Clip;
export function validateMixerInsert(input: unknown): MixerInsert;
```

### UI/UX

This spec does not define panels, but it controls what error information the UI can show:

- A failed `Message`, `Reply`, or `Event` validation renders a non-blocking toast with `ErrorEnvelope.code` and `message`.
- A rejected `Project` load shows a modal with the full Zod error path and blocks opening the corrupt `.singularity` file.
- Real-time events (`transport.position`, `mixer.meters`) carry monotonic envelope `id` and server-emitted timestamps so the UI can drop stale frames when rendering canvas editors.

### Algorithms / behavior

#### Strict vs. passthrough validation

- `ProjectSchema` uses `.strict()` so typos or unexpected fields in `project.json` are rejected immediately.
- `MessageSchema`, `ReplySchema`, and `EventSchema` use `.strict()` so unknown envelope fields are rejected; protocol metadata belongs inside `payload`.

#### Time conversion

```ts
function ticksToSeconds(ticks: Tick, bpm: number, ppqn = PPQN): Second {
  return (ticks / ppqn) * (60 / bpm);
}

function secondsToTicks(seconds: Second, bpm: number, ppqn = PPQN): Tick {
  return Math.round(seconds * (bpm / 60) * ppqn);
}

function samplesToSeconds(samples: Sample, sampleRate: number): Second {
  return samples / sampleRate;
}

function secondsToSamples(seconds: Second, sampleRate: number): Sample {
  return Math.round(seconds * sampleRate);
}

function ticksToBarBeatTick(
  ticks: Tick,
  timeSignature: TimeSignature,
  ppqn = PPQN,
): BarBeatTick {
  const ticksPerBeat = (ppqn * 4) / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  const bar = Math.floor(ticks / ticksPerBar);
  const remainder = ticks % ticksPerBar;
  const beat = Math.floor(remainder / ticksPerBeat);
  const tick = remainder % ticksPerBeat;
  return { bar, beat, tick };
}

function barBeatTickToTicks(
  bbt: BarBeatTick,
  timeSignature: TimeSignature,
  ppqn = PPQN,
): Tick {
  const ticksPerBeat = (ppqn * 4) / timeSignature.denominator;
  const ticksPerBar = ticksPerBeat * timeSignature.numerator;
  return (
    bbt.bar * ticksPerBar +
    bbt.beat * ticksPerBeat +
    bbt.tick
  );
}
```

All conversions use finite number checks and throw `RangeError` on non-finite inputs. `secondsToTicks` and `secondsToSamples` round to the nearest integer.

#### Engine frame parser

`parseEngineFrames` scans a byte buffer:

1. Require at least 4 bytes (length prefix).
2. Read 4-byte big-endian length `L`; if `L > ENGINE_MAX_PAYLOAD_BYTES`, throw `ERR_INVALID_MESSAGE`.
3. If buffer length < `4 + L`, return accumulated messages and keep remaining bytes.
4. Decode payload as UTF-8 JSON, validate with `EngineMessageSchema`, append to output, advance cursor, repeat.

#### Project uniqueness invariants (validated at runtime by backend)

- `project.mixer.inserts` must contain exactly one insert with `id === 'master'` and `kind === 'master'`.
- `project.channelRack.channels` indices must be unique and contiguous starting at 0.
- `project.playlist.tracks` indices must be unique and contiguous starting at 0.
- Every `Channel.output.insertId`, `PlaylistTrack.output.insertId`, `Send.targetInsertId`, `Clip.patternId`, `Clip.assetId`, and `AutomationClip.target.entityId` must reference an existing entity in the project.

These are cross-field checks performed by the backend after schema validation; they are not encoded in Zod because they require full-project context.

## Implementation plan

1. Create `packages/shared` with `src/constants.ts`, `src/schemas/index.ts`, `src/types.ts`, `src/protocol.ts`, and `src/utils.ts`.
2. Implement constants: `PPQN`, `PROTOCOL_VERSION`, engine frame constants, ID regex, limits.
3. Implement base schemas and domain schemas in dependency order: base → time → channel rack → patterns → playlist → mixer → graph → automation → assets → project.
4. Implement wire-protocol schemas: `MessageSchema`, `ReplySchema`, `EventSchema`, `ErrorEnvelopeSchema`, `EngineMessageSchema`.
5. Implement `serializeEngineFrame` / `parseEngineFrames` and time-conversion utilities.
6. Wire Biome and `tsconfig.json` with strict mode; add a `build` script that runs `tsc --noEmit`.
7. Write Jest unit tests covering every schema and utility.
8. Update `packages/backend`, `packages/ui`, `packages/cli`, and `packages/mcp` to import `@singularity/shared` and validate at least one message type end-to-end.

## Testing strategy

- **Unit tests**
  - Every schema has a passing positive case and at least one failing negative case exercising boundary values.
  - `Project` strict mode rejects unknown keys and accepts a minimal valid project.
  - Time conversion round-trips are within ±1 tick for BPM 1–999 and time signatures with denominators 1, 2, 4, 8, 16.
  - `parseEngineFrames` handles single frames, multiple frames, partial frames, malformed length prefixes, and oversized payloads.
- **Integration tests**
  - Backend rejects a WebSocket message missing `id` or `type` with `ERR_INVALID_MESSAGE`.
  - Backend serializes an `engine/loadProject` command; the C++ engine parser returns the same `id` and `type`.
  - A saved `.singularity` `project.json` round-trips through `validateProject` without mutation.
- **E2E tests**
  - Not required at the shared-schema layer; E2E coverage lives in backend and UI specs.

## Acceptance criteria

- [ ] `packages/shared` compiles under TypeScript strict mode with zero errors and zero `any` implicit escapes.
- [ ] `PROTOCOL_VERSION` exported constant equals `'1.0.0'`.
- [ ] Every exported Zod schema has at least one unit test proving it accepts a valid value and at least one unit test proving it rejects an invalid value.
- [ ] `Message` validation rejects objects missing `id`, `type`, or `payload`; accepts a well-formed request envelope.
- [ ] `Reply` validation rejects objects missing `id`, `type`, `inReplyTo`, or `success`; accepts a well-formed success reply.
- [ ] `Event` validation rejects objects missing `id`, `type`, `topic`, or `payload`; accepts a well-formed event.
- [ ] `Project` schema accepts a minimal valid project with one channel, one pattern, one playlist track, one mixer insert, and one asset; rejects `project.json` with missing `version` or `version !== '1.0.0'`; rejects unknown top-level keys (strict).
- [ ] `serializeEngineFrame` and `parseEngineFrames` are exact byte/JSON inverses for payloads up to `ENGINE_MAX_PAYLOAD_BYTES`.
- [ ] `parseEngineFrames` rejects buffers with payload length greater than `ENGINE_MAX_PAYLOAD_BYTES` and correctly resumes after partial frames.
- [ ] `ticksToSeconds(960, 120, 960)` returns exactly `0.5`, and `secondsToTicks(0.5, 120, 960)` returns exactly `960`.
- [ ] All time conversion utilities round-trip within ±1 tick for PPQN `960`, BPM `1`–`999`, and denominators `1`, `2`, `4`, `8`, `16`.
- [ ] `@singularity/shared` imports without type errors from `packages/backend`, `packages/ui`, `packages/cli`, and `packages/mcp`.
- [ ] `HealthResponseSchema` validates `{ status: 'ok', protocolVersion: '1.0.0' }` and rejects any other shape.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture — defines the package layout, transport choices (HTTP/WebSocket and TCP/socket), and the role of `packages/shared`.

## Blocks

- Spec 18: Monorepo and Build System — consumes `@singularity/shared` for package-level type checking and build wiring.
- Spec 20: JUCE Audio Engine Foundation — consumes the engine frame layout and payload schema.
- Spec 23: Backend API — consumes `Message`, `Reply`, and `Event` envelopes, error envelopes, and project model schemas.
- Spec 35: AI Agent System — consumes the generic tool-call envelope shape derived from `Message`/`Reply`.
- Project Format & Persistence spec — consumes the `Project` JSON schema and asset reference schema.

## Notes / open questions

### Decisions made in this spec that are not yet in `docs/decisions.md`

1. **Identifier format**: `EntityId` is restricted to 1–64 URL-safe characters (`A–Z`, `a–z`, `0–9`, `_`, `-`). UUIDs and nanoids both satisfy this regex.
2. **PPQN**: fixed at `960` pulses per quarter note for all internal tick representations.
3. **Channel volume units**: channel-rack volume is stored as normalized linear 0–1; mixer insert volume is stored in dB. This matches FL Studio’s split between channel faders and mixer faders.
4. **Project JSON strictness**: `ProjectSchema` uses `.strict()` to reject unknown keys; message envelopes use `.passthrough()` to allow forward-compatible metadata.
5. **Engine frame layout**: four-byte big-endian payload length, UTF-8 JSON payload; no magic bytes.
6. **WebSocket subprotocol**: `singularity.v1`.
7. **Scale limits**: 256 channels maximum, 10 plugin slots per mixer insert, mixer send target count unbounded but validated by backend for cycles.

No open questions remain; all listed decisions are required for v1.0 implementation.
