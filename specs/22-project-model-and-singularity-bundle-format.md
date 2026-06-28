# Spec 22: Project Model and .singularity Bundle Format

## Objective

Define the canonical in-memory project model and the native `.singularity` ZIP bundle persistence format for Singularity v1.0, including versioning, asset packaging, plugin state blobs, agent sessions, autosave, crash recovery, templates, and recent-project bookkeeping.

## Motivation

Singularity v1.0 must ship a single, portable project container that all subsystems—UI panels, the JUCE engine, the AI agent, and external tooling—agree on. Without a locked model and bundle format, Channel Rack / Playlist / Mixer state, plugin presets, recordings, samples, and agent history cannot be saved, reopened, or transported reliably across macOS, Linux, and web builds. This spec provides the shared contract that makes save/load, autosave, recovery, and template workflows deterministic.

## Scope

### In scope

- Canonical in-memory project model (Channel Rack, Patterns, Playlist, Mixer, routing graph, automation, plugin instances, assets, agent sessions).
- `.singularity` ZIP bundle layout, compression, manifest, and file naming conventions.
- Backend `ProjectService` API for creating, opening, saving, autosaving, recovering, validating, importing assets, and exporting bundles.
- Fastify HTTP routes and WebSocket events for project lifecycle.
- Engine bridge commands used to load/unload/apply project state.
- Versioning and migration hooks for the bundle format.
- Recent-project list and built-in project templates.
- Asset deduplication by content hash and project-relative path resolution.

### Out of scope

- FLP import/export (covered by a future FLP migration spec).
- MIDI file export of patterns / full project (covered by the MIDI spec).
- Stem export / track bouncing (covered by the export/rendering spec).
- Detailed DSP behavior of stock plugins or hosted third-party plugins.
- UI panel rendering for the Channel Rack, Playlist, Mixer, etc. (covered by Specs 26–30).
- Agent skill definitions and natural-language command parsing (covered by Spec 35).

## Related decisions

All entries in `docs/decisions.md` from 2026-06-25, especially:

- App and project rename to Singularity / `.singularity`.
- Project model: FL Studio-style Channel Rack + Patterns + Playlist.
- Time representation: ticks (PPQN), seconds, and bars/beats/ticks.
- Project file format: native `.singularity` ZIP bundle with JSON + assets + plugin states.
- Quality bar: no stubs, no MVPs, no placeholders; acceptance criteria must be binary and verifiable.
- Backend framework: Fastify + `@fastify/websocket`.
- Backend-to-engine transport: local TCP/socket command protocol.
- AI agent context: agent receives full project context and can drive any feature.
- VS Code extension dropped from v1.0.

## Detailed design

### Subsystem overview

```
┌──────────────────────────────────────────────────────────────┐
│                         UI Layer                              │
│  React + Zustand observe project state via HTTP / WebSocket   │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼───────────────────────────────────┐
│              Backend ProjectService (Bun/Fastify)             │
│  • canonical in-memory Project graph                          │
│  • `.singularity` bundle read/write (JSZip)                   │
│  • autosave / recovery / templates / recent projects          │
└──────────────────────────┬───────────────────────────────────┘
                           │ local TCP/socket project.* commands
┌──────────────────────────▼───────────────────────────────────┐
│                    JUCE Engine (C++)                          │
│  • receives ProjectSnapshot on load                           │
│  • applies incremental ProjectEdit commands                   │
└──────────────────────────────────────────────────────────────┘
```

The backend is the single source of truth for project state. The engine receives a deterministic `ProjectSnapshot` sufficient to render audio, and the UI receives DTOs derived from the same canonical model. All persistence operations go through `ProjectService`.

### Time representation

The canonical musical time unit is the **tick**, with a fixed resolution of **960 PPQN** (pulses per quarter note). All note, pattern, clip, and automation positions are stored as integer ticks. Audio clips additionally store sample-frame-accurate offsets.

