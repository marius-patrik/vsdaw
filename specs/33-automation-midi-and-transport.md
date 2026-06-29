# Spec 33: Automation, MIDI, and Transport

## Objective

Define the end-to-end behavior, data model, API, and engine integration for parameter automation, MIDI I/O and control, and transport/playback in Singularity v1.0.

## Motivation

A professional DAW requires sample-accurate automation of any automatable parameter, tight MIDI input/output and remote control, and a rock-solid transport that ties arrangement, pattern, recording, and video sync together. These three subsystems are deeply coupled: MIDI controllers record automation, automation drives parameters during playback, and the transport determines when both are evaluated and rendered.

## Scope

### In scope

- **Automation**
  - Automation clips on Playlist lanes with breakpoint editing.
  - Per-parameter event automation inside patterns.
  - Breakpoint curve shapes: linear, smooth, hold, sine, triangle, square, saw.
  - Freehand drawing of automation curves.
  - Link to controller / MIDI learn for any automatable parameter.
  - LFO generator for automation clips and pattern lanes.
  - Tempo automation and time-signature changes.
  - Automation value interpolation with sample-accurate timing.
- **MIDI**
  - MIDI input/output device enumeration, selection, and persistence.
  - Typing keyboard to piano toggle.
  - MIDI learn for parameters and transport controls.
  - Multi-link to multiple controllers for the same target.
  - MIDI file import and export.
  - Score logger: buffer last N minutes of MIDI input and dump to pattern.
  - Remote control surface scripting (Lua-based, generic event mapping).
- **Transport**
  - Play, stop, pause, record, loop, song/pattern mode.
  - Metronome with accent on bar, precount, and customizable click sound.
  - BPM and time-signature display/controls.
  - Start-on-input recording, blend recorded notes, step-edit recording.
  - Punch-in / punch-out recording.
  - Playhead scrub via ruler.
  - Video playback sync to audio transport.

### Out of scope

- Proprietary FL Studio MIDI scripts (replaced by generic Lua scripting; covered by this spec).
- Audio recording internals (microphone input routing, take management) — covered by Spec 32: Audio Recording and Editing.
- Plugin parameter discovery and plugin state serialization — covered by Spec 21: Plugin Hosting and Scanning.
- Detailed Playlist/Arranger UI rendering — covered by the pending Playlist/Arranger spec.
- Detailed Piano Roll UI rendering — covered by the pending Piano Roll spec.

## Related decisions

All entries in `docs/decisions.md` from 2026-06-25, especially:

- JUCE C++ native engine as Tauri sidecar.
- Single realtime audio callback with lock-free control queues.
- FL Studio-style Channel Rack + Patterns + Playlist model.
- Time representation: ticks (PPQN), seconds, and bars/beats/ticks with sample-accurate offsets.
- Full MIDI support: input/output device selection, typing keyboard, MIDI learn, remote control, import/export.
- Transport and playback parity: play/stop/pause/record/loop, metronome, tempo automation, video sync.
- No MVPs/stubs/placeholders; acceptance criteria must be binary and verifiable.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI Layer                                    │
│  Transport bar │ Metronome settings │ MIDI device panel │ Automation     │
│  editors (Playlist clips, Piano Roll CC lanes, per-parameter event lanes)│
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ WebSocket / HTTP
┌───────────────────────────▼─────────────────────────────────────────────┐
│                           Backend (Bun)                                  │
│  Project model (patterns, clips, bindings, transport)                   │
│  Engine bridge: command serialization over local TCP/socket              │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ local TCP/socket
┌───────────────────────────▼─────────────────────────────────────────────┐
│                         JUCE Engine (C++)                                │
│  Transport clock │ MIDI input thread │ Automation engine │ Parameter    │
│  routing │ Audio callback │ Video sync                                │
└─────────────────────────────────────────────────────────────────────────┘
```

The engine owns the ground truth for transport position, MIDI timing, and automation value evaluation during the realtime audio callback. The backend owns the project model and persists automation clips, pattern events, MIDI bindings, and transport settings to `project.json` inside the `.singularity` bundle.

### Data model

All schemas live in `packages/shared`. Runtime values are validated with Zod.

#### Time representation

```ts
// packages/shared/src/time.ts
export const TimePointSchema = z.object({
  ticks: z.number().int().min(0),            // 1 tick = 1 PPQN; canonical value
  samples: z.number().int().min(0).optional(), // sample-accurate offset within tick
});
export type TimePoint = z.infer<typeof TimePointSchema>;

