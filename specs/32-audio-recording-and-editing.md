# Spec 32: Audio Recording and Editing

## Objective

Implement end-to-end Edison-style audio recording and editing in Singularity v1.0: live multi-input recording with count-in, start-on-input, loop takes, and a destructive waveform editor, plus non-destructive audio clip editing inside the Playlist.

## Motivation

FL Studio parity requires users to capture live audio, comp multiple takes, and surgically edit waveforms (cut, copy, paste, fade, normalize, reverse, pitch/time-stretch, noise removal) without leaving the DAW. This spec wires the JUCE engine’s audio I/O and recording pipeline to the React UI, the backend project model, and the agent tool surface.

## Scope

### In scope

- Audio input enumeration and per-mixer-insert input selection.
- Record arm / disarm per mixer insert with visual feedback.
- Transport recording with configurable metronome count-in and start-on-input threshold.
- Loop recording that creates a new take on every loop pass.
- Multiple-take management: keep, delete, activate (comp), and rename takes.
- Edison-style waveform editor panel with sample-accurate selection.
- Waveform editor destructive operations: cut, copy, paste, fade in/out, normalize, reverse, pitch/time-stretch, noise removal.
- Non-destructive Playlist audio clip editing: move, resize, loop, fade, gain, pan, pitch/time-stretch, and sample-accurate split.
- Persist recordings, takes, and edited assets inside the `.singularity` bundle.
- Expose every operation as an agent skill.

### Out of scope

- MIDI recording and score logging (covered by the MIDI spec).
- Video-scored audio recording workflows (covered by the Video Playback spec).
- Real-time collaborative multi-user recording.
- External Rewire-style recording.

## Related decisions

- `2026-06-25 — Audio recording and editing`: full Edison-style recording and editing is required for v1.0.
- `2026-06-25 — Audio engine backend`: JUCE C++ engine owns audio I/O, transport, and recording.
- `2026-06-25 — Audio thread model`: single realtime callback with lock-free queues for control/metering.
- `2026-06-25 — Project model`: FL Studio-style Channel Rack + Patterns + Playlist.
- `2026-06-25 — Project file format`: `.singularity` ZIP bundle stores `project.json`, `assets/`, and `plugin-states/`.
- `2026-06-25 — Plugin hosting model`: in-process plugin hosting; audio recording runs in the same engine process.
- `2026-06-25 — Backend framework`: Fastify + `@fastify/websocket`.
- `2026-06-25 — Backend-to-engine transport`: local TCP/socket command protocol.

## Detailed design

### Subsystem overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                              UI Layer                                 │
│  Mixer strip ──► Record-arm button + input selector                   │
│  Transport bar ──► Record button + count-in / start-on-input toggles  │
│  Playlist ──► Audio clips, take lanes, split/fade/move tools          │
│  Waveform Editor ──► Edison-style canvas panel                        │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ WebSocket / HTTP
┌───────────────────────────▼──────────────────────────────────────────┐
│                         Backend (Bun)                                 │
│  Project model (clips, takes, assets)                                 │
│  AudioRecordingService                                                │
│  Agent skill dispatch                                                 │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ local TCP/socket (JSON command envelopes)
┌───────────────────────────▼──────────────────────────────────────────┐
│                      JUCE Engine (C++)                                │
│  Audio device I/O │ Insert record arm │ Take writer                   │
│  Waveform editor DSP │ Clip render graph                              │
└──────────────────────────────────────────────────────────────────────┘
```

The engine is the source of truth for audio I/O, live recording buffers, and waveform DSP. The backend owns the project model (`AudioAsset`, `AudioTake`, `AudioClip`). The UI mirrors backend state over WebSocket and issues commands through the backend to the engine.

### Data model

All schemas live in `packages/shared/src/schemas/audioRecording.ts`.

#### Audio input

```ts
export const AudioChannelConfigSchema = z.union([
  z.literal('mono-left'),
  z.literal('mono-right'),
  z.literal('stereo'),
  z.object({ type: z.literal('multi'), indices: z.array(z.number().int()).min(1) }),
]);
export type AudioChannelConfig = z.infer<typeof AudioChannelConfigSchema>;