```ts
export const PPQN = 960 as const;

export type Tick = number & { __brand: 'Tick' };
export type SampleFrame = number & { __brand: 'SampleFrame' };

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface MusicalTime {
  bars: number;
  beats: number;
  ticks: number;
}

export function ticksPerBeat(): number {
  return PPQN;
}

export function ticksPerBar(timeSignature: TimeSignature): number {
  return PPQN * (4 / timeSignature.denominator) * timeSignature.numerator;
}

export function musicalTimeToTicks(time: MusicalTime, timeSignature: TimeSignature): Tick {
  return (time.bars * ticksPerBar(timeSignature) +
          time.beats * ticksPerBeat() +
          time.ticks) as Tick;
}
```

### Data model

All types below have matching Zod schemas in `packages/shared/src/schemas/project.ts`. Schemas are strict: unknown keys are rejected.

#### Top-level project

```ts
export interface Project {
  id: string;                 // uuid v4
  name: string;
  createdAt: string;          // ISO 8601
  modifiedAt: string;         // ISO 8601
  bpm: number;                // 1.0 <= bpm <= 999.99
  timeSignature: TimeSignature;
  sampleRate: 44100 | 48000 | 88200 | 96000;
  settings: ProjectSettings;
  channelRack: ChannelRack;
  patterns: Pattern[];
  playlist: Playlist;
  mixer: Mixer;
  routing: RoutingGraph;
  automationClips: AutomationClip[];
  assets: Asset[];
  sessions: AgentSession[];
  // Plugin instances are nested inside channelRack.channels[].settings.plugin
  // and mixer.inserts[].pluginSlots[].plugin. There is no top-level
  // pluginInstances or automationTargets array.
}

export interface ProjectSettings {
  audioBufferSize: number;    // 16..8192 samples
  defaultTemplateId?: string;
}
```

#### Channel Rack

```ts
export interface ChannelRack {
  channels: Channel[];
  groups: ChannelGroup[];
  selectedChannelId?: string;
}

export interface ChannelGroup {
  id: string;
  name: string;
  color: string;              // #RRGGBB
  collapsed: boolean;
  channelIds: string[];
}

export type ChannelType =
  | 'sampler'
  | 'vstInstrument'
  | 'audioClip'
  | 'layer'
  | 'midiOut';

export interface Channel {
  id: string;
  name: string;
  color: string;
  index: number;              // vertical order, 0-based
  type: ChannelType;
  mute: boolean;
  solo: boolean;
  volume: number;             // normalized linear 0–1; 0.78 ≈ −2 dB
  pan: number;                // -1.0 (left) to 1.0 (right)
  pitch: number;              // cents, -1200 to 1200
  output: { insertId: string }; // default { insertId: 'master' }
  settings:
    | SamplerChannelSettings
    | VstInstrumentChannelSettings
    | AudioClipChannelSettings
    | LayerChannelSettings
    | MidiOutChannelSettings;
}

export interface SamplerChannelSettings {
  kind: 'sampler';
  sampleAssetId: string;
  envelope: ADSREnvelope;
  filter: FilterSettings;
  loop: SampleLoopSettings;
  timeStretch: TimeStretchSettings;
  polyphony: number;          // 1 to 256
}

export interface VstInstrumentChannelSettings {
  kind: 'vstInstrument';
  plugin: PluginInstance;
}

export interface AudioClipChannelSettings {
  kind: 'audioClip';
  defaultAssetId: string;
}

export interface LayerChannelSettings {
  kind: 'layer';
  childChannelIds: string[];
}

export interface MidiOutChannelSettings {
  kind: 'midiOut';
  deviceId?: string;
  channel: number;            // 1–16
}
```

Supporting types:

```ts
export interface ADSREnvelope {
  attackSec: number;
  decaySec: number;
  sustain: number;            // 0–1
  releaseSec: number;
}

export interface FilterSettings {
  type: 'lowPass' | 'highPass' | 'bandPass' | 'notch';
  cutoffHz: number;
  resonance: number;          // 0–1
}

export interface SampleLoopSettings {
  enabled: boolean;
  startSample: SampleFrame;
  endSample: SampleFrame;
}

export interface TimeStretchSettings {
  enabled: boolean;
  preservePitch: boolean;
  ratio: number;              // 0.25 to 4.0
}
```