export const MusicalTimeSchema = z.object({
  bar: z.number().int().min(1),
  beat: z.number().int().min(1),
  tick: z.number().int().min(0),
});
export type MusicalTime = z.infer<typeof MusicalTimeSchema>;

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().min(1),
  denominator: z.number().int().min(1),
  startTime: TimePointSchema,
});
export type TimeSignature = z.infer<typeof TimeSignatureSchema>;
```

#### Parameter addressing

Every automatable or MIDI-learnable target is addressed uniformly.

```ts
// packages/shared/src/parameters.ts
export const ParameterDomainSchema = z.enum([
  'channel',
  'mixer',
  'plugin',
  'transport',
  'global',
]);
export type ParameterDomain = z.infer<typeof ParameterDomainSchema>;

export const ParameterAddressSchema = z.object({
  domain: ParameterDomainSchema,
  scopeId: z.string().min(1),   // channelId, insertId, pluginInstanceId, or '_' for transport/global
  parameterId: z.string().min(1), // unique within the scope; plugin params use vendor-stable id
});
export type ParameterAddress = z.infer<typeof ParameterAddressSchema>;

export const ParameterMetaSchema = z.object({
  address: ParameterAddressSchema,
  name: z.string(),
  minValue: z.number(),
  maxValue: z.number(),
  defaultValue: z.number(),
  stepSize: z.number().optional(),
  unit: z.string().optional(),
  isAutomatable: z.boolean(),
  isDiscrete: z.boolean().optional(),
});
export type ParameterMeta = z.infer<typeof ParameterMetaSchema>;
```

Parameter discovery for plugins is provided by the engine and exposed through the backend; this spec consumes the resulting `ParameterMeta[]`.

#### Automation clips

```ts
// packages/shared/src/automation.ts
export const CurveShapeSchema = z.enum([
  'linear',
  'smooth',
  'hold',
  'sine',
  'triangle',
  'square',
  'saw',
]);
export type CurveShape = z.infer<typeof CurveShapeSchema>;

export const BreakpointSchema = z.object({
  id: z.string().uuid(),
  time: TimePointSchema,
  value: z.number(),                // normalized 0..1 against ParameterMeta range
  curve: CurveShapeSchema,
  tension: z.number().min(0).max(1).default(0.5), // for smooth/stepped curves
});
export type Breakpoint = z.infer<typeof BreakpointSchema>;

export const AutomationClipSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  target: ParameterAddressSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), // hex RGB
  startTime: TimePointSchema,
  duration: z.number().int().min(1), // ticks
  breakpoints: z.array(BreakpointSchema),
});
export type AutomationClip = z.infer<typeof AutomationClipSchema>;
```

#### Pattern event automation

```ts
// packages/shared/src/automation.ts
export const PatternAutomationEventSchema = z.object({
  id: z.string().uuid(),
  time: TimePointSchema, // relative to pattern start
  value: z.number(),     // normalized 0..1
});
export type PatternAutomationEvent = z.infer<typeof PatternAutomationEventSchema>;

export const PatternAutomationLaneSchema = z.object({
  id: z.string().uuid(),
  target: ParameterAddressSchema,
  events: z.array(PatternAutomationEventSchema),
});
export type PatternAutomationLane = z.infer<typeof PatternAutomationLaneSchema>;
```

Pattern automation lanes are stored inside the `Pattern` object; the engine merges pattern lanes with Playlist automation clips at playback time.

#### LFO generator

```ts
// packages/shared/src/automation.ts
export const LfoWaveformSchema = z.enum(['sine', 'triangle', 'square', 'saw', 'random']);
export type LfoWaveform = z.infer<typeof LfoWaveformSchema>;

export const LfoSettingsSchema = z.object({
  waveform: LfoWaveformSchema,
  frequencyBars: z.number().positive(), // cycles per bar
  phase: z.number().min(0).max(1).default(0),
  amplitude: z.number().min(0).max(1).default(1),
  center: z.number().min(0).max(1).default(0.5),
});
export type LfoSettings = z.infer<typeof LfoSettingsSchema>;
```

Generating an LFO writes concrete breakpoints into an automation clip or lane; the LFO settings themselves are not continuously re-evaluated unless the user regenerates.

#### Tempo and time signature

```ts
// packages/shared/src/transport.ts
export const TempoChangeSchema = z.object({
  id: z.string().uuid(),
  time: TimePointSchema,
  bpm: z.number().min(1).max(999),
});
export type TempoChange = z.infer<typeof TempoChangeSchema>;

export const TransportSettingsSchema = z.object({
  initialBpm: z.number().min(1).max(999).default(140),
  tempoChanges: z.array(TempoChangeSchema).default([]),
  timeSignatures: z.array(TimeSignatureSchema).default([{
    numerator: 4,
    denominator: 4,
    startTime: { ticks: 0, samples: 0 },
  }]),
  loopStart: TimePointSchema.default({ ticks: 0, samples: 0 }),
  loopEnd: TimePointSchema.default({ ticks: 3840, samples: 0 }), // 1 bar at 4/4, 960 PPQN
});
export type TransportSettings = z.infer<typeof TransportSettingsSchema>;
```

#### MIDI devices and bindings

```ts
// packages/shared/src/midi.ts
export const MidiDeviceSchema = z.object({
  id: z.string().uuid(),          // stable id generated by backend from OS id + name
  osId: z.string(),               // OS/Web MIDI identifier
  name: z.string(),
  manufacturer: z.string(),
  type: z.enum(['input', 'output']),
  isConnected: z.boolean(),
  isEnabled: z.boolean(),
});
export type MidiDevice = z.infer<typeof MidiDeviceSchema>;

