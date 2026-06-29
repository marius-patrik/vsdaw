# Spec 31: Stock Instruments and Effects

## Objective

Ship the complete set of built-in Singularity instruments and effects required for FL Studio parity, expose them through the plugin registry and backend API, and provide a visual modular patcher for chaining them.

## Motivation

A professional DAW must work out of the box without requiring third-party plugins. Singularity v1.0 needs a sampler, subtractive synth, drum machine, SoundFont player, and a full suite of mixing effects so users can compose, produce, and mix a project entirely with stock devices.

## Scope

### In scope

- Four stock instruments:
  - **Sampler** channel: envelope, filter, loop points, reverse, time stretch, pitch shift.
  - **Subtractive synthesizer**: three oscillators, filter + filter envelope, amplitude envelope, glide/unison.
  - **Drum machine / drum sampler**: pads, per-pad sample + envelope + filter, step sequencer, choke groups, swing.
  - **SoundFont player**: SF2/SF3 bank/preset selection with 64-voice polyphony.
- Nine stock effects:
  - Reverb, delay, EQ, compressor, chorus, phaser, limiter, filter, distortion.
- Built-in plugin registry that exposes stock devices to the engine, backend, browser, and mixer with the same lifecycle as third-party plugins.
- Stock device parameter model, automation support, and preset save/load.
- Visual modular patcher / rack for chaining stock instruments and effects with audio, MIDI, and sidechain cables.
- Embedded plugin editor UI for every stock device.

### Out of scope

- Proprietary FL Studio plugins (Sytrus, Harmor, FLEX full, Gross Beat) — users load them as third-party VSTs if owned (parity-spec §7, decisions.md).
- Full mixer routing graph and sends/buses — covered by the Routing & Mixer specs; this spec defines only the patcher surface that consumes those connections.
- Third-party plugin scanning and hosting — covered by Spec 13 / the plugin-hosting spec.

## Related decisions

- 2026-06-25 — Stock plugins scope: ship full open-source equivalents (sampler, subtractive synth, drum machine, SoundFont player, 8+ effects).
- 2026-06-25 — Audio engine backend: JUCE C++ native engine as a Tauri sidecar.
- 2026-06-25 — Plugin hosting model: in-process hosting inside the JUCE engine.
- 2026-06-25 — Audio thread model: single realtime audio callback with lock-free queues.
- 2026-06-25 — Project model: Channel Rack + Patterns + Playlist.
- 2026-06-25 — Project file format: `.singularity` ZIP bundle.
- 2026-06-25 — Quality bar: no stubs/MVPs/placeholders; acceptance criteria must be binary and verifiable.

## Detailed design

### Subsystem overview

Stock devices live inside the JUCE engine as `AudioProcessor` subclasses. A `BuiltInPluginRegistry` publishes descriptors so the backend, browser, and mixer treat them identically to scanned VST3/AU/CLAP plugins. The engine exposes stock devices through the same TCP/socket command protocol used for third-party plugins.

The modular patcher is backed by a `juce::AudioProcessorGraph`. Nodes wrap stock plugin instances, mixer inserts, or I/O endpoints. Connections carry audio, MIDI, or sidechain signals. The graph executes inside the single realtime audio callback.

```
┌─────────────────────────────────────┐
│  UI: Browser / Plugin Picker        │
│  UI: Stock Plugin Editor Panels     │
│  UI: Patcher Canvas                 │
└─────────────┬───────────────────────┘
              │ HTTP + WebSocket
┌─────────────▼───────────────────────┐
│  Backend: /api/stock-plugins/*      │
│  Backend: project model persistence │
└─────────────┬───────────────────────┘
              │ local TCP/socket
┌─────────────▼───────────────────────┐
│  Engine: BuiltInPluginRegistry      │
│  Engine: StockAudioProcessor(s)     │
│  Engine: PatcherGraph               │
└─────────────────────────────────────┘
```

### Data model

All schemas live in `packages/shared/src/stock-plugins.ts` and are mirrored in the engine by equivalent C++ structures.

#### Plugin identity

