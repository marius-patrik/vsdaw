# Spec 20: JUCE Audio Engine Foundation

## Objective

Deliver the foundational native C++ audio engine executable built on JUCE 8 that manages audio devices, runs a single realtime callback, processes lock-free control commands from the backend, executes the Channel Rack + Pattern + Playlist model, drives the Mixer graph, and broadcasts transport position and meters back to the backend.

## Motivation

Singularity v1.0 requires a native audio engine to host VST3/AU/CLAP/LV2/AAX plugins, achieve low-latency playback, and provide professional DAW timing. This spec establishes the engine runtime, the backend-to-engine command protocol, and the core execution graph on which all audio features depend.

## Scope

### In scope

- JUCE 8-based engine executable (`singularity-engine`) built with CMake.
- Local TCP/socket command server and length-prefixed JSON protocol.
- Audio device enumeration, selection, sample rate, buffer size, and latency reporting.
- Single realtime audio callback with lock-free command queues.
- Transport state machine: play, stop, pause, record arm, seek, loop, tempo, and time signature.
- Core time representation: ticks (PPQN), samples, and bars/beats/ticks.
- In-memory project model execution: Channel Rack, Patterns, Playlist clips, and Mixer insert graph.
- Lock-free metering output (peak + RMS) and transport position broadcast to backend.
- Foundational MIDI input/output plumbing.
- Offline render path for future export (command interface and offline audio callback).

### Out of scope

- Plugin scanning and hosting internals (Spec 21: Plugin Hosting and Scanner).
- Stock instrument/effect DSP implementations (Spec 31: Stock Instruments and Effects).
- Full Edison-style recording and editing (Spec 32: Audio Recording and Editing).
- MIDI learn, remote control surface, and scripting (Spec 33: Automation, MIDI, and Transport).
- WAV/FLAC/OGG/MP3 export encoding and stem rendering (Spec 34: Export, Rendering, and AI Mastering).
- Automation curve evaluation and breakpoint editing (Spec 33: Automation, MIDI, and Transport).
- Video playback sync (no dedicated engine UI panel spec).
- UI panels for device settings, mixer, channel rack, playlist, and piano roll (Specs 24–30: Design System, Dockview, Channel Rack, Piano Roll, Playlist, Mixer, and Browser).

## Related decisions

- 2026-06-25 — Audio engine backend: JUCE-based native C++ engine as Tauri sidecar.
- 2026-06-25 — Backend-to-engine transport: local TCP/socket.
- 2026-06-25 — Audio thread model: single realtime callback with lock-free queues.
- 2026-06-25 — Project model: FL Studio-style Channel Rack + Patterns + Playlist.
- 2026-06-25 — Time representation: ticks, seconds, bars/beats/ticks with sample-accurate offsets.
- 2026-06-25 — Plugin hosting model: in-process inside JUCE engine for v1.
- 2026-06-25 — Supported plugin formats: VST3, AU, CLAP, LV2, AAX.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Bun/Fastify)                   │
│                Zod-validated command envelopes                │
└──────────────────────────┬──────────────────────────────────┘
                           │ TCP / length-prefixed JSON
┌──────────────────────────▼──────────────────────────────────┐
│                   singularity-engine (JUCE)                  │
│  CommandServer ──► CommandQueue ──► Engine ──► AudioDevice   │
│                        │                                      │
│                        ▼                                      │
│              ┌─────────────────┐                            │
│              │  Project        │                            │
│              │  ├── ChannelRack│                            │
│              │  ├── Playlist   │                            │
│              │  └── Mixer      │                            │
│              └─────────────────┘                            │
│                        │                                      │
│         MeterRing ◄────┴────► PositionBroadcaster            │
└──────────────────────────┬──────────────────────────────────┘
                           │ lock-free metering + events
                    Backend WebSocket → UI
```

The engine is a standalone process. The Tauri desktop shell launches it as a sidecar; in the web app / server deployment the backend spawns it. The engine owns all audio-thread state. The backend sends commands and receives events over a single TCP connection. All realtime-safe communication uses lock-free structures.

### Data model

#### Shared protocol schemas (Zod, in `packages/shared`)

```ts
export const engineCommandSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
});

export const engineEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
});

export const audioDeviceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['input', 'output', 'duplex']),
  sampleRates: z.array(z.number().int()),
  bufferSizes: z.array(z.number().int()).optional(),
  defaultSampleRate: z.number().int(),
  inputChannels: z.number().int(),
  outputChannels: z.number().int(),
});

export const audioDeviceConfigSchema = z.object({
  deviceId: z.string(),
  sampleRate: z.number().int(),
  bufferSize: z.number().int(),
});

export const transportStateSchema = z.enum(['stopped', 'playing', 'recording', 'paused']);