export const AudioInputSchema = z.object({
  inputId: z.string(),
  name: z.string(),
  channelCount: z.number().int().min(1),
  isDefault: z.boolean().optional(),
});
export type AudioInput = z.infer<typeof AudioInputSchema>;
```

#### Mixer insert record configuration

```ts
export const InsertRecordConfigSchema = z.object({
  insertId: z.string(),
  inputId: z.string(),
  channelConfig: AudioChannelConfigSchema,
  monitor: z.enum(['off', 'auto', 'on']),
  recordArm: z.boolean(),
});
export type InsertRecordConfig = z.infer<typeof InsertRecordConfigSchema>;
```

#### Recording options

```ts
export const RecordModeSchema = z.enum(['normal', 'loop', 'punch']);
export const CountInModeSchema = z.enum(['off', 'bars', 'seconds']);

export const RecordOptionsSchema = z.object({
  mode: RecordModeSchema,
  countIn: CountInModeSchema,
  countInValue: z.number().positive(),
  startOnInputDbfs: z.number().optional(), // omitted = disabled
  preRollSeconds: z.number().nonnegative().default(0),
  autoCreatePlaylistClips: z.boolean().default(true),
  fileFormat: z.enum(['wav-32f', 'wav-24', 'wav-16']).default('wav-32f'),
});
export type RecordOptions = z.infer<typeof RecordOptionsSchema>;
```

#### Audio asset

```ts
export const AudioAssetSchema = z.object({
  assetId: z.string(),
  name: z.string(),
  filePath: z.string(), // relative path inside .singularity bundle, e.g. assets/audio/<assetId>.wav
  sampleRate: z.number().int(),
  bitDepth: z.enum([16, 24, 32]),
  channels: z.number().int().min(1),
  durationSamples: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  peakDbfs: z.number(),
});
export type AudioAsset = z.infer<typeof AudioAssetSchema>;
```

#### Audio take

```ts
export const AudioTakeSchema = z.object({
  takeId: z.string(),
  insertId: z.string(),
  sourceAssetId: z.string(),
  startTick: z.number().int(),
  durationTicks: z.number().int(),
  takeIndex: z.number().int().nonnegative(),
  active: z.boolean(),
  discarded: z.boolean().default(false),
});
export type AudioTake = z.infer<typeof AudioTakeSchema>;
```

#### Playlist audio clip

```ts
export const AudioClipSchema = z.object({
  clipId: z.string(),
  name: z.string(),
  assetId: z.string(),
  playlistTrackIndex: z.number().int().nonnegative(),
  startTick: z.number().int(),
  durationTicks: z.number().int(),
  sourceOffsetSamples: z.number().int().default(0),
  gainDb: z.number().default(0),
  pan: z.number().min(-1).max(1).default(0),
  fadeInTicks: z.number().int().nonnegative().default(0),
  fadeOutTicks: z.number().int().nonnegative().default(0),
  fadeCurve: z.enum(['linear', 'log', 'exp']).default('linear'),
  pitchSemitones: z.number().default(0),
  timeStretchRatio: z.number().positive().default(1),
  preserveFormants: z.boolean().default(true),
  loop: z.boolean().default(false),
  color: z.string().optional(),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;
```

#### Waveform selection and Edison operations

```ts
export const WaveformSelectionSchema = z.object({
  startSample: z.number().int(),
  endSample: z.number().int(),
});
export type WaveformSelection = z.infer<typeof WaveformSelectionSchema>;

export const EdisonEditOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cut'),
    selection: WaveformSelectionSchema,
  }),
  z.object({
    type: z.literal('copy'),
    selection: WaveformSelectionSchema,
  }),
  z.object({
    type: z.literal('paste'),
    positionSample: z.number().int(),
    clipboardSessionId: z.string(),
  }),
  z.object({
    type: z.literal('fadeIn'),
    selection: WaveformSelectionSchema,
    curve: z.enum(['linear', 'log', 'exp']),
  }),
  z.object({
    type: z.literal('fadeOut'),
    selection: WaveformSelectionSchema,
    curve: z.enum(['linear', 'log', 'exp']),
  }),
  z.object({
    type: z.literal('normalize'),
    selection: WaveformSelectionSchema,
    targetPeakDbfs: z.number().default(-1),
  }),
  z.object({
    type: z.literal('reverse'),
    selection: WaveformSelectionSchema,
  }),
  z.object({
    type: z.literal('pitchTimeStretch'),
    selection: WaveformSelectionSchema,
    pitchSemitones: z.number(),
    timeRatio: z.number().positive(),
    algorithm: z.enum(['elastique', 'formant', 'stretch']),
    preserveFormants: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('noiseRemoval'),
    selection: WaveformSelectionSchema,
    profileSelection: WaveformSelectionSchema,
    reductionDb: z.number(),
    smoothing: z.number().min(0).max(1).default(0.5),
  }),
]);
export type EdisonEditOperation = z.infer<typeof EdisonEditOperationSchema>;
```

### API / interface

All messages use the shared envelope:

```ts
interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
}
```

#### Backend HTTP endpoints

| Method | Endpoint | Response | Purpose |
|--------|----------|----------|---------|
| `GET` | `/api/audio-inputs` | `AudioInput[]` | List available hardware inputs. |
| `GET` | `/api/projects/:projectId/audio-assets` | `AudioAsset[]` | List project audio assets. |
| `GET` | `/api/projects/:projectId/audio-assets/:assetId/download` | WAV binary | Serve raw audio for waveform display/export. |

#### UI ↔ backend WebSocket commands

| Type | Payload | Direction |
|------|---------|-----------|
| `audio.inputs.list` | — | UI → backend |
| `audio.inputs.listed` | `{ inputs: AudioInput[] }` | backend → UI |
| `mixer.insert.setInput` | `{ insertId, inputId, channelConfig, monitor }` | UI → backend |
| `mixer.insert.setRecordArm` | `{ insertId, recordArm }` | UI → backend |
| `mixer.insert.recordConfigChanged` | `InsertRecordConfig` | backend → UI |
| `recording.prepare` | `RecordOptions` | UI → backend |
| `recording.start` | `{ armedInsertIds: string[] }` | UI → backend |
| `recording.started` | `{ startTick, armedInsertIds }` | backend → UI |
| `recording.stop` | — | UI → backend |
| `recording.stopped` | `{ takes: AudioTake[], assets: AudioAsset[] }` | backend → UI |
| `recording.discardTake` | `{ takeId }` | UI → backend |
| `recording.compTakes` | `{ insertId, activeTakeId }` | UI → backend |
| `playlist.audioClip.split` | `{ clipId, splitTick }` | UI → backend |
| `playlist.audioClip.splitted` | `{ leftClipId, rightClipId }` | backend → UI |
| `playlist.audioClip.setFade` | `{ clipId, fadeInTicks?, fadeOutTicks?, fadeCurve? }` | UI → backend |
| `waveformEditor.open` | `{ assetId }` | UI → backend |
| `waveformEditor.applyEdit` | `{ assetId, operation: EdisonEditOperation }` | UI → backend |
| `waveformEditor.editApplied` | `{ newAssetId, asset: AudioAsset }` | backend → UI |
| `waveformEditor.setSelection` | `{ assetId, selection: WaveformSelection }` | UI → backend (non-persistent) |

#### Backend ↔ engine TCP/socket commands

The backend forwards recording and waveform commands to the engine using the same JSON envelope over the local socket.

| Type | Payload | Response |
|------|---------|----------|
| `engine.audioInputs.list` | — | `{ inputs: AudioInput[] }` |
| `engine.mixer.setInsertInput` | `{ insertId, inputId, channelConfig, monitor }` | `{ ok: true }` |
| `engine.mixer.setInsertRecordArm` | `{ insertId, recordArm }` | `{ ok: true }` |
| `engine.recording.prepare` | `RecordOptions` | `{ ok: true }` |
| `engine.recording.start` | `{ armedInsertIds: string[] }` | `{ startedAtSample: number }` |
| `engine.recording.stop` | — | `{ takeBuffers: Array<{ insertId, samples: Float32Array, channels, sampleRate }> }` |
| `engine.waveform.applyEdit` | `{ assetId, operation: EdisonEditOperation }` | `{ newAssetId, sampleRate, channels, durationSamples, peakDbfs }` |

#### Backend service signatures

```ts
// packages/backend/src/audio-recording/recordingService.ts
export async function listAudioInputs(): Promise<AudioInput[]>;
export async function setInsertInput(
  insertId: string,
  inputId: string,
  channelConfig: AudioChannelConfig,
  monitor: 'off' | 'auto' | 'on',
): Promise<void>;
export async function setInsertRecordArm(insertId: string, recordArm: boolean): Promise<void>;
export async function prepareRecording(options: RecordOptions): Promise<void>;
export async function startRecording(armedInsertIds: string[]): Promise<{ startTick: number }>;
export async function stopRecording(): Promise<{ takes: AudioTake[]; assets: AudioAsset[] }>;
export async function discardTake(takeId: string): Promise<void>;
export async function compTakes(insertId: string, activeTakeId: string): Promise<void>;
export async function splitAudioClip(
  clipId: string,
  splitTick: number,
): Promise<{ leftClipId: string; rightClipId: string }>;
export async function applyWaveformEdit(
  assetId: string,
  operation: EdisonEditOperation,
): Promise<{ newAssetId: string; asset: AudioAsset }>;
```

#### Engine C++ interfaces

```cpp
// engine/src/recording/AudioRecorder.h
struct AudioInput {
    juce::String inputId;
    juce::String name;
    int channelCount;
};