```ts
export const StockPluginKind = z.enum(['instrument', 'effect', 'utility']);
export type StockPluginKind = z.infer<typeof StockPluginKind>;

export const StockPluginId = z.enum([
  'singularity.sampler',
  'singularity.subtractive-synth',
  'singularity.drum-machine',
  'singularity.soundfont-player',
  'singularity.reverb',
  'singularity.delay',
  'singularity.eq',
  'singularity.compressor',
  'singularity.chorus',
  'singularity.phaser',
  'singularity.limiter',
  'singularity.filter',
  'singularity.distortion',
]);
export type StockPluginId = z.infer<typeof StockPluginId>;

export const ParameterType = z.enum([
  'float',
  'int',
  'bool',
  'choice',
  'string',
  'sample',
  'file',
]);

export const ParameterDescriptor = z.object({
  id: z.string(),
  name: z.string(),
  type: ParameterType,
  min: z.number().optional(),
  max: z.number().optional(),
  defaultValue: z.unknown(),
  unit: z.string().optional(),
  choices: z.array(z.string()).optional(),
  automatable: z.boolean().default(true),
  isDiscrete: z.boolean().default(false),
});

export const StockPluginDescriptor = z.object({
  pluginId: StockPluginId,
  kind: StockPluginKind,
  name: z.string(),
  vendor: z.literal('Singularity'),
  version: z.string(),
  parameters: z.array(ParameterDescriptor),
  numInputChannels: z.number().int().min(0),
  numOutputChannels: z.number().int().min(0),
  acceptsMidi: z.boolean(),
  producesMidi: z.boolean(),
  hasEditor: z.literal(true),
});
```

#### Sampler

```ts
export const SamplerLoopMode = z.enum(['one-shot', 'forward', 'ping-pong']);

export const SamplerParameters = z.object({
  samplePath: z.string(),
  rootNote: z.number().int().min(0).max(127).default(60),
  startSample: z.number().int().min(0).default(0),
  endSample: z.number().int().min(0).optional(),
  loopStart: z.number().int().min(0).optional(),
  loopEnd: z.number().int().min(0).optional(),
  loopMode: SamplerLoopMode.default('one-shot'),
  reverse: z.boolean().default(false),
  attackSec: z.number().min(0).max(60).default(0.001),
  decaySec: z.number().min(0).max(60).default(0),
  sustainDb: z.number().min(-96).max(0).default(0),
  releaseSec: z.number().min(0).max(60).default(0.05),
  filterType: z.enum(['off', 'lowpass', 'highpass', 'bandpass', 'notch']).default('off'),
  filterCutoffHz: z.number().min(20).max(20000).default(20000),
  filterResonance: z.number().min(0).max(1).default(0),
  pitchSemitones: z.number().int().min(-24).max(24).default(0),
  pitchCents: z.number().min(-100).max(100).default(0),
  timeStretchRatio: z.number().min(0.25).max(4).default(1),
  maxVoices: z.number().int().min(1).max(256).default(32),
});
```

#### Subtractive synthesizer

```ts
export const OscillatorWaveform = z.enum([
  'sine',
  'saw',
  'square',
  'triangle',
  'noise',
]);

const OscillatorParameters = z.object({
  waveform: OscillatorWaveform.default('saw'),
  volumeDb: z.number().min(-96).max(0).default(-6),
  pitchSemitones: z.number().int().min(-24).max(24).default(0),
  detuneCents: z.number().min(-100).max(100).default(0),
  phaseOffset: z.number().min(0).max(1).default(0),
  pan: z.number().min(-1).max(1).default(0),
});

export const SubtractiveSynthParameters = z.object({
  osc1: OscillatorParameters.default({ waveform: 'saw', volumeDb: -6 }),
  osc2: OscillatorParameters.default({ waveform: 'square', volumeDb: -6 }),
  osc3: OscillatorParameters.default({ waveform: 'sine', volumeDb: -96 }),
  filterType: z.enum(['lowpass', 'highpass', 'bandpass', 'notch']).default('lowpass'),
  filterCutoffHz: z.number().min(20).max(20000).default(800),
  filterResonance: z.number().min(0).max(1).default(0.1),
  filterEnvAmount: z.number().min(-1).max(1).default(0.5),
  filterAttackSec: z.number().min(0).max(60).default(0.01),
  filterDecaySec: z.number().min(0).max(60).default(0.3),
  filterSustainDb: z.number().min(-96).max(0).default(-10),
  filterReleaseSec: z.number().min(0).max(60).default(0.2),
  ampAttackSec: z.number().min(0).max(60).default(0.01),
  ampDecaySec: z.number().min(0).max(60).default(0),
  ampSustainDb: z.number().min(-96).max(0).default(0),
  ampReleaseSec: z.number().min(0).max(60).default(0.1),
  glideSec: z.number().min(0).max(5).default(0),
  unisonVoices: z.number().int().min(1).max(8).default(1),
  unisonDetuneCents: z.number().min(0).max(100).default(10),
  outputGainDb: z.number().min(-96).max(12).default(0),
  maxVoices: z.number().int().min(1).max(256).default(16),
});
```