export const MidiMessageTypeSchema = z.enum([
  'note-on',
  'note-off',
  'poly-pressure',
  'control-change',
  'program-change',
  'channel-pressure',
  'pitch-bend',
]);
export type MidiMessageType = z.infer<typeof MidiMessageTypeSchema>;

export const MidiBindingSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('control-change'), channel: z.number().int().min(1).max(16), number: z.number().int().min(0).max(127) }),
  z.object({ type: z.literal('note-on'), channel: z.number().int().min(1).max(16), note: z.number().int().min(0).max(127) }),
  z.object({ type: z.literal('pitch-bend'), channel: z.number().int().min(1).max(16) }),
  z.object({ type: z.literal('channel-pressure'), channel: z.number().int().min(1).max(16) }),
]);
export type MidiBindingSource = z.infer<typeof MidiBindingSourceSchema>;

export const MidiBindingModeSchema = z.enum(['absolute', 'relative-1', 'relative-2', 'toggle']);
export type MidiBindingMode = z.infer<typeof MidiBindingModeSchema>;

export const MidiBindingSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  target: ParameterAddressSchema,
  source: MidiBindingSourceSchema,
  inputDeviceId: z.string().uuid(),
  mode: MidiBindingModeSchema.default('absolute'),
  range: z.object({ min: z.number().default(0), max: z.number().default(1) }),
  isInverted: z.boolean().default(false),
  takeoverMode: z.enum(['pickup', 'value-scaling', 'none']).default('pickup'),
});
export type MidiBinding = z.infer<typeof MidiBindingSchema>;

export const TransportBindingTargetSchema = z.enum([
  'play',
  'stop',
  'record',
  'toggle-loop',
  'toggle-song-pattern-mode',
  'tap-tempo',
  'rewind',
  'forward',
]);
export type TransportBindingTarget = z.infer<typeof TransportBindingTargetSchema>;

export const MidiTransportBindingSchema = z.object({
  id: z.string().uuid(),
  source: MidiBindingSourceSchema,
  inputDeviceId: z.string().uuid(),
  action: TransportBindingTargetSchema,
});
export type MidiTransportBinding = z.infer<typeof MidiTransportBindingSchema>;
```

#### Transport state

```ts
// packages/shared/src/transport.ts
export const TransportStateSchema = z.enum(['stopped', 'playing', 'recording', 'paused']);
export type TransportState = z.infer<typeof TransportStateSchema>;

export const TransportModeSchema = z.enum(['song', 'pattern']);
export type TransportMode = z.infer<typeof TransportModeSchema>;

export const MetronomeSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  precountBars: z.number().int().min(0).max(8).default(1),
  accentOnBar: z.boolean().default(true),
  clickSound: z.enum(['default', 'custom']).default('default'),
  customClickPath: z.string().optional(), // path inside .singularity assets/
  barGain: z.number().min(0).max(2).default(1),
  beatGain: z.number().min(0).max(2).default(0.7),
});
export type MetronomeSettings = z.infer<typeof MetronomeSettingsSchema>;

export const RecordingOptionsSchema = z.object({
  punchIn: TimePointSchema.optional(),
  punchOut: TimePointSchema.optional(),
  startOnInput: z.boolean().default(false),
  blendRecordedNotes: z.boolean().default(true),
  stepEdit: z.boolean().default(false),
});
export type RecordingOptions = z.infer<typeof RecordingOptionsSchema>;

export const TransportSnapshotSchema = z.object({
  state: TransportStateSchema,
  mode: TransportModeSchema,
  position: TimePointSchema,
  bpm: z.number(),
  timeSignature: TimeSignatureSchema,
  isLooping: z.boolean(),
  settings: TransportSettingsSchema,
  metronome: MetronomeSettingsSchema,
  recording: RecordingOptionsSchema,
});
export type TransportSnapshot = z.infer<typeof TransportSnapshotSchema>;
```

#### Score logger

```ts
// packages/shared/src/midi.ts
export const ScoreLoggerSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  bufferMinutes: z.number().int().min(1).max(60).default(5),
});
export type ScoreLoggerSettings = z.infer<typeof ScoreLoggerSettingsSchema>;