struct RecordOptions {
    juce::String mode;          // "normal", "loop", "punch"
    juce::String countIn;       // "off", "bars", "seconds"
    double countInValue;
    std::optional<double> startOnInputDbfs;
    double preRollSeconds;
    bool autoCreatePlaylistClips;
    juce::String fileFormat;    // "wav-32f", "wav-24", "wav-16"
};

struct AudioTakeBuffer {
    juce::String insertId;
    juce::AudioSampleBuffer buffer;
    int sampleRate;
};

class AudioRecorder {
public:
    std::vector<AudioInput> getAudioInputs() const;
    void setInsertInput(const juce::String& insertId,
                        const juce::String& inputId,
                        const AudioChannelConfig& config,
                        MonitorMode monitor);
    void setInsertRecordArm(const juce::String& insertId, bool recordArm);
    void prepare(const RecordOptions& options);
    void start(const juce::StringArray& armedInsertIds);
    std::vector<AudioTakeBuffer> stop();
};

// engine/src/editing/WaveformEditor.h
class WaveformEditor {
public:
    EditedAsset applyEdit(const juce::File& source,
                          const EdisonEditOperation& op);
};
```

#### Agent skills

Every UI command is also exposed as a provider-agnostic skill in `packages/backend/src/agent/skills/audioRecording.ts`:

- `audio_recording:armInsert` — params `InsertRecordConfigSchema`.
- `audio_recording:prepare` — params `RecordOptionsSchema`.
- `audio_recording:start` — params `z.object({ armedInsertIds: z.array(z.string()) })`.
- `audio_recording:stop` — no params.
- `audio_recording:discardTake` — params `z.object({ takeId: z.string() })`.
- `audio_recording:compTakes` — params `z.object({ insertId, activeTakeId })`.
- `audio_recording:splitClip` — params `z.object({ clipId, splitTick })`.
- `audio_recording:applyWaveformEdit` — params `z.object({ assetId, operation: EdisonEditOperationSchema })`.

Destructive agent actions (`discardTake`, `applyWaveformEdit`) require user confirmation per the agent permission model.

### UI/UX

- **Mixer insert strip**: input dropdown, record arm button (red when armed), monitor toggle (`off`/`auto`/`on`).
- **Transport bar**: record button; count-in toggle with value field; start-on-input toggle with dBFS threshold; loop-mode indicator.
- **Playlist audio clip**: waveform thumbnail, drag top corners for non-destructive fades, context menu `Open in Waveform Editor`, `Split at playhead`, `Make unique`, `Loop`, `Bounce`.
- **Take lanes**: below the Playlist track when multiple takes exist; inactive takes dimmed; click to activate comp.
- **Waveform editor panel** (Dockview tab):
  - Toolbar: tool selector (select, cut, fade, normalize, reverse, pitch/time-stretch, noise profile), zoom, undo/redo.
  - Canvas: sample-accurate waveform overview + detailed view; selection handles; playhead.
  - Status bar: selection length in samples/time, peak/RMS, channel count.
- **Shortcuts**: `R` arms selected insert; `Ctrl+R` starts/stops recording; `Ctrl+E` opens selected clip in waveform editor; `S` splits selected clip at playhead.
- **Theme tokens**: waveform uses `editor.background`, waveform fill uses `terminal.ansiCyan`, selection uses `editor.selectionBackground`, record-arm red uses `errorForeground`.

### Algorithms / behavior

#### Count-in

When `countIn` is enabled, pressing record starts a silent pre-roll. The metronome clicks during the count-in. After the count-in duration elapses, recording begins and the transport starts from the pre-roll point.

#### Start-on-input

If `startOnInputDbfs` is set, the engine monitors armed input RMS during count-in/standby. When the RMS exceeds the threshold continuously for `20 ms`, recording begins immediately and the transport start position is set to the project position at the moment of crossing (rounded back to the nearest sample).

#### Loop recording

In loop mode the engine records into a fresh buffer for each loop pass. At loop boundary the writer is swapped, producing one `AudioTake` per pass with incrementing `takeIndex`. The previous pass buffer is flushed to `assets/recordings/<takeId>.wav` asynchronously while the next pass continues.

#### Take comping

Only one take per armed insert is active at a time. Activating a take creates or replaces the Playlist audio clip for that insert at the take’s start position with the active take’s asset. Discarded takes are hidden from the take lane but remain in the project bundle until the user runs `Project > Clean unused assets`.

#### Sample-accurate clip split

Given a split tick, the backend computes the sample offset using the current tempo map:

```ts
const splitSample = tickToSample(splitTick, { ppqn: 960, sampleRate, tempo });
const leftDurationSamples = splitSample - clip.sourceOffsetSamples;
const rightOffsetSamples = splitSample;
```

The left clip receives `durationSamples = leftDurationSamples`, the right clip receives `sourceOffsetSamples = rightOffsetSamples` and `durationSamples = originalDuration - leftDurationSamples`. The sum of the two durations must equal the original clip duration exactly; a unit test verifies no drift for 1000 consecutive splits.

#### Fade curves

- `linear`: gain ramps linearly 0 → 1 (fade in) or 1 → 0 (fade out).
- `log`: gain follows `gain = pow(t, 0.5)`.
- `exp`: gain follows `gain = pow(t, 2.0)`.

#### Normalize

Normalize scans the selection for the absolute peak, computes `scale = dbToGain(targetPeakDbfs) / peak`, and multiplies every sample by `scale`. If the selection is silent the command returns an error.

#### Pitch / time-stretch

The engine delegates to a JUCE-based time-stretcher (`juce::TimeStretchAudioSource` or an equivalent elastique implementation). `pitchSemitones` and `timeRatio` are independent parameters. Formant preservation is applied when `preserveFormants` is true. The operation writes a new asset; the source asset is unchanged.

#### Noise removal

Noise removal uses profile-based spectral subtraction:
1. Compute magnitude spectrum of the `profileSelection`.
2. Subtract the profile (scaled by `reductionDb`) from the magnitude spectrum of `selection`.
3. Apply a smoothing factor to avoid musical noise.
4. Inverse FFT to produce the cleaned signal.

This is an Edison-style convenience tool, not a broadcast restoration plugin.

## Implementation plan

1. Add shared Zod schemas for inputs, record config, options, takes, clips, waveform selection, and Edison edits.
2. Implement engine-side `AudioRecorder` and `WaveformEditor` classes in C++ with unit tests for DSP operations.
3. Add TCP/socket command handlers in the engine for recording and waveform editing.
4. Implement `recordingService.ts` in the backend, including take/clip persistence and asset writing to the `.singularity` bundle.
5. Add WebSocket handlers and agent skills that delegate to `recordingService.ts`.
6. Build mixer record-arm UI and transport record controls.
7. Build Playlist take lanes and clip context menu.
8. Build the Edison-style waveform editor canvas panel.
9. Add E2E tests for record → stop → split → fade → waveform normalize → export.

## Testing strategy

- **Unit tests**
  - `tickToSample` and `sampleToTick` round-trip conversions.
  - Clip split invariant: left duration + right duration = original duration.
  - Fade curve math (`linear`, `log`, `exp`) for known sample counts.
  - Normalize scales a sine wave to the requested peak within 0.05 dB.
  - Reverse reverses sample order.

- **Integration tests**
  - Backend returns `AudioInput[]` and engine input list match.
  - Arming an insert updates the engine record-arm state and broadcasts `recordConfigChanged`.
  - Simulated recording (engine test harness injects a sine wave into an armed input) produces one `AudioTake` and one `AudioAsset`.
  - Loop recording produces three takes for three loop passes.
  - Start-on-input triggers recording within 50 ms of threshold crossing.
  - Waveform edit operations return a new asset and leave the source asset unchanged.

- **E2E tests**
  - User arms a mixer insert, starts recording, stops, and sees a new audio clip in the Playlist.
  - User splits an audio clip at the playhead and drags the resulting clips apart.
  - User opens a clip in the waveform editor, normalizes it, and the peak meter reads the target value.
  - Agent skill `audio_recording:start` followed by `audio_recording:stop` creates a take.

## Acceptance criteria

- [ ] `GET /api/audio-inputs` returns the same list as the engine’s `engine.audioInputs.list` command.
- [ ] Arming a mixer insert sets `InsertRecordConfig.recordArm = true`, turns the arm button red, and unarming any previously armed insert if the implementation enforces a single armed insert per project.
- [ ] Recording in normal mode with a 2-bar count-in does not write audio until exactly 2 bars after the record command.
- [ ] With start-on-input enabled at `-40 dBFS`, a 1 kHz sine burst injected at `-30 dBFS` triggers recording within 50 ms of crossing the threshold.
- [ ] Loop recording across three loop passes produces three distinct `AudioTake` objects, each referencing a distinct `AudioAsset`.
- [ ] Each take file is stored in the bundle at `assets/recordings/<assetId>.wav` with the configured bit depth.
- [ ] Activating a take via `recording.compTakes` updates the Playlist clip to reference the active take’s asset.
- [ ] Splitting an audio clip at any tick yields two clips whose source offsets and durations sum exactly to the original clip’s source offset and duration in samples.
- [ ] Non-destructive clip fades can be dragged from the top corners and persist across project save/reload.
- [ ] The waveform editor `cut` operation removes the selected samples from the visible waveform and writes a new asset that is shorter by exactly the selection length.
- [ ] `copy` + `paste` at sample position `N` inserts the copied samples so that the new asset length equals `originalLength + selectionLength`.
- [ ] `normalize` on a `-6 dBFS` peak sine selection to `-1 dBFS` produces a peak between `-1.05 dBFS` and `-0.95 dBFS`.
- [ ] `reverse` on a selection yields a buffer whose samples are in the exact opposite order.
- [ ] `pitchTimeStretch` with `timeRatio = 2.0` doubles the sample count of the selection; `pitchSemitones = 12` raises the fundamental frequency by one octave.
- [ ] `noiseRemoval` using a pure-noise profile reduces the selection RMS by at least `10 dB`.
- [ ] Every destructive waveform edit creates a new `AudioAsset` and leaves the original asset byte-for-byte unchanged in the bundle.
- [ ] All recording and editing commands are available as agent skills and are listed in the agent skill registry.
- [ ] No `TODO`, `FIXME`, or stub implementations remain in the recording/editing code paths.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture (runtime stack and communication paths).
- Spec 18: Monorepo and Build System (builds the shared, backend, UI, and engine packages).
- Spec 19: Shared Protocol and Schemas (message envelope and Zod validation infrastructure).
- Spec 20: JUCE Engine Internals (audio device I/O, transport, mixer graph).
- Spec 23: Backend API (Fastify HTTP/WebSocket server and project model persistence).
- Spec 33: Automation, MIDI, and Transport (metronome, count-in, loop region, record transport).
- Spec 29: Mixer and Routing Graph (insert inputs, sends, record arm state).
- Spec 28: Playlist and Arrangement (audio clips, take lanes, non-destructive edits).

## Blocks

- AI Agent Integration spec (agent skills depend on these backend commands).
- Export & Rendering spec (stem export and bounce depend on recorded clips and takes).

## Notes / open questions

- The decision to place record arm on mixer inserts rather than Playlist tracks was made to match FL Studio’s insert-based recording model. This is recorded as a local design choice; if a future spec assigns record arm to Playlist tracks, this spec must be updated.
- Noise removal is intentionally a simple spectral-subtraction convenience tool. A professional restoration plugin can be added post-v1.0 as a stock effect.
- Transport & Playback is Spec 33, Mixer & Routing is Spec 29, and Playlist / Arrangement is Spec 28.