export const transportPositionSchema = z.object({
  samples: z.number().int(),
  ticks: z.number().int(),
  bars: z.number().int(),
  beats: z.number().int(),
  sixteenths: z.number().int(),
  ticksInBeat: z.number().int(),
});

export const meterDataSchema = z.object({
  insertId: z.string(),
  peakDb: z.number(),
  rmsDb: z.number(),
  clipped: z.boolean(),
});
```

#### C++ core types

```cpp
namespace singularity {

constexpr int kDefaultPPQN = 960;
constexpr int kMeterBroadcastRateHz = 30;

struct TimeSignature {
  int numerator;
  int denominator;
};

struct TransportPosition {
  int64_t samples;
  int64_t ticks;
  int bars;
  int beats;
  int sixteenths;
  int ticksInBeat;
};

struct MeterSample {
  std::string insertId;
  float peakDb;
  float rmsDb;
  bool clipped;
};

enum class TransportState { stopped, playing, recording, paused };

} // namespace singularity
```

### API / interface

#### Engine lifecycle commands

| Command | Payload | Response |
|---------|---------|----------|
| `engine.ping` | `{}` | `{ "version": "1.0.0", "build": "..." }` |
| `engine.shutdown` | `{ "force": boolean }` | `{ "ok": true }` then process exits cleanly within 1000 ms |
| `engine.getStats` | `{}` | `{ "cpuPercent": number, "xruns": number }` |

#### Audio device commands

| Command | Payload | Response |
|---------|---------|----------|
| `audio.enumerateDevices` | `{}` | `{ "devices": AudioDeviceInfo[] }` |
| `audio.getCurrentDevice` | `{}` | `{ "config": AudioDeviceConfig, "latencyMs": number }` or `null` |
| `audio.setDevice` | `{ "config": AudioDeviceConfig }` | `{ "ok": true, "latencyMs": number }` or `{ "error": string }` |
| `audio.start` | `{}` | `{ "ok": true }` |
| `audio.stop` | `{}` | `{ "ok": true }` |

#### Transport commands

| Command | Payload | Response |
|---------|---------|----------|
| `transport.play` | `{ "fromStart": boolean }` | `{ "state": "playing" }` |
| `transport.stop` | `{ "rewind": boolean }` | `{ "state": "stopped", "position": TransportPosition }` |
| `transport.pause` | `{}` | `{ "state": "paused" }` |
| `transport.record` | `{ "fromStart": boolean }` | `{ "state": "recording" }` |
| `transport.seek` | `{ "samples": number }` or `{ "ticks": number }` | `{ "position": TransportPosition }` |
| `transport.setLoop` | `{ "enabled": boolean, "startSamples": number, "endSamples": number }` | `{ "ok": true }` |
| `transport.setTempo` | `{ "bpm": number }` | `{ "ok": true }` |
| `transport.setTimeSignature` | `{ "numerator": number, "denominator": number }` | `{ "ok": true }` |
| `transport.setSongMode` | `{ "songMode": boolean }` | `{ "ok": true }` |

#### Project model commands (foundational subset)

| Command | Payload | Response |
|---------|---------|----------|
| `project.load` | `{ "project": ProjectJson }` | `{ "ok": true }` |
| `project.unload` | `{}` | `{ "ok": true }` |
| `mixer.setInsertVolume` | `{ "insertId": string, "volumeDb": number }` | `{ "ok": true }` |
| `mixer.setInsertPan` | `{ "insertId": string, "pan": number }` | `{ "ok": true }` |
| `mixer.setInsertMute` | `{ "insertId": string, "mute": boolean }` | `{ "ok": true }` |
| `mixer.setInsertSolo` | `{ "insertId": string, "solo": boolean }` | `{ "ok": true }` |
| `channel.setOutput` | `{ "channelId": string, "targetId": string }` | `{ "ok": true }` |
| `pattern.setChannelData` | `{ "patternId": string, "channelId": string, "data": { "notes": Note[], "events": ParameterEvent[], "stepSequence"?: boolean[] } }` | `{ "ok": true }` |
| `playlist.addClip` | `{ "clip": Clip }` | `{ "ok": true }` |
| `playlist.removeClip` | `{ "clipId": string }` | `{ "ok": true }` |

#### Asynchronous events

| Event | Payload |
|-------|---------|
| `engine.ready` | `{ "version": string }` |
| `engine.error` | `{ "code": string, "message": string }` |
| `transport.positionChanged` | `{ "position": TransportPosition }` |
| `transport.stateChanged` | `{ "state": TransportState }` |
| `audio.xrun` | `{ "count": number }` |
| `meters.batch` | `{ "meters": MeterData[], "timestampSamples": number }` |

### C++ class signatures

```cpp
namespace singularity {

class CommandServer : public juce::Thread {
public:
  explicit CommandServer(Engine& engine, uint16_t port);
  void run() override;
  void broadcast(const nlohmann::json& event);
  uint16_t getBoundPort() const noexcept;
};

class CommandQueue {
public:
  static constexpr size_t kCapacity = 4096;
  bool push(nlohmann::json command) noexcept;
  bool pop(nlohmann::json& command) noexcept;
  size_t available() const noexcept;
};

class Transport {
public:
  void play(bool fromStart);
  void stop(bool rewind);
  void pause();
  void record(bool fromStart);
  void seekToSamples(int64_t samples);
  void seekToTicks(int64_t ticks);
  void setLoop(bool enabled, int64_t startSamples, int64_t endSamples);
  void setTempo(double bpm);
  void setTimeSignature(int numerator, int denominator);
  void setSongMode(bool songMode);