#### Patterns

```ts
export interface Pattern {
  id: string;
  name: string;
  color: string;
  lengthTicks: Tick;          // must be a positive multiple of ticksPerBeat
  channelData: Record<string, PatternChannelData>;
}

export interface PatternChannelData {
  notes: Note[];
  events: ParameterEvent[];   // per-parameter event automation inside pattern
  stepSequence?: boolean[];    // per-channel step sequence (optional)
}

export interface Note {
  id: string;
  startTick: Tick;
  durationTicks: Tick;
  key: number;                // MIDI note number, 0–127
  velocity: number;           // 0–127
  pan: number;                // -1.0 to 1.0
  releaseVelocity?: number;
  color?: string;
}

export interface ParameterEvent {
  target: AutomationTarget;
  tick: Tick;
  value: number;
  curve: 'linear' | 'smooth' | 'hold';
}
```

#### Playlist

```ts
export interface Playlist {
  tracks: PlaylistTrack[];
  markers: Marker[];
  timeSignatureChanges: TimeSignatureChange[];
  tempoChanges: TempoChange[];
}

export type PlaylistTrackType = 'pattern' | 'audio' | 'automation' | 'video';

export interface PlaylistTrack {
  id: string;
  name: string;
  color: string;
  type: PlaylistTrackType;
  mute: boolean;
  solo: boolean;
  recordArm: boolean;
  height: number;             // pixels at 100% UI scale
  clips: Clip[];
}

export interface Marker {
  id: string;
  tick: Tick;
  name: string;
  color: string;
}

export interface TimeSignatureChange {
  tick: Tick;
  timeSignature: TimeSignature;
}

export interface TempoChange {
  tick: Tick;
  bpm: number;
}

export interface ClipBase {
  id: string;
  trackId: string;
  startTick: Tick;
  durationTicks: Tick;
  offsetTicks: Tick;          // start offset within the source content
  loop: boolean;
  name: string;
  color: string;
  mute: boolean;
}

export type Clip = PatternClip | AudioClip | AutomationClip | VideoClip;

export interface PatternClip extends ClipBase {
  type: 'pattern';
  patternId: string;
}

export interface AudioClip extends ClipBase {
  type: 'audio';
  assetId: string;
  gainDb: number;
  fadeIn: Fade;
  fadeOut: Fade;
  pitch: number;              // cents
  timeStretchRatio: number;
}

export interface Fade {
  type: 'linear' | 'logarithmic' | 'exponential' | 'sCurve';
  durationTicks: Tick;
}

export interface AutomationClip extends ClipBase {
  type: 'automation';
  target: AutomationTarget;
  points: AutomationPoint[];
}

export interface VideoClip extends ClipBase {
  type: 'video';
  assetId: string;
}
```

#### Mixer and routing graph

```ts
export interface Mixer {
  inserts: Insert[];          // exactly one insert has id === 'master' and kind === 'master'
}

export type InsertKind = 'normal' | 'send' | 'master';

export interface Insert {
  id: string;
  name: string;
  color: string;
  kind: InsertKind;
  volumeDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  recordArm: boolean;
  inputSource: AudioInputSource | null;
  outputTargetId: string | null;
  pluginSlots: PluginSlot[];  // up to 10 slots per insert
  sends: Send[];              // up to 16 sends per insert
}

export interface AudioInputSource {
  deviceInputIndex: number;
  label: string;
}

export interface PluginSlot {
  slotIndex: number;          // 0–9
  plugin?: PluginInstance;
  bypass: boolean;
  sidechainSourceIds?: string[];
}

export interface Send {
  targetInsertId: string;
  levelDb: number;
  preFader: boolean;
  active: boolean;
}

export interface RoutingGraph {
  nodes: RackNode[];
  edges: RackEdge[];
}

export type RackNodeType = 'insert' | 'plugin' | 'hardwareInput' | 'masterOutput';

export interface RackNode {
  id: string;
  type: RackNodeType;
  entityId: string;           // insert.id, pluginInstance.id, or system I/O id
  x: number;
  y: number;
  ports: RackPort[];
}

export interface RackPort {
  id: string;
  kind: 'audioIn' | 'audioOut' | 'sidechainIn' | 'sidechainOut' | 'sendOut';
  label?: string;
}

export type RackEdgeKind = 'output' | 'send' | 'sidechain';

export interface RackEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  kind: RackEdgeKind;
}
```