#### Drum machine

```ts
export const DrumPadParameters = z.object({
  samplePath: z.string().optional(),
  midiNote: z.number().int().min(0).max(127),
  chokeGroup: z.number().int().min(0).max(16).default(0),
  volumeDb: z.number().min(-96).max(12).default(0),
  pan: z.number().min(-1).max(1).default(0),
  pitchSemitones: z.number().int().min(-24).max(24).default(0),
  attackSec: z.number().min(0).max(60).default(0.001),
  holdSec: z.number().min(0).max(60).default(0),
  decaySec: z.number().min(0).max(60).default(0.2),
  sustainDb: z.number().min(-96).max(0).default(-10),
  releaseSec: z.number().min(0).max(60).default(0.05),
  filterType: z.enum(['off', 'lowpass', 'highpass', 'bandpass']).default('off'),
  filterCutoffHz: z.number().min(20).max(20000).default(20000),
  filterResonance: z.number().min(0).max(1).default(0),
  outputInsertId: z.string().optional(),
});

export const DrumMachineParameters = z.object({
  pads: z.array(DrumPadParameters).max(64).default([]),
  swingPercent: z.number().min(0).max(100).default(0),
  stepsPerPattern: z.enum([16, 32, 64]).default(16),
  masterVolumeDb: z.number().min(-96).max(12).default(0),
});
```

#### SoundFont player

```ts
export const SoundFontParameters = z.object({
  soundFontPath: z.string(),
  bank: z.number().int().min(0).default(0),
  preset: z.number().int().min(0).default(0),
  volumeDb: z.number().min(-96).max(12).default(0),
  maxVoices: z.number().int().min(1).max(256).default(64),
});
```

#### Effects