export const LoggedMidiEventSchema = z.object({
  id: z.string().uuid(),
  receivedAt: z.string().datetime(), // ISO-8601
  deviceId: z.string().uuid(),
  message: z.object({
    type: MidiMessageTypeSchema,
    channel: z.number().int().min(1).max(16),
    data1: z.number().int().min(0).max(127),
    data2: z.number().int().min(0).max(127).optional(),
  }),
});
export type LoggedMidiEvent = z.infer<typeof LoggedMidiEventSchema>;
```

#### Remote control surface script

```ts
// packages/shared/src/midi.ts
export const MidiScriptSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  inputDeviceId: z.string().uuid(),
  luaSource: z.string(), // script body executed in a sandboxed Lua 5.4 VM
  isEnabled: z.boolean().default(true),
});
export type MidiScript = z.infer<typeof MidiScriptSchema>;
```

Scripts receive MIDI events and call a restricted `singularity` API to set parameters, trigger transport actions, and post UI messages.

### API / interface

All HTTP endpoints return JSON and use shared Zod schemas for request/response validation.

#### Backend HTTP endpoints

**Transport**

```ts
GET    /api/transport/state          -> TransportSnapshotSchema
POST   /api/transport/play           -> TransportSnapshotSchema
POST   /api/transport/stop           -> TransportSnapshotSchema
POST   /api/transport/pause          -> TransportSnapshotSchema
POST   /api/transport/record         -> TransportSnapshotSchema
POST   /api/transport/seek           body: { position: TimePoint } -> TransportSnapshotSchema
POST   /api/transport/mode           body: { mode: TransportMode } -> TransportSnapshotSchema
POST   /api/transport/loop           body: { enabled: boolean } -> TransportSnapshotSchema
PATCH  /api/transport/settings       body: Partial<TransportSettings> -> TransportSettings
PATCH  /api/transport/metronome      body: Partial<MetronomeSettings> -> MetronomeSettings
PATCH  /api/transport/recording      body: Partial<RecordingOptions> -> RecordingOptions
```

**Automation**

```ts
GET    /api/automation/clips              -> z.array(AutomationClipSchema)
POST   /api/automation/clips              body: AutomationClipSchema -> AutomationClipSchema
GET    /api/automation/clips/:id          -> AutomationClipSchema
PATCH  /api/automation/clips/:id          body: Partial<AutomationClip> -> AutomationClipSchema
DELETE /api/automation/clips/:id          -> { deleted: true }
POST   /api/automation/clips/:id/breakpoints        body: BreakpointSchema -> AutomationClipSchema
PATCH  /api/automation/clips/:id/breakpoints/:bpId  body: Partial<Breakpoint> -> AutomationClipSchema
DELETE /api/automation/clips/:id/breakpoints/:bpId  -> AutomationClipSchema
POST   /api/automation/clips/:id/lfo                body: { start: TimePoint, duration: number, settings: LfoSettings } -> AutomationClipSchema

GET    /api/patterns/:id/automation         -> z.array(PatternAutomationLaneSchema)
POST   /api/patterns/:id/automation         body: PatternAutomationLaneSchema -> PatternAutomationLaneSchema
PATCH  /api/patterns/:id/automation/:laneId body: Partial<PatternAutomationLane> -> PatternAutomationLaneSchema
DELETE /api/patterns/:id/automation/:laneId -> { deleted: true }
POST   /api/patterns/:id/automation/:laneId/events     body: PatternAutomationEventSchema -> PatternAutomationLaneSchema
PATCH  /api/patterns/:id/automation/:laneId/events/:eId body: Partial<PatternAutomationEvent> -> PatternAutomationLaneSchema
DELETE /api/patterns/:id/automation/:laneId/events/:eId -> PatternAutomationLaneSchema

GET    /api/parameters/automatable          -> z.array(ParameterMetaSchema)
```

**MIDI**

```ts
GET    /api/midi/devices              -> z.array(MidiDeviceSchema)
PATCH  /api/midi/devices/:id          body: { isEnabled: boolean } -> MidiDeviceSchema
POST   /api/midi/refresh-devices      -> z.array(MidiDeviceSchema)

GET    /api/midi/bindings             -> z.array(MidiBindingSchema)
POST   /api/midi/bindings             body: MidiBindingSchema -> MidiBindingSchema
PATCH  /api/midi/bindings/:id         body: Partial<MidiBinding> -> MidiBindingSchema
DELETE /api/midi/bindings/:id         -> { deleted: true }

GET    /api/midi/transport-bindings   -> z.array(MidiTransportBindingSchema)
POST   /api/midi/transport-bindings   body: MidiTransportBindingSchema -> MidiTransportBindingSchema
PATCH  /api/midi/transport-bindings/:id body: Partial<MidiTransportBinding> -> MidiTransportBindingSchema
DELETE /api/midi/transport-bindings/:id -> { deleted: true }