#### Automation

```ts
export interface AutomationTarget {
  type: 'channelParam' | 'pluginParam' | 'mixerParam' | 'transportParam';
  entityId: string;
  parameterId: string;
}

export interface AutomationPoint {
  tick: Tick;
  value: number;
  curve: 'linear' | 'smooth' | 'hold';
}
```

#### Plugin instances

```ts
export type PluginFormat = 'vst3' | 'au' | 'clap' | 'lv2' | 'aax';

export interface PluginInstance {
  id: string;
  descriptorId: string;       // stable id from plugin database
  name: string;
  vendor: string;
  version: string;
  format: PluginFormat;
  stateBlobBase64?: string;   // base64-encoded plugin binary state chunk
  parameters: Record<string, number>;
  delaySamples: number;
}
```

#### Assets

```ts
export type AssetKind =
  | 'audio'
  | 'video'
  | 'image'
  | 'midi'
  | 'preset'
  | 'soundfont'
  | 'thumbnail'
  | 'pluginState'
  | 'other';

export interface Asset {
  id: string;                 // uuid v4
  path: string;               // project-relative path inside bundle
  name: string;
  originalFileName?: string;
  kind: AssetKind;
  mimeType: string;
  sha256: string;             // hex digest of file bytes
  sampleRate?: number;
  channels?: number;
  durationSeconds?: number;
}
```

#### Agent sessions

```ts
export interface AgentSession {
  id: string;
  name: string;
  createdAt: string;          // ISO 8601
  updatedAt: string;
  messages: ChatMessage[];
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;          // ISO 8601
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

### Bundle layout

A `.singularity` file is a ZIP archive using **Deflate** compression. Entry names use forward slashes and must not contain `..` or absolute paths.

```
project.singularity
├── meta.json
├── project.json
├── assets/
│   ├── audio/<assetId>.<ext>
│   ├── video/<assetId>.<ext>
│   ├── images/<assetId>.<ext>
│   ├── thumbnails/<assetId>.png
│   └── midi/<assetId>.mid
├── plugin-states/
│   └── <stateBlobId>.bin
└── sessions/
    └── <sessionId>.json
```

`meta.json` holds bundle-level metadata and integrity data:

```ts
export interface BundleMeta {
  format: 'singularity';
  version: '1.0.0';
  projectId: string;
  projectName: string;
  createdAt: string;          // ISO 8601
  modifiedAt: string;
  savedBy: string;            // e.g. "singularity/1.0.0"
  compression: 'deflate';
  checksums: {
    projectJson: string;      // sha256 of project.json bytes
  };
}
```

`project.json` is the canonical model described in the Data model section. It contains only JSON-serializable values and project-relative `path` strings for externalized blobs.

### API / interface

#### Backend service

```ts
export interface ProjectServiceConfig {
  storageRoot: string;              // e.g. /Users/<user>/Singularity
  recoverySubdir: string;           // default 'recovery'
  templatesSubdir: string;          // default 'templates'
  autosaveDebounceMs: number;       // default 2000
  autosaveQuietPeriodMs: number;    // default 30000
  recentProjectsMax: number;        // default 50
}

export interface CreateProjectInput {
  name: string;
  templateId?: string;              // 'empty' if omitted
  settings?: Partial<ProjectSettings>;
}