```ts
export const ReverbParameters = z.object({
  roomSize: z.number().min(0).max(1).default(0.5),
  damping: z.number().min(0).max(1).default(0.5),
  width: z.number().min(0).max(1).default(1),
  wetDb: z.number().min(-96).max(12).default(-12),
  dryDb: z.number().min(-96).max(12).default(0),
  preDelayMs: z.number().min(0).max(500).default(0),
});

export const DelayParameters = z.object({
  timeLeftMs: z.number().min(1).max(5000).default(250),
  timeRightMs: z.number().min(1).max(5000).default(250),
  syncToBpm: z.boolean().default(false),
  syncNoteLeft: z.string().default('1/8'),
  syncNoteRight: z.string().default('1/8'),
  feedback: z.number().min(0).max(1).default(0.3),
  wetDb: z.number().min(-96).max(12).default(-6),
  dryDb: z.number().min(-96).max(12).default(0),
  pingPong: z.boolean().default(false),
  filterType: z.enum(['off', 'lowpass', 'highpass']).default('off'),
  filterCutoffHz: z.number().min(20).max(20000).default(20000),
});

export const EQBandType = z.enum([
  'lowshelf',
  'highshelf',
  'peaking',
  'hpf',
  'lpf',
]);

export const EQBand = z.object({
  type: EQBandType.default('peaking'),
  frequencyHz: z.number().min(10).max(20000).default(1000),
  gainDb: z.number().min(-18).max(18).default(0),
  q: z.number().min(0.1).max(10).default(1),
  enabled: z.boolean().default(true),
});

export const EQParameters = z.object({
  bands: z.array(EQBand).max(8).default([]),
  outputGainDb: z.number().min(-96).max(12).default(0),
});

export const CompressorParameters = z.object({
  thresholdDb: z.number().min(-60).max(0).default(-10),
  ratio: z.number().min(1).max(60).default(4),
  attackMs: z.number().min(0.1).max(500).default(10),
  releaseMs: z.number().min(1).max(5000).default(100),
  kneeDb: z.number().min(0).max(30).default(5),
  makeupGainDb: z.number().min(0).max(30).default(0),
  sidechainInsertId: z.string().optional(),
});

export const ChorusParameters = z.object({
  rateHz: z.number().min(0.1).max(20).default(0.5),
  depth: z.number().min(0).max(1).default(0.3),
  delayMs: z.number().min(0).max(50).default(15),
  voices: z.number().int().min(1).max(8).default(3),
  wetDb: z.number().min(-96).max(12).default(-6),
  dryDb: z.number().min(-96).max(12).default(0),
});

export const PhaserParameters = z.object({
  rateHz: z.number().min(0.1).max(20).default(0.5),
  depth: z.number().min(0).max(1).default(0.5),
  feedback: z.number().min(0).max(0.99).default(0.3),
  stages: z.number().int().min(2).max(12).default(4),
  wetDb: z.number().min(-96).max(12).default(-6),
  dryDb: z.number().min(-96).max(12).default(0),
});

export const LimiterParameters = z.object({
  ceilingDb: z.number().min(-12).max(0).default(-0.1),
  releaseMs: z.number().min(1).max(5000).default(100),
  lookaheadMs: z.number().min(0).max(50).default(5),
});

export const FilterParameters = z.object({
  type: z.enum(['lowpass', 'highpass', 'bandpass', 'notch']).default('lowpass'),
  cutoffHz: z.number().min(10).max(20000).default(1000),
  resonanceDb: z.number().min(0).max(20).default(0),
  slopeDbOctave: z.enum([12, 24]).default(12),
});

export const DistortionParameters = z.object({
  driveDb: z.number().min(0).max(60).default(0),
  toneHz: z.number().min(100).max(10000).default(1000),
  mixPercent: z.number().min(0).max(100).default(100),
  type: z.enum(['tube', 'fuzz', 'bit-crush', 'waveshaper']).default('tube'),
});
```

#### Instance and patcher graph

```ts
export const StockPluginInstance = z.object({
  id: z.string().uuid(),
  pluginId: StockPluginId,
  name: z.string(),
  kind: StockPluginKind,
  parameters: z.record(z.unknown()),
  presetId: z.string().optional(),
  stateBlobRef: z.string().optional(),
});

export const PatcherNodeKind = z.enum([
  'instrument',
  'effect',
  'audioInput',
  'audioOutput',
  'midiInput',
  'midiOutput',
  'mixerInsert',
  'bus',
  'sidechain',
]);

export const PatcherNode = z.object({
  id: z.string().uuid(),
  kind: PatcherNodeKind,
  pluginInstanceId: z.string().uuid().optional(),
  mixerInsertId: z.string().uuid().optional(),
  x: z.number(),
  y: z.number(),
});

export const PatcherConnectionKind = z.enum(['audio', 'midi', 'sidechain']);

export const PatcherConnection = z.object({
  id: z.string().uuid(),
  kind: PatcherConnectionKind,
  sourceNodeId: z.string().uuid(),
  sourceChannel: z.number().int().min(0).default(0),
  targetNodeId: z.string().uuid(),
  targetChannel: z.number().int().min(0).default(0),
});

export const PatcherGraph = z.object({
  nodes: z.array(PatcherNode).default([]),
  connections: z.array(PatcherConnection).default([]),
});
```

### API / interface

#### Backend REST endpoints

All endpoints return Zod-validated JSON and emit WebSocket events.