POST   /api/midi/learn/start          body: { target: ParameterAddress, timeoutMs?: number } -> { sessionId: string }
POST   /api/midi/learn/cancel         body: { sessionId: string } -> { cancelled: true }
GET    /api/midi/learn/:sessionId     -> { binding?: MidiBindingSchema, state: 'waiting' | 'received' | 'timeout' }

POST   /api/midi/import               body: { filePath: string, targetPatternId?: string } -> { patternId: string, noteCount: number }
POST   /api/midi/export               body: { patternIds?: string[], range?: { start: TimePoint, end: TimePoint }, filePath: string } -> { filePath: string }

GET    /api/midi/score-logger         -> ScoreLoggerSettingsSchema
PATCH  /api/midi/score-logger         body: Partial<ScoreLoggerSettings> -> ScoreLoggerSettingsSchema
POST   /api/midi/score-logger/dump    body: { patternId: string, durationTicks?: number } -> { noteCount: number }

GET    /api/midi/scripts              -> z.array(MidiScriptSchema)
POST   /api/midi/scripts              body: MidiScriptSchema -> MidiScriptSchema
PATCH  /api/midi/scripts/:id          body: Partial<MidiScript> -> MidiScriptSchema
DELETE /api/midi/scripts/:id          -> { deleted: true }
```

#### WebSocket messages

UI and backend exchange JSON envelopes defined in `packages/shared/src/protocol.ts`.

```ts
// Client -> Server
export type TransportCommand =
  | { type: 'transport.play' }
  | { type: 'transport.stop' }
  | { type: 'transport.pause' }
  | { type: 'transport.record' }
  | { type: 'transport.seek'; payload: { position: TimePoint } }
  | { type: 'transport.setMode'; payload: { mode: TransportMode } }
  | { type: 'transport.setLoop'; payload: { enabled: boolean } };

export type AutomationCommand =
  | { type: 'automation.updateClip'; payload: AutomationClip }
  | { type: 'automation.updatePatternLane'; payload: { patternId: string; lane: PatternAutomationLane } }
  | { type: 'automation.requestLfo'; payload: { clipId: string; start: TimePoint; duration: number; settings: LfoSettings } };

export type MidiCommand =
  | { type: 'midi.typingKeyboardNoteOn'; payload: { note: number; velocity: number } }
  | { type: 'midi.typingKeyboardNoteOff'; payload: { note: number } }
  | { type: 'midi.startLearn'; payload: { target: ParameterAddress; timeoutMs?: number } }
  | { type: 'midi.cancelLearn'; payload: { sessionId: string } };

// Server -> Client
export type TransportEvent =
  | { type: 'transport.stateChanged'; payload: TransportSnapshot }
  | { type: 'transport.positionChanged'; payload: { position: TimePoint; barBeatTick: MusicalTime } }
  | { type: 'transport.bpmChanged'; payload: { bpm: number; time: TimePoint } }
  | { type: 'transport.timeSignatureChanged'; payload: TimeSignature };

export type AutomationEvent =
  | { type: 'automation.clipCreated'; payload: AutomationClip }
  | { type: 'automation.clipUpdated'; payload: AutomationClip }
  | { type: 'automation.clipDeleted'; payload: { id: string } }
  | { type: 'automation.valueChanged'; payload: { target: ParameterAddress; value: number; time: TimePoint } };

export type MidiEvent =
  | { type: 'midi.devicesChanged'; payload: { devices: MidiDevice[] } }
  | { type: 'midi.noteOn'; payload: { deviceId: string; channel: number; note: number; velocity: number } }
  | { type: 'midi.noteOff'; payload: { deviceId: string; channel: number; note: number; velocity: number } }
  | { type: 'midi.controlChanged'; payload: { deviceId: string; channel: number; number: number; value: number } }
  | { type: 'midi.learnReceived'; payload: { sessionId: string; binding: MidiBinding } }
  | { type: 'midi.scriptOutput'; payload: { scriptId: string; level: 'log' | 'warn' | 'error'; message: string } };
```

#### Engine command protocol

Commands sent over the local TCP/socket from backend to JUCE engine.

```ts
// packages/shared/src/engine-protocol.ts
export type EngineTransportCommand =
  | { type: 'transport.play' }
  | { type: 'transport.stop' }
  | { type: 'transport.pause' }
  | { type: 'transport.record'; payload: { enable: boolean; options: RecordingOptions } }
  | { type: 'transport.seek'; payload: { position: TimePoint } }
  | { type: 'transport.setMode'; payload: { mode: TransportMode } }
  | { type: 'transport.setLoop'; payload: { enabled: boolean; start: TimePoint; end: TimePoint } }
  | { type: 'transport.setBpm'; payload: { bpm: number } }
  | { type: 'transport.setTimeSignatures'; payload: TimeSignature[] }
  | { type: 'transport.setMetronome'; payload: MetronomeSettings }
  | { type: 'transport.setTempoAutomation'; payload: TempoChange[] };