export interface ImportAssetOptions {
  copy?: boolean;                   // default true
  kind?: AssetKind;
  suggestedName?: string;
}

export interface ProjectSession {
  projectId: string;
  filePath?: string;                // undefined until first save
  project: Project;
  dirty: boolean;
  lastSavedAt?: string;
}

export interface RecoveryFile {
  recoveryPath: string;
  projectId: string;
  projectName: string;
  createdAt: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
}

export interface RecentProject {
  filePath: string;
  projectId: string;
  name: string;
  lastOpenedAt: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  filePath: string;
}

export class ProjectService {
  constructor(deps: {
    engineBridge: EngineBridge;
    storage: ProjectStorage;
    config: ProjectServiceConfig;
  });

  async create(input: CreateProjectInput): Promise<ProjectSession>;
  async open(filePath: string): Promise<ProjectSession>;
  async close(projectId: string, options?: { save?: boolean }): Promise<void>;
  async save(projectId: string): Promise<string>;                // returns final filePath
  async saveAs(projectId: string, filePath: string): Promise<string>;
  async autosave(projectId: string): Promise<string>;            // returns recoveryPath
  async listRecoveryFiles(): Promise<RecoveryFile[]>;
  async recover(recoveryPath: string): Promise<ProjectSession>;
  async validateBundle(filePath: string): Promise<ValidationReport>;
  async importAsset(
    projectId: string,
    sourcePath: string,
    options?: ImportAssetOptions,
  ): Promise<Asset>;
  async exportBundle(projectId: string, destPath: string): Promise<string>;
  async createFromTemplate(templateId: string, name: string): Promise<ProjectSession>;
  async addChatMessage(
    projectId: string,
    sessionId: string,
    message: ChatMessage,
  ): Promise<void>;