```ts
// List all stock plugin descriptors
GET /api/stock-plugins/descriptors
→ { descriptors: StockPluginDescriptor[] }

// Create a stock plugin instance in the current project
POST /api/projects/:projectId/stock-plugins
Body: { pluginId: StockPluginId; name?: string; channelId?: string; insertId?: string }
→ StockPluginInstance

// Delete a stock plugin instance
DELETE /api/projects/:projectId/stock-plugins/:instanceId
→ 204

// Batch update parameters (atomic)
PATCH /api/projects/:projectId/stock-plugins/:instanceId/parameters
Body: { parameters: Record<string, unknown> }
→ StockPluginInstance

// Get current parameters
GET /api/projects/:projectId/stock-plugins/:instanceId/parameters
→ Record<string, unknown>

// Save current state as a user preset
POST /api/projects/:projectId/stock-plugins/:instanceId/presets
Body: { name: string; tags?: string[] }
→ { presetId: string; path: string }

// Load a preset
POST /api/projects/:projectId/stock-plugins/:instanceId/presets/:presetId/load
→ StockPluginInstance

// List factory + user presets for a pluginId
GET /api/stock-plugins/:pluginId/presets
→ { presets: { presetId: string; name: string; isFactory: boolean; tags: string[] }[] }
```

#### WebSocket events

```ts
// Server → UI
{
  type: 'stockPlugin.parameterChanged';
  payload: {
    projectId: string;
    instanceId: string;
    parameters: Record<string, unknown>;
  };
}

{
  type: 'stockPlugin.instanceCreated';
  payload: StockPluginInstance;
}

{
  type: 'stockPlugin.instanceRemoved';
  payload: { projectId: string; instanceId: string };
}

{
  type: 'patcher.graphChanged';
  payload: PatcherGraph;
}
```

#### Engine command protocol

Commands are JSON envelopes sent over the local TCP/socket from the backend to the engine.

```ts
interface EngineCommand<T = unknown> {
  id: string;       // request correlation id
  type: string;
  payload: T;
}

interface EngineResponse<T = unknown> {
  id: string;
  type: string;
  success: boolean;
  error?: { code: string; message: string };
  payload?: T;
}
```

Command set:

```ts
// Lifecycle
{ type: 'stockPlugin.create'; payload: { instanceId: string; pluginId: StockPluginId; sampleRate: number; blockSize: number } }
{ type: 'stockPlugin.destroy'; payload: { instanceId: string } }
{ type: 'stockPlugin.prepareToPlay'; payload: { instanceId: string; sampleRate: number; blockSize: number } }

// Parameters
{ type: 'stockPlugin.setParameters'; payload: { instanceId: string; parameters: Record<string, unknown> } }
{ type: 'stockPlugin.getParameters'; payload: { instanceId: string } }
{ type: 'stockPlugin.getState'; payload: { instanceId: string } }
{ type: 'stockPlugin.setState'; payload: { instanceId: string; state: string } }

// Patcher graph
{ type: 'patcher.addNode'; payload: { node: PatcherNode } }
{ type: 'patcher.removeNode'; payload: { nodeId: string } }
{ type: 'patcher.setNodePosition'; payload: { nodeId: string; x: number; y: number } }
{ type: 'patcher.connect'; payload: { connection: PatcherConnection } }
{ type: 'patcher.disconnect'; payload: { connectionId: string } }
{ type: 'patcher.clear'; payload: { projectId: string } }
```

#### C++ engine interfaces

```cpp
// engine/src/stock/StockAudioProcessor.h
class StockAudioProcessor : public juce::AudioProcessor {
public:
    virtual juce::String getStockPluginId() const = 0;
    virtual StockPluginKind getKind() const = 0;
    void setParameters(const juce::var& params);
    juce::var getParameters() const;
    juce::MemoryBlock getState() const override;
    void setState(const juce::MemoryBlock& data) override;
};

// engine/src/stock/BuiltInPluginRegistry.h
using StockPluginFactory = std::function<std::unique_ptr<StockAudioProcessor>()>;

class BuiltInPluginRegistry {
public:
    static BuiltInPluginRegistry& getInstance();
    void registerPlugin(StockPluginId id, StockPluginFactory factory, const StockPluginDescriptor& descriptor);
    std::unique_ptr<StockAudioProcessor> create(StockPluginId id) const;
    std::vector<StockPluginDescriptor> getDescriptors() const;
    std::optional<StockPluginDescriptor> getDescriptor(StockPluginId id) const;
};

// engine/src/stock/PatcherGraph.h
class PatcherGraph {
public:
    void addNode(const PatcherNode& node, StockAudioProcessor* processor);
    void removeNode(const juce::String& nodeId);
    void connect(const PatcherConnection& connection);
    void disconnect(const juce::String& connectionId);
    void processBlock(juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi);
    void setNodePosition(const juce::String& nodeId, float x, float y);
};
```