  TransportState getState() const noexcept;
  TransportPosition getPosition() const noexcept;
  void advance(int numSamples) noexcept;
};

class Engine : public juce::AudioIODeviceCallback {
public:
  Engine();
  ~Engine() override;

  bool initialize(uint16_t commandPort);
  void shutdown();

  // AudioIODeviceCallback
  void audioDeviceIOCallbackWithContext(
      const float* const* inputChannelData,
      int numInputChannels,
      float* const* outputChannelData,
      int numOutputChannels,
      int numSamples,
      const juce::AudioIODeviceCallbackContext& context) override;
  void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
  void audioDeviceStopped() override;

  std::vector<AudioDeviceInfo> enumerateDevices() const;
  bool setDevice(const AudioDeviceConfig& config);
  bool startAudio();
  bool stopAudio();

  void loadProject(const nlohmann::json& projectJson);
  void unloadProject();

private:
  std::unique_ptr<juce::AudioDeviceManager> deviceManager_;
  std::unique_ptr<CommandServer> commandServer_;
  std::unique_ptr<CommandQueue> commandQueue_;
  std::unique_ptr<Transport> transport_;
  std::unique_ptr<Project> project_;
  std::unique_ptr<MeteringBus> meteringBus_;

  void processCommands();
  void broadcastPosition();
  void broadcastMeters();
};

} // namespace singularity
```

### UI/UX

This spec defines no user-facing UI. It provides the engine API consumed by:
- Spec 33: Automation, MIDI, and Transport (transport toolbar and audio settings)
- Spec 29: Mixer and Routing Graph
- Spec 26: Channel Rack and Step Sequencer
- Spec 28: Playlist and Arrangement

Engine-driven visual feedback (meters, playhead) reaches the UI through the backend WebSocket events defined above.

### Algorithms / behavior

#### Command protocol

1. TCP server binds to `127.0.0.1` on the port supplied by `--port <n>` or, if `--port 0`, selects an ephemeral port and prints `SINGULARITY_PORT=<port>` to stdout before the backend connects.
2. Messages are length-prefixed big-endian `uint32` JSON payloads (UTF-8); no magic bytes. Maximum frame size is 16 MiB.
3. The backend sends one command per message; the engine replies with one response per command using the same `id`.
4. Asynchronous events use new generated `id`s and may interleave with responses.

#### Lock-free command queue

- A single-producer/single-consumer ring buffer of `4096` pre-allocated JSON slots using `juce::AbstractFifo` for index management.
- The backend thread is the producer; the audio callback thread is the consumer.
- If the queue fills, the backend blocks until space is available (engine-side consumer never blocks).
- If a command cannot be applied in the audio thread (e.g., plugin loading), it is deferred to a secondary non-realtime worker queue processed between callbacks.

#### Audio callback

```
processCommands()
updateTransport(numSamples)
if project loaded:
  project->process(audioBuffer, midiBuffer, position)
else:
  clear output buffers