  getRecentProjects(): RecentProject[];
  getTemplates(): ProjectTemplate[];
}
```

`ProjectStorage` is the file-system abstraction used by `ProjectService`:

```ts
export interface ProjectStorage {
  readBundle(filePath: string): Promise<SingularityBundle>;
  writeBundle(filePath: string, bundle: SingularityBundle): Promise<void>;
  deleteBundle(filePath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  ensureDirectory(dirPath: string): Promise<void>;
  listFiles(dirPath: string): Promise<string[]>;
  hashFile(filePath: string): Promise<string>; // sha256 hex
}
```

#### HTTP endpoints

All endpoints are prefixed with `/api/v1/projects`. Request and response bodies are validated with Zod.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/create` | `CreateProjectInput` | `ProjectSessionDTO` |
| POST | `/open` | `{ filePath: string }` | `ProjectSessionDTO` |
| POST | `/:projectId/save` | — | `{ filePath: string }` |
| POST | `/:projectId/save-as` | `{ filePath: string }` | `{ filePath: string }` |
| POST | `/:projectId/import-asset` | `{ sourcePath: string, copy?: boolean, kind?: AssetKind, suggestedName?: string }` | `AssetDTO` |
| GET | `/recent` | — | `RecentProject[]` |
| GET | `/templates` | — | `ProjectTemplate[]` |
| POST | `/recover` | `{ recoveryPath: string }` | `ProjectSessionDTO` |
| POST | `/validate` | `{ filePath: string }` | `ValidationReport` |

#### WebSocket events

Events are JSON envelopes `{ id, type, payload }` with payloads validated by Zod.

| Direction | Event | Payload |
|---|---|---|
| Server → Client | `project.created` | `ProjectSessionDTO` |
| Server → Client | `project.opened` | `ProjectSessionDTO` |
| Server → Client | `project.saved` | `{ projectId, filePath, modifiedAt }` |
| Server → Client | `project.autosaved` | `{ projectId, recoveryPath }` |
| Server → Client | `project.recovered` | `ProjectSessionDTO` |
| Server → Client | `project.closed` | `{ projectId }` |
| Server → Client | `project.changed` | `{ projectId, version: number }` |
| Client → Server | `project.requestChange` | `ProjectEdit` |

#### Engine bridge commands

The backend sends the following commands to the JUCE engine over the local TCP/socket protocol:

| Command | Payload | Response |
|---|---|---|
| `project.load` | `ProjectSnapshot` | `{ status: 'ok' \| 'error', error?: string }` |
| `project.unload` | `{ projectId: string }` | `{ status: 'ok' }` |
| `project.apply` | `ProjectEdit` | `{ status: 'ok' \| 'error', error?: string }` |

`ProjectSnapshot` is the engine-serializable subset of the project:

```ts
export interface ProjectSnapshot {
  projectId: string;
  settings: ProjectSettings;
  channelRack: ChannelRack;
  patterns: Pattern[];
  playlist: Playlist;
  mixer: Mixer;
  routing: RoutingGraph;
  automationClips: AutomationClip[];
  assets: Asset[];
  resolvedAssetPaths: Record<string, string>; // asset.id -> absolute filesystem path
}
```

`ProjectEdit` is a union of fine-grained mutations used for incremental sync:

```ts
export type ProjectEdit =
  | { op: 'channel.add'; channel: Channel }
  | { op: 'channel.remove'; channelId: string }
  | { op: 'pattern.add'; pattern: Pattern }
  | { op: 'pattern.setChannelData'; patternId: string; channelId: string; data: PatternChannelData }
  | { op: 'playlist.clip.add'; clip: Clip }
  | { op: 'playlist.clip.remove'; clipId: string }
  | { op: 'mixer.insert.update'; insert: Insert }
  | { op: 'plugin.stateChanged'; instanceId: string; stateBlobBase64?: string }
  | { op: 'automation.clip.update'; clip: AutomationClip }
  | { op: 'settings.update'; settings: Partial<ProjectSettings> };
```

### UI/UX

- **New project dialog**: lists templates; default template is `empty`.
- **Save / Save As**: standard native file dialogs (Tauri) or browser download (web app). Save As is required for the first save of an unsaved project.
- **Autosave indicator**: status bar shows "Autosaved <time ago>" after each recovery bundle is written; disabled during active playback if configured.
- **Recovery dialog**: on backend startup, if recovery files exist, present a modal listing project name, timestamp, and original path; user chooses a recovery to open or discard.
- **Recent projects**: startup screen and File menu list the last 50 opened/saved projects; selecting one calls `open`.
- **Templates browser**: user can create from built-in templates or save the current project as a template.

### Algorithms / behavior

#### Save flow

1. Validate the in-memory `Project` against `ProjectSchema`.
2. Collect all assets and plugin-state blobs referenced by the model.
3. Write to a temporary file `<target>.<uuid>.tmp`.
4. Validate the temporary bundle with `validateBundle()`.
5. Atomically rename the temporary file to the target path.
6. Update `recent.json`, clear the dirty flag, and emit `project.saved`.

#### Load flow

1. Read and validate `meta.json` and `project.json`.
2. Verify the SHA-256 of `project.json` against `meta.json.checksums.projectJson`.
3. Confirm every referenced asset and plugin-state file exists in the bundle.
4. Extract blobs to a project working directory.
5. Construct the canonical `Project` and a `ProjectSnapshot`.
6. Send `project.load` to the engine.
7. Emit `project.opened`.

#### Autosave

- Edits debounce for `autosaveDebounceMs` (default 2000 ms).
- A full autosave is also forced every `autosaveQuietPeriodMs` (default 30000 ms) when the project is dirty, even without new edits.
- Autosave writes a `.singularity` recovery bundle to `<storageRoot>/<recoverySubdir>/<projectId>/<iso-timestamp>.singularity`.
- Recovery files older than 30 days are pruned on startup.
- Autosave runs in the background and must not block the HTTP/WebSocket response for more than 100 ms.

#### Asset import and deduplication

1. Compute SHA-256 of the source file.
2. If an asset with the same hash already exists in the project, return the existing asset and do not copy the file again.
3. Otherwise generate a UUID, determine the subdirectory from `kind` or MIME type, copy the file to `assets/<subdirectory>/<assetId>.<ext>`, and create the `Asset` record.
4. For audio assets, the backend computes `sampleRate`, `channels`, and `durationSeconds` using a WAV/AIFF/FLAC parser.

#### Migration

- `ProjectSchema` includes a `version` field fixed at `'1.0.0'` for v1.0.
- On open, if `meta.json.version` is older than the app version, the backend runs a registered migration chain `1.0.0 → current` before constructing `Project`.
- If no migration exists for the detected version, `open()` rejects with a clear error and the bundle is not loaded.

## Implementation plan

1. Define all Zod schemas and TypeScript types in `packages/shared/src/schemas/project.ts` and `packages/shared/src/types/project.ts`.
2. Implement `SingularityBundleReader` and `SingularityBundleWriter` in `packages/backend/src/project/bundle.ts` using `JSZip`.
3. Implement `ProjectStorage` backed by `Bun.file` / `node:fs` in `packages/backend/src/project/storage.ts`.
4. Implement `ProjectService` in `packages/backend/src/project/ProjectService.ts` with save/load/autosave/recovery/validation logic.
5. Add Fastify routes in `packages/backend/src/routes/projects.ts` and WebSocket event handlers in `packages/backend/src/ws/projectEvents.ts`.
6. Implement engine bridge `project.load` / `project.unload` / `project.apply` serialization in `packages/backend/src/engine/projectSnapshot.ts`.
7. Add built-in templates (`empty`, `4-bar-house`) as committed `.singularity` bundles under `packages/backend/templates/`.
8. Write unit, integration, and E2E tests.

## Testing strategy

- **Unit tests**:
  - Zod schema strictness for `Project`, `BundleMeta`, and every subtype.
  - Time conversion functions (`ticksPerBar`, `musicalTimeToTicks`).
  - Asset deduplication by SHA-256.
  - Migration identity (no-op for `1.0.0`).

- **Integration tests**:
  - Save a project, reopen it, and assert the restored `Project` deep-equals the original.
  - Validate that a corrupted bundle (missing `meta.json`, missing asset, bad checksum, path traversal entry) returns `valid: false` with a specific error.
  - Autosave triggers within the configured debounce window and produces a recoverable bundle.
  - Importing the same sample twice returns the same `Asset.id`.
  - Every HTTP endpoint returns payloads that pass the shared Zod response schemas.

- **E2E tests**:
  - Create a project from the empty template, add a sampler channel with a dropped sample, save, close, reopen, and verify the channel and asset are present.
  - Recovery flow: force-kill the backend mid-edit, restart, open the recovery dialog, and restore the project.

## Acceptance criteria

- [ ] A `.singularity` bundle produced by `ProjectService.save()` is a valid ZIP archive using Deflate compression and contains `meta.json` and `project.json` at the root.
- [ ] `project.json` validates against the shared strict Zod `ProjectSchema` with no unknown keys accepted.
- [ ] Every `asset.path` referenced in `project.json` resolves to an existing file inside the bundle under `assets/`, `plugin-states/`, or `sessions/`.
- [ ] Every non-null `pluginInstance.stateBlobId` has a corresponding `plugin-states/<stateBlobId>.bin` file in the bundle.
- [ ] `meta.json.checksums.projectJson` equals the SHA-256 of the `project.json` bytes in the same bundle.
- [ ] `ProjectService.open()` on a previously saved bundle restores an in-memory `Project` that deep-equals the original saved project, excluding only `meta.json` timestamps.
- [ ] `ProjectService.save()` writes the bundle atomically: the target path is replaced only after the temporary file is fully written and validated.
- [ ] `ProjectService.autosave()` writes a recovery bundle within `autosaveDebounceMs + 500 ms` of the last edit and returns a path under `<storageRoot>/<recoverySubdir>/<projectId>/`.
- [ ] `ProjectService.recover()` loads a recovery bundle and emits a `project.recovered` WebSocket event containing the restored project ID.
- [ ] `ProjectService.validateBundle()` returns `valid: false` when any of the following are true: `meta.json` is missing, `project.json` is missing, the ZIP contains an entry with `..` or an absolute path, or any referenced asset/plugin-state file is missing.
- [ ] `ProjectService.importAsset()` copies a source file into `assets/<subdirectory>/<assetId>.<ext>` and returns an `Asset` whose `sha256` matches the source file; importing a file with the same SHA-256 twice returns the same `Asset.id` without duplicating bytes.
- [ ] The backend exposes every HTTP endpoint and WebSocket event listed in the API section, and all request/response payloads are validated by the shared Zod schemas.
- [ ] The project model contains at least the Channel Rack, Patterns, Playlist, Mixer, Routing graph, automation clips, assets, and agent sessions defined in the Data model section. Plugin instances are nested inside channel settings and mixer plugin slots; there is no top-level pluginInstances or automationTargets array.
- [ ] The recent-projects list persists to `<storageRoot>/recent.json`, retains the most recent 50 entries, and is returned unchanged by `GET /api/v1/projects/recent`.
- [ ] The backend ships with at least two built-in templates (`empty` and `4-bar-house`) that each pass `validateBundle()`.
- [ ] The engine receives a `project.load` command containing a `ProjectSnapshot` within 500 ms of `ProjectService.open()` completing.

## Dependencies

- Requires **Spec 17: Singularity v1.0 Standalone App Architecture** — defines the monorepo layout, backend, engine, and communication paths this spec builds on.
- Requires **Spec 19: Shared Protocol and Schemas** — provides the Zod/TypeScript infrastructure used for all project messages.

## Blocks

- **Spec 20: JUCE Audio Engine Foundation** — needs the `ProjectSnapshot` and `ProjectEdit` contracts defined here.
- **Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)** — builds the remaining backend surface on top of `ProjectService`.
- **Spec 26: Channel Rack and Step Sequencer** — reads and mutates `ChannelRack` state.
- **Spec 27: Piano Roll** — reads and mutates `Pattern.notes` and `Pattern.stepData`.
- **Spec 28: Playlist and Arrangement** — reads and mutates `Playlist` clips and tracks.
- **Spec 29: Mixer and Routing Graph** — reads and mutates `MixerGraph` and `RoutingGraph`.
- **Spec 30: Browser, Plugin Database, and Presets** — imports assets and creates plugin instances that become part of the project model.
- **Spec 35: AI Agent System** — reads the full project context and writes agent sessions into the bundle.