### UI/UX

- **Browser / Plugin Picker**: stock instruments appear under "Instruments > Singularity"; stock effects under "Effects > Singularity". Each entry shows name, icon, and tagline. Dragging an instrument to the Channel Rack creates a channel with that stock device. Dragging an effect to a mixer insert slot creates an instance in that slot.
- **Stock plugin editor**: opens in an embedded tab or floating window. Each parameter has a control mapped from its `ParameterDescriptor`:
  - `float` → knob or slider with value readout.
  - `int` → stepped slider or numeric input.
  - `bool` → toggle switch.
  - `choice` → dropdown.
  - `sample` / `file` → drag-and-drop zone + file picker.
- **Sampler editor**: waveform display with draggable start/end/loop markers, reverse toggle, ADSR envelope visualization, filter section, pitch/time-stretch section.
- **Synth editor**: oscillator mixer, waveform selectors, filter envelope, amplitude envelope, unison/glide controls.
- **Drum machine editor**: 16×N pad grid, per-pad sample drop zone, step sequencer grid, choke-group selector, swing knob.
- **SoundFont player editor**: file picker, bank/preset dropdown populated from the loaded SoundFont, volume and polyphony controls.
- **Effects editors**: standard single-view panels grouped by function (e.g., EQ graph with draggable nodes).
- **Patcher canvas**: infinite 2D canvas with nodes, ports, cables. Right-click menu to add stock devices. Nodes snap to a grid. Connections are validated by kind and channel count. Double-click a node opens its editor.

### Algorithms / behavior

- **Sampler**:
  - Supports WAV, AIFF, FLAC, OGG, and MP3 source files at 44.1/48/88.2/96 kHz, mono/stereo.
  - Voice allocation: polyphonic up to `maxVoices`; oldest active voice is stolen when the limit is reached.
  - Pitch is computed as `rootNote + pitchSemitones + pitchCents/100` and translated to playback rate.
  - Envelope follows ADSR with exponential curves; sustain level in dB is converted to linear gain.
  - Filter is a biquad/state-variable filter applied per voice before mixing.
  - Time stretch `timeStretchRatio` produces output duration `inputDuration / ratio` while preserving pitch (±24 semitones); acceptable musical quality from 0.5× to 2×.
  - Loop points are clamped inside [startSample, endSample]; ping-pong loops reverse direction at loop boundaries.

- **Subtractive synthesizer**:
  - Band-limited waveforms generated via JUCE oscillators; noise is white noise.
  - Three-oscillator mixer with per-oscillator volume, pan, pitch, detune, and phase.
  - Filter envelope modulates cutoff by `filterEnvAmount` mapped to the configured cutoff range.
  - Glide/portamento moves pitch toward a new note over `glideSec` when a note is already held.
  - Unison duplicates voices and detunes them by `unisonDetuneCents`.

- **Drum machine**:
  - 16 default pads mapped to MIDI notes C1 (36) through D#2 (51); pads are reassignable.
  - Each pad owns an independent sample voice with ADSHR envelope and optional filter.
  - Choke group: triggering a pad silences all other pads in the same group.
  - Step sequencer runs at the current pattern length (16/32/64 steps); swing offsets every second step by `swingPercent` of a step.
  - Each pad can route to a mixer insert via `outputInsertId` or to the drum machine master output.

- **SoundFont player**:
  - Loads SF2 v2.01 and SF3 files.
  - Bank/preset selection follows General MIDI conventions; default bank 0 / preset 0 (Acoustic Grand Piano).
  - 64-voice polyphony with voice stealing for oldest release-phase voice.
  - Responds to note on/off, velocity, pitch bend, modulation, and sustain pedal CC.