export type EngineAutomationCommand =
  | { type: 'automation.setClips'; payload: AutomationClip[] }
  | { type: 'automation.setPatternLanes'; payload: { patternId: string; lanes: PatternAutomationLane[] }[] }
  | { type: 'automation.setTargets'; payload: ParameterMeta[] }
  | { type: 'automation.setParameter'; payload: { target: ParameterAddress; value: number } };

export type EngineMidiCommand =
  | { type: 'midi.setDevices'; payload: { inputs: string[]; outputs: string[] } }
  | { type: 'midi.setBindings'; payload: MidiBinding[] }
  | { type: 'midi.setTransportBindings'; payload: MidiTransportBinding[] }
  | { type: 'midi.sendOutput'; payload: { deviceId: string; bytes: number[] } }
  | { type: 'midi.setScoreLogger'; payload: ScoreLoggerSettings }
  | { type: 'midi.setScripts'; payload: MidiScript[] };

export type EngineEvent =
  | { evt: 'transport.state'; payload: TransportSnapshot }
  | { evt: 'transport.position'; payload: { position: TimePoint; barBeatTick: MusicalTime } }
  | { evt: 'midi.noteOn'; payload: { deviceId: string; channel: number; note: number; velocity: number } }
  | { evt: 'midi.noteOff'; payload: { deviceId: string; channel: number; note: number; velocity: number } }
  | { evt: 'midi.control'; payload: { deviceId: string; channel: number; number: number; value: number } }
  | { evt: 'audio.levels'; payload: { insertId: string; peak: number; rms: number }[] };