## Notes / open questions

### Decisions made in this spec

The following design choices are not present in `docs/decisions.md` and are locked by this spec:

1. **Bundle directory layout**: assets are organized under `assets/audio/`, `assets/video/`, `assets/images/`, `assets/thumbnails/`, and `assets/midi/`; plugin state blobs live under `plugin-states/`; agent chat sessions live under `sessions/`.
2. **Canonical PPQN**: musical time is stored at **960 PPQN** for the v1.0 format.
3. **Asset identity**: each asset receives a UUID filename and is deduplicated across the project by SHA-256 content hash.
4. **Plugin state storage**: plugin state is opaque binary data stored as `plugin-states/<stateBlobId>.bin` and referenced by `pluginInstance.stateBlobId`.
5. **Thumbnails**: audio and video assets have a PNG thumbnail generated at import time and stored at `assets/thumbnails/<assetId>.png`.
6. **Recovery path**: recovery bundles are written to `<storageRoot>/recovery/<projectId>/<ISO-timestamp>.singularity` and pruned after 30 days.
7. **Atomic save**: saves are written to a temporary file and renamed into place only after validation succeeds.
8. **Templates storage**: built-in and user templates are themselves valid `.singularity` bundles stored under `<storageRoot>/templates/`.
9. **Recent projects storage**: recent projects are persisted as JSON at `<storageRoot>/recent.json` with a maximum of 50 entries.
10. **Strict schemas**: all project JSON schemas are strict and reject unknown keys to catch serialization drift early.