- **Effects**:
  - Reverb: Schroeder-Moorer algorithmic reverb with pre-delay, room size, damping, stereo width, wet/dry mix.
  - Delay: stereo circular-buffer delay with optional BPM sync, ping-pong, feedback damping filter, and wet/dry mix.
  - EQ: up to 8 biquad bands (low shelf, high shelf, peaking, HPF, LPF) with real-time graph.
  - Compressor: feed-forward peak compressor with threshold, ratio, attack/release, soft knee, and optional sidechain input.
  - Chorus: modulated delay lines with rate/depth/voices and wet/dry mix.
  - Phaser: cascading all-pass stages with LFO modulation and feedback.
  - Limiter: look-ahead brick-wall peak limiter with ceiling and release.
  - Filter: resonant lowpass/highpass/bandpass/notch with 12 dB/octave or 24 dB/octave slope.
  - Distortion: waveshaping drive with tone control and mix; modes: tube, fuzz, bit-crush, waveshaper.

- **Patcher graph**:
  - Audio connections route `juce::AudioSampleBuffer` channels.
  - MIDI connections route `juce::MidiBuffer` events.
  - Sidechain connections route audio to a compressor/limiter sidechain input without appearing at the main output.
  - Cycles are rejected; only directed acyclic graphs are allowed for audio.
  - Mixer inserts and buses are represented as nodes so the patcher can reroute signals without duplicating mixer logic.

## Implementation plan

1. Create `engine/src/stock/` module and base `StockAudioProcessor` class with parameter serialization.
2. Implement `BuiltInPluginRegistry` and publish descriptors for all 13 stock devices.
3. Implement sampler DSP and editor model.
4. Implement subtractive synth DSP and editor model.
5. Implement drum machine DSP, step sequencer, and editor model.
6. Implement SoundFont player integration.
7. Implement the nine effect processors.
8. Implement `PatcherGraph` on top of `juce::AudioProcessorGraph`.
9. Add backend REST endpoints, WebSocket events, and engine command mapping.
10. Build React editor panels in `packages/ui` for every stock device and the patcher canvas.
11. Add factory presets and user preset save/load.
12. Write unit, integration, and E2E tests.

## Testing strategy

- **Unit tests (engine, C++ JUCE UnitTest or Catch2)**:
  - Each stock device produces non-silent, finite output for a defined input.
  - Sampler voice stealing and ADSR envelope shapes.
  - Synth oscillator waveforms match expected harmonic content.
  - Drum machine choke groups silence the correct voices.
  - SoundFont player emits audio for a GM piano preset.
  - Effect processors do not produce NaN/Inf across the full parameter range.
- **Integration tests (backend API)**:
  - Create/destroy every stock device via REST endpoints.
  - Parameter update round-trips through backend → engine → backend.
  - Preset save/load preserves all parameter values.
  - Patcher graph add/remove/connect operations update engine graph state.
- **E2E tests (Tauri desktop)**:
  - Create a project, add a sampler channel, drop a sample, trigger middle C, and hear/see output meters.
  - Add a reverb to the master insert and verify wet signal increase.
  - Build a patcher chain (synth → filter → reverb → master) and render to WAV.

## Acceptance criteria