```

### UI/UX

#### Transport bar

- Persistent toolbar at the top of the app containing:
  - Play (Space), Stop (Space while playing), Pause (Cmd/Ctrl+Space), Record (R).
  - Song/Pattern mode toggle.
  - Loop toggle.
  - BPM input with tempo tap (T).
  - Time-signature input.
  - Position display in bars/beats/ticks and minutes:seconds:ms.
  - Metronome toggle and settings popover.
  - Punch-in/punch-out markers editable from the ruler.

#### Automation editors

- **Playlist**: automation clips rendered as breakpoint lanes; drag breakpoints, double-click to add, right-click to delete, drag curve handles to change shape.
- **Pattern event editor**: per-parameter lanes inside the Piano Roll or a dedicated event list; supports pencil and line tools.
- **Parameter picker**: right-click any automatable parameter (channel settings, mixer insert, plugin editor) → "Create automation clip" or "Link to controller".
- **LFO tool**: modal with waveform, frequency, phase, amplitude, center; applies to selection or full clip/lane.

#### MIDI panels

- **Device panel**: list inputs/outputs with enable toggles, refresh button, indicator lights for active traffic.
- **Learn panel**: arm learn, click a parameter, move a hardware control; confirmation dialog shows detected source and mapping.
- **Typing keyboard piano**: toolbar toggle (Ctrl+T); maps computer keyboard rows to piano notes; velocity defaults to 100, lower row reduces velocity to 64.
- **Score logger**: floating window showing buffered duration; "Dump to pattern" button creates a pattern with logged notes.
- **Script editor**: Monaco tab with Lua syntax highlighting, run/stop toggle, console output pane.

### Algorithms / behavior

#### Automation value interpolation

The engine evaluates automation values at sample time `s` as follows:

1. Convert `s` to musical time `t` using the current tempo map (including tempo automation).
2. Collect all breakpoints whose `time <= t` from active Playlist automation clips and pattern lanes for the target.
3. Sort by time; identify the bracketing breakpoints `a` (left) and `b` (right).
4. Compute normalized position `p = (t - a.time) / (b.time - a.time)` clamped to `[0,1]`.
5. Apply curve shape:
   - `linear`: `v = lerp(a.value, b.value, p)`.
   - `smooth`: `v = lerp(a.value, b.value, smoothstep(p) * tension + p * (1 - tension))`.
   - `hold`: `v = a.value`.
   - LFO shapes are pre-baked into breakpoints by the LFO generator; interpolation falls back to `linear` between generated points.
6. Convert normalized `v` to parameter units using `ParameterMeta.minValue/maxValue` and send to the target parameter at the next audio callback boundary.

If no breakpoint exists before `t`, the value defaults to `ParameterMeta.defaultValue`.

#### Tempo automation

Tempo changes are stored as an ordered list. The engine builds a piecewise-linear tempo map:

- Between two tempo changes at `t0` and `t1` with BPM `b0` and `b1`, the instantaneous BPM at tick `x` is `b0 + (b1 - b0) * ((x - t0) / (t1 - t0))`.
- Tick-to-sample conversion uses cumulative integration of the tempo map, accounting for sample rate.
- Time-signature changes affect bar/beat display and metronome accent but not tick-to-sample conversion.

#### MIDI learn

1. UI calls `POST /api/midi/learn/start` with a `ParameterAddress`.
2. Backend enters learn mode for that session and instructs the engine to forward the next qualifying control message to the backend.
3. Engine receives a MIDI message matching a control-change, pitch-bend, or channel-pressure source.
4. Backend creates a `MidiBinding` and emits `midi.learnReceived`.
5. UI confirms; binding is persisted in `project.json`.

A qualifying message excludes notes when learning a parameter unless the UI explicitly arms note-mode. Transport bindings may use notes.

#### Multi-link controllers

Multiple `MidiBinding` objects may reference the same `target`. On incoming MIDI, the engine evaluates all matching bindings in binding-order and applies the last resolved value. UI indicates overlapping bindings with a badge count on the parameter.

#### Start-on-input recording

When `startOnInput` is enabled and transport is stopped, the engine monitors enabled MIDI inputs and audio record-armed inserts. On the first qualifying event (MIDI note-on or audio level > -60 dBFS for 50 ms), the engine:

1. Starts precount if `metronome.precountBars > 0`.
2. Switches to `recording` state at the downbeat after precount.
3. Rewinds playback position to the nearest bar before the input if punch-in is not set.

#### Score logger

The backend maintains a circular buffer of `LoggedMidiEvent` sized for `bufferMinutes`. On `POST /api/midi/score-logger/dump`, the backend converts buffered note-on/note-off pairs into pattern notes quantized to the current snap setting, inserts them into the target pattern, and returns the note count.

#### Remote control surface scripts

Scripts run in a sandboxed Lua 5.4 VM inside the backend. The `singularity` runtime exposes:

```lua
singularity.setParameter(domain, scopeId, paramId, normalizedValue)
singularity.getParameter(domain, scopeId, paramId) -> number
singularity.transportPlay()
singularity.transportStop()
singularity.transportRecord()
singularity.showMessage(message)
```

Scripts receive events via the global `onMidiEvent(channel, type, data1, data2)` callback. The backend schedules parameter writes to the engine; scripts do not run on the audio thread.

## Implementation plan

1. Add shared Zod schemas (`packages/shared/src/automation.ts`, `midi.ts`, `transport.ts`, `time.ts`, `parameters.ts`, `engine-protocol.ts`).
2. Implement backend project-model updates for automation clips, pattern lanes, MIDI bindings, and transport settings.
3. Implement backend HTTP endpoints and WebSocket message handlers listed above.
4. Extend the JUCE engine:
   - Transport state machine with loop, punch, precount, song/pattern mode.
   - Tempo-map and time-signature evaluation.
   - Automation engine evaluating clips + pattern lanes.
   - MIDI input/output device management, learn, binding evaluation, score logger.
   - Video sync hook reporting current frame to backend.
5. Wire backend ↔ engine over local TCP/socket command protocol.
6. Build UI panels: transport bar, automation editors, MIDI device/learn/script panels, score logger, typing-keyboard overlay.
7. Add project persistence: serialize/deserialize all model objects to `project.json`.
8. Write unit, integration, and E2E tests against acceptance criteria.

## Testing strategy

- **Unit tests**
  - Tick/sample conversion with tempo automation.
  - Automation interpolation for every curve shape.
  - MIDI binding value scaling (absolute, relative modes, inversion, pickup).
  - Score logger buffer eviction and note-pair conversion.
  - Lua script sandbox API validation.
- **Integration tests**
  - Backend endpoints: CRUD for automation clips, pattern lanes, MIDI bindings, transport state.
  - WebSocket message round-trips.
  - Engine command serialization/deserialization.
  - MIDI learn session lifecycle.
  - Tempo automation export to audio (offline render).
- **E2E tests**
  - Play a project with automation and verify parameter changes in the engine via backend state.
  - Connect a virtual MIDI device, learn a control, move it, and verify the target parameter updates.
  - Record with start-on-input and verify a pattern contains the performed notes.
  - Scrub playhead and verify video frame matches audio position.

## Acceptance criteria

### Automation

- [ ] `GET /api/parameters/automatable` returns every automatable parameter from stock devices and loaded plugins with correct `minValue`, `maxValue`, `defaultValue`, and `isAutomatable`.
- [ ] Creating an automation clip via `POST /api/automation/clips` persists a clip with at least two breakpoints and emits `automation.clipCreated` to all connected WebSocket clients.
- [ ] Moving a breakpoint via `PATCH /api/automation/clips/:id/breakpoints/:bpId` updates the engine's interpolation within one audio callback.
- [ ] Each supported curve shape (`linear`, `smooth`, `hold`, `sine`, `triangle`, `square`, `saw`) produces the mathematically expected value at the midpoint between two breakpoints of values 0 and 1.
- [ ] Freehand-drawn automation is converted into breakpoints with one point per snap division; no freehand path remains as a non-discrete primitive in storage.
- [ ] LFO generation writes concrete breakpoints into the target clip or lane using the selected waveform, frequency, phase, amplitude, and center.
- [ ] A pattern lane created via `POST /api/patterns/:id/automation` modulates its target parameter whenever that pattern is played in song or pattern mode.
- [ ] Tempo automation changes the playback BPM smoothly between `TempoChange` points and the exported audio duration matches the tempo map.
- [ ] Time-signature changes update the bar/beat display and metronome accent at the exact `startTime` tick.

### MIDI

- [ ] `GET /api/midi/devices` lists all currently connected input and output MIDI devices with stable IDs.
- [ ] Enabling or disabling a device via `PATCH /api/midi/devices/:id` is reflected in the engine within 100 ms and emits `midi.devicesChanged`.
- [ ] Typing-keyboard piano toggle (Ctrl+T) maps the top two rows of the keyboard to two octaves and emits note-on/note-off messages identical to hardware MIDI input.
- [ ] MIDI learn session initiated via `POST /api/midi/learn/start` creates a `MidiBinding` after one qualifying control message and emits `midi.learnReceived`.
- [ ] A bound control-change message updates its target parameter in real time; relative-mode bindings interpret value deltas correctly.
- [ ] Multiple bindings targeting the same parameter all apply, and the last binding in order wins.
- [ ] `POST /api/midi/import` creates a pattern containing all notes from a Standard MIDI File type 1.
- [ ] `POST /api/midi/export` writes a Standard MIDI File containing the selected patterns or time range.
- [ ] Score logger retains the last 5 minutes of MIDI input by default and `POST /api/midi/score-logger/dump` inserts quantized notes into the chosen pattern.
- [ ] A Lua remote-control script can call `singularity.setParameter` and `singularity.transportPlay` and receives `onMidiEvent` callbacks for its selected input device.

### Transport

- [ ] `POST /api/transport/play` transitions the engine from `stopped`/`paused` to `playing` and emits `transport.stateChanged`.
- [ ] `POST /api/transport/record` arms recording; actual recording begins at the next transport start and writes notes/audio into the armed targets.
- [ ] `POST /api/transport/seek` sets the playhead to the requested `TimePoint` and emits `transport.positionChanged`.
- [ ] Song mode plays the full Playlist arrangement; pattern mode loops the currently selected pattern.
- [ ] Loop mode loops playback between `loopStart` and `loopEnd` exactly, including when tempo automation is active.
- [ ] Metronome precount plays the configured number of bars before recording starts and accents the first beat of each bar when `accentOnBar` is true.
- [ ] Custom click sound loads from `assets/` inside the `.singularity` bundle and replaces the default click.
- [ ] Start-on-input begins precount within 100 ms of a qualifying MIDI note-on or audio input and transitions to recording at the downbeat.
- [ ] Punch-in / punch-out restricts recording to the configured time range; material outside the range is not overwritten.
- [ ] Playhead scrub via the ruler updates the engine position and video frame in real time (no audible glitches when scrubbing stops).
- [ ] Video playback frame index stays synchronized with audio transport within ±1 frame at 30 fps under normal playback.

## Dependencies

- Spec 17: Standalone App Architecture — defines the UI/backend/engine layers and transport channels.
- Spec 19: Shared Protocol and Schemas — provides the base message envelope and validation conventions.
- Spec 20: JUCE Audio Engine — engine-side audio callback, plugin hosting, and parameter discovery.
- Spec 23: Backend API — base Fastify server, WebSocket setup, project model service layer.
- Spec 26: Channel Rack and Step Sequencer — parameter targets for channel-level devices.
- Spec 27: Piano Roll — CC lane UI and pattern automation editing surface.
- Spec 28: Playlist and Arrangement — automation clip lanes and playhead scrub UI.
- Spec 29: Mixer and Routing Graph — insert-level parameter targets and sidechain parameters.

## Blocks

- Spec 34: Export, Rendering, and AI Mastering — requires tempo automation, transport loop/range, and automation-driven parameter values during offline render.
- Spec 35: AI Agent System — agent tools must drive transport, MIDI learn, automation creation, and score logger dump.
- Spec 21: Plugin Hosting and Scanner — parameter discovery and plugin-state serialization must align with `ParameterAddress` and `ParameterMeta`.

## Notes / open questions

- This spec assumes a default PPQN of 960 ticks per quarter note, consistent with FL Studio. The value is a shared constant in `packages/shared/src/constants.ts`.
- Lua 5.4 was chosen for remote control scripting because it is lightweight, sandboxable, and widely used in music software. If a security review rejects native Lua, a JavaScript VM sandbox is the fallback.
- MIDI clock and MIDI timecode (MTC) are not in v1.0; only note, control-change, and program-change style messaging is required.
- The engine parameter routing order is: pattern lane automation → Playlist clip automation → MIDI learned value → default. Conflicts are resolved by last-write-wins at the audio callback boundary.