write output
pushMeterSamples()
```

- All output channels are cleared when no project is loaded to avoid noise.
- The callback must complete within 50% of the buffer duration at any supported buffer size.

#### Transport timing

- Tick-to-sample conversion: `samples = ticks * 60.0 * sampleRate / (PPQN * bpm)`.
- Bars/beats are derived from the current time signature.
- In pattern mode, playback loops within the active pattern bounds. In song mode, playback follows Playlist clip positions.
- Loop boundaries are sample-accurate.

#### Metering

- Peak and RMS are computed per mixer insert over the last processed buffer.
- RMS uses a sliding mean-square window of 50 ms.
- Meters are written to a lock-free ring buffer and broadcast from a dedicated non-audio thread at 30 Hz.
- Clip detection triggers when any sample exceeds 0 dBFS.

## Implementation plan

1. Create `engine/` CMake project with JUCE 8 dependency and `singularity-engine` executable target.
2. Implement `CommandServer` and length-prefixed JSON framing, plus integration test against a Python or Bun TCP client.
3. Implement `CommandQueue` with `juce::AbstractFifo` and unit test under producer/consumer stress.
4. Wrap `juce::AudioDeviceManager` in `Engine::enumerateDevices`, `setDevice`, `startAudio`, `stopAudio`.
5. Implement `Transport` state machine, timing conversion, and position broadcast.
6. Implement in-memory `Project`, `ChannelRack`, `Pattern`, `Playlist`, and `Mixer` shells that render silence or pass test audio.
7. Implement realtime audio callback wiring command processing, transport advance, project processing, and meter push.
8. Implement `MeteringBus` and 30 Hz broadcast thread.
9. Add Tauri sidecar packaging and launch wiring in `packages/desktop` (coordinated with Spec 17 and Spec 25).
10. Add backend engine bridge in `packages/backend` (coordinated with Spec 23).

## Testing strategy

- Unit tests (C++ / Catch2): time conversion, transport advance, command queue stress, meter RMS/peak math.
- Integration tests: engine binary starts and responds to `engine.ping`; device enumeration returns at least one output device; `audio.setDevice` succeeds and reports latency; transport play advances position; transport seek lands on exact sample; 1000 rapid transport commands enqueue without xruns.
- Audio loopback test (manual/CI where hardware allows): generate a sine wave in a test pattern, route to output, verify peak meter reports expected level.
- E2E test (coordinated with Spec 23): backend spawns engine, sends a command, receives a response over TCP, and forwards a meter event to the UI over WebSocket.

## Acceptance criteria

- [ ] `engine/` builds the `singularity-engine` executable on macOS (Intel + Apple Silicon) and Linux x64 without warnings treated as errors.
- [ ] Engine prints `SINGULARITY_PORT=<port>` and accepts a TCP connection within 1 second of launch.
- [ ] `engine.ping` returns a response containing a semantic version string within 50 ms.
- [ ] `audio.enumerateDevices` returns at least one output device with a non-empty `sampleRates` array.
- [ ] `audio.setDevice` with a valid configuration activates the device and returns `latencyMs` as a positive number.
- [ ] `audio.start` followed by `transport.play` causes `transport.positionChanged` events to advance monotonically.
- [ ] `transport.stop` with `rewind: true` resets position to sample 0; `rewind: false` preserves current position.
- [ ] `transport.seek` to an arbitrary sample value results in the next `transport.positionChanged` event reporting exactly that sample.
- [ ] 1000 sequential transport/tempo commands pushed at 1 ms intervals do not produce any `audio.xrun` event.
- [ ] `meters.batch` events arrive at 25–35 Hz when at least one mixer insert exists and audio is running.
- [ ] Tempo change from 120 BPM to 140 BPM during playback changes the tick-to-sample rate and is reflected in subsequent position events.
- [ ] `project.load` with a minimal project JSON containing one pattern, one note, and one mixer insert completes without error.
- [ ] Engine process exits with code 0 within 1000 ms of `engine.shutdown { force: false }`.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture
- Spec 18: Monorepo and Build System
- Spec 19: Shared Protocol and Schemas

## Blocks

- Spec 21: Plugin Hosting and Scanner
- Spec 22: Project Model and .singularity Bundle Format
- Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)
- Spec 26: Channel Rack and Step Sequencer
- Spec 27: Piano Roll
- Spec 28: Playlist and Arrangement
- Spec 29: Mixer and Routing Graph
- Spec 30: Browser, Plugin Database, and Presets
- Spec 31: Stock Instruments and Effects
- Spec 32: Audio Recording and Editing
- Spec 33: Automation, MIDI, and Transport
- Spec 34: Export, Rendering, and AI Mastering
- Spec 35: AI Agent System

## Notes / open questions

- Decision made in this spec: command transport is 4-byte big-endian length-prefixed `uint32` JSON over TCP, no magic bytes, max frame size 16 MiB. Alternatives (newline-delimited JSON, gRPC) were rejected to keep parsing trivial and avoid dependencies in the engine.
- Decision made in this spec: default PPQN is 960, matching common DAW convention. This can be raised per-project in future versions.
- Decision made in this spec: metering broadcast rate is fixed at 30 Hz; the UI must interpolate visually if smoother motion is desired.
- Decision made in this spec: the engine uses a single-producer/single-consumer lock-free command queue of 4096 slots. If larger bursts are needed, the backend must batch commands.
- Decision made in this spec: plugin loading and other non-realtime state mutations are deferred to a worker thread that completes between audio callbacks; commands affecting the audio graph are applied atomically at the start of the next callback.
- A future decision may allow the engine to bind to a Unix domain socket on macOS/Linux for lower latency; the TCP framing remains identical.