- [ ] All 13 stock devices (`singularity.sampler`, `singularity.subtractive-synth`, `singularity.drum-machine`, `singularity.soundfont-player`, `singularity.reverb`, `singularity.delay`, `singularity.eq`, `singularity.compressor`, `singularity.chorus`, `singularity.phaser`, `singularity.limiter`, `singularity.filter`, `singularity.distortion`) register in `BuiltInPluginRegistry` and appear in the plugin picker.
- [ ] `GET /api/stock-plugins/descriptors` returns descriptors for all 13 devices, each with a non-empty `parameters` array and correct `kind`.
- [ ] Sampler loads a 44.1 kHz stereo WAV and plays it back at original pitch when MIDI note 60 is received, verified by engine unit test comparing output samples to the source at the expected transposition.
- [ ] Sampler ADSR envelope reaches within 1% of the configured sustain level at the end of the decay stage, verified by envelope unit test.
- [ ] Sampler loop points loop the region exactly when `loopMode` is `forward`, confirmed by output duration test at 1× stretch.
- [ ] Subtractive synth produces non-silent output for each of the four oscillator waveforms (`sine`, `saw`, `square`, `triangle`), verified by buffer energy test.
- [ ] Subtractive synth filter envelope opens the cutoff by the configured `filterEnvAmount` within the attack time, verified by measuring cutoff modulation in a unit test.
- [ ] Drum machine maps pads 0–15 to MIDI notes 36–51 by default and triggers the correct per-pad sample, verified by unit test.
- [ ] Drum machine choke group silences all other pads in the same group when a new pad in that group is triggered, verified by unit test.
- [ ] SoundFont player loads a General MIDI SF2 file and produces non-silent output for bank 0 / preset 0 when MIDI note 60 is received, verified by unit test.
- [ ] Each of the nine effects processes a 1 kHz sine wave input and produces finite, non-NaN output across the full valid parameter range, verified by per-effect unit tests.
- [ ] Compressor with `ratio: 10`, `threshold: -20 dB`, and a -10 dBFS input reduces peak output below -18 dBFS, verified by unit test.
- [ ] Limiter with `ceiling: -1 dB` never outputs a sample above -1 dBFS, verified by unit test with a +6 dBFS input.
- [ ] EQ 8-band parametric filter applies `gainDb` within ±0.5 dB at the configured `frequencyHz` for a `peaking` band, verified by frequency-response unit test.
- [ ] `POST /api/projects/:projectId/stock-plugins` creates an instance and the engine responds with a matching `instanceId` within 100 ms.
- [ ] `PATCH /api/projects/:projectId/stock-plugins/:instanceId/parameters` updates parameters atomically and broadcasts `stockPlugin.parameterChanged` to all connected UI clients.
- [ ] Preset save/load round-trips all parameter values without loss, verified by integration test comparing JSON before and after load.
- [ ] Patcher graph routes audio from a synth node through a filter node and reverb node to the master output node, verified by an integration test that renders a buffer and detects the effect of each node.
- [ ] Patcher graph rejects cyclic audio connections and returns an error to the backend.
- [ ] Stock device editor panels render in the UI for all 13 devices and update parameters in real time when controls are moved.
- [ ] All automatable parameters respond to automation clips during playback, verified by integration test measuring parameter changes at automation breakpoints.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture (defines monorepo layout, JUCE engine, backend, and UI layers).
- Spec 19: Shared Protocol and Schemas (Zod schemas and engine message envelopes used by this spec).
- Spec 20: JUCE Audio Engine Foundation (realtime callback, plugin hosting, mixer graph that stock devices plug into).
- Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge) (Fastify routes and WebSocket event bus consumed by the endpoints listed above).

## Blocks

- Spec 26: Channel Rack and Step Sequencer (stock instruments are the channel types that drive the rack).
- Spec 29: Mixer and Routing Graph (stock effects load into insert slots; mixer inserts appear as patcher nodes).
- Spec 30: Browser, Plugin Database, and Presets (lists stock devices alongside scanned third-party plugins).
- Spec 35: AI Agent System (agent must be able to create and configure stock devices via skills).

## Notes / open questions

- **Decision made**: Stock devices are first-class `AudioProcessor` subclasses registered in a built-in plugin registry so they share the same create/destroy/parameter/automation/preset lifecycle as third-party plugins. This avoids duplicate hosting code and keeps the browser/mixer integration uniform.
- **Decision made**: Presets for stock devices are stored as JSON files inside `.singularity/plugin-states/` so they diff cleanly and can be edited by the agent in Monaco.
- **Decision made**: The SoundFont player supports SF2 v2.01 and SF3 files with 64-voice polyphony. SFZ support is out of scope for v1.0.
- **Decision made**: The drum machine integrates a step sequencer; pattern data is stored on the channel/pattern model, not inside the drum machine processor, so the same sequencer can drive other instruments.
- Time-stretch quality target is musical usability from 0.5× to 2×; extreme ratios (0.25×–4×) are functional but may exhibit artifacts.
