# Spec 34: Export, Rendering, and AI Mastering

## Objective

Define the complete export, offline/real-time rendering, track freeze/bounce, stem export, and AI mastering pipeline for Singularity v1.0, from user-facing UI through the JUCE engine to the agent skill surface.

## Motivation

A DAW is judged by its ability to turn a project into finished audio. Singularity must render the Channel Rack + Pattern + Playlist + Mixer graph into industry-standard formats (WAV, FLAC, OGG, MP3), produce split-track stems, freeze heavy tracks to audio, and let the AI agent master a project using full project context and tool skills.

## Scope

### In scope

- Export to WAV (16/24/32-bit float), FLAC (16/24), OGG Vorbis (quality 0–10), and MP3.
- Sample rates: 44.1, 48, 88.2, 96 kHz.
- Export ranges: full project, current selection, loop region.
- Split mixer tracks / stem export.
- Normalize and dither options.
- Real-time export option for plugins/instruments that require it.
- Render progress events and cancellation.
- Track/channel freeze and bounce-to-audio.
- AI mastering via the agent using project context and skills.

### Out of scope

- Distribution service integration (covered by `docs/decisions.md` as out of v1.0).
- Video-only export or video encoding.
- External online mastering services.
- ReWire export.
- 32-bit plugin bridge rendering.

## Related decisions

- 2026-06-25 — Export and mastering in v1.0 (`docs/decisions.md`).
- 2026-06-25 — JUCE C++ native engine as a Tauri sidecar.
- 2026-06-25 — Project model: Channel Rack + Patterns + Playlist.
- 2026-06-25 — Time representation: ticks, seconds, bars/beats/ticks with sample-accurate offsets.
- 2026-06-25 — Audio thread model: single realtime audio callback with lock-free queues.
- 2026-06-25 — AI agent context and control.
- 2026-06-25 — AI model provider strategy (generic skill format).
- 2026-06-25 — Backend framework: Fastify + `@fastify/websocket`.
- 2026-06-25 — Backend-to-engine transport: local TCP/socket.
- 2026-06-25 — No MVPs, stubs, or placeholders.

## Detailed design

### Subsystem overview

```
┌──────────────────────────────────────────────────────────────┐
│                          UI Layer                             │
│   Export dialog · Progress overlay · AI Mastering panel       │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTP + WebSocket
┌──────────────────────────▼───────────────────────────────────┐
│                       Backend (Bun)                           │
│   Export job queue · Project model · File I/O · Agent skills  │
└──────────────────────────┬───────────────────────────────────┘
                           │ local TCP/socket commands + events
┌──────────────────────────▼───────────────────────────────────┐
│                     JUCE Engine (C++)                         │
│   Offline renderer · Real-time tap · WAV/FLAC/OGG/MP3 encoders│
│   Stem renderer · Freeze/bounce · Dither/normalize            │
└──────────────────────────────────────────────────────────────┘
```

The backend owns the render job lifecycle, file output paths, and progress streaming. The engine owns the actual audio graph rendering and encoding. The agent invokes the same backend endpoints through skills.

### Data model

All schemas live in `packages/shared/src/schemas/export.ts` and are shared by UI, backend, engine command parser, and agent skill validators.

```ts
// packages/shared/src/schemas/export.ts
import { z } from "zod";

export const SampleRateSchema = z.union([
  z.literal(44100),
  z.literal(48000),
  z.literal(88200),
  z.literal(96000),
]);
export type SampleRate = z.infer<typeof SampleRateSchema>;

export const AudioFormatSchema = z.enum(["wav", "flac", "ogg", "mp3"]);
export type AudioFormat = z.infer<typeof AudioFormatSchema>;

export const WavBitDepthSchema = z.union([
  z.literal(16),
  z.literal(24),
  z.literal(32), // 32-bit float
]);
export type WavBitDepth = z.infer<typeof WavBitDepthSchema>;

export const FlacBitDepthSchema = z.union([z.literal(16), z.literal(24)]);
export type FlacBitDepth = z.infer<typeof FlacBitDepthSchema>;

export const Mp3BitrateSchema = z.union([
  z.literal(128),
  z.literal(192),
  z.literal(256),
  z.literal(320),
]);
export type Mp3Bitrate = z.infer<typeof Mp3BitrateSchema>;

export const DitherTypeSchema = z.enum(["none", "triangular", "noise-shaping"]);
export type DitherType = z.infer<typeof DitherTypeSchema>;

export const ExportRangeSchema = z.enum(["project", "selection", "loop"]);
export type ExportRange = z.infer<typeof ExportRangeSchema>;

export const StemSourceSchema = z.enum([
  "allMixerInserts",
  "selectedMixerInserts",
]);
export type StemSource = z.infer<typeof StemSourceSchema>;

export const StemsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  source: StemSourceSchema.default("allMixerInserts"),
  includeMaster: z.boolean().default(true),
  includeReturns: z.boolean().default(true),
});
export type StemsConfig = z.infer<typeof StemsConfigSchema>;

export const ExportSettingsSchema = z
  .object({
    format: AudioFormatSchema,
    sampleRate: SampleRateSchema,
    range: ExportRangeSchema,
    wavBitDepth: WavBitDepthSchema.optional(),
    flacBitDepth: FlacBitDepthSchema.optional(),
    oggQuality: z.number().min(0).max(10).optional(),
    mp3Bitrate: Mp3BitrateSchema.optional(),
    realtime: z.boolean().default(false),
    normalize: z.boolean().default(false),
    normalizeTargetDbfs: z.number().max(0).default(-0.1),
    dither: DitherTypeSchema.default("none"),
    stems: StemsConfigSchema.default({
      enabled: false,
      source: "allMixerInserts",
      includeMaster: true,
      includeReturns: true,
    }),
    outputDirectory: z.string().min(1),
    fileName: z.string().min(1),
  })
  .refine(
    (s) =>
      (s.format !== "wav" || s.wavBitDepth !== undefined) &&
      (s.format !== "flac" || s.flacBitDepth !== undefined) &&
      (s.format !== "ogg" || s.oggQuality !== undefined) &&
      (s.format !== "mp3" || s.mp3Bitrate !== undefined),
    { message: "format-specific option is required" },
  );
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

export const RenderJobStatusSchema = z.enum([
  "queued",
  "preparing",
  "rendering",
  "encoding",
  "finalizing",
  "done",
  "cancelled",
  "error",
]);
export type RenderJobStatus = z.infer<typeof RenderJobStatusSchema>;

export const RenderProgressSchema = z.object({
  jobId: z.string().uuid(),
  status: RenderJobStatusSchema,
  percent: z.number().min(0).max(100),
  currentTimeSeconds: z.number().min(0),
  totalTimeSeconds: z.number().min(0),
  currentPass: z.number().int().min(1),
  totalPasses: z.number().int().min(1),
  message: z.string().optional(),
});
export type RenderProgress = z.infer<typeof RenderProgressSchema>;

export const OutputFileInfoSchema = z.object({
  insertId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  name: z.string(),
  absolutePath: z.string(),
  sizeBytes: z.number().int().min(0),
});
export type OutputFileInfo = z.infer<typeof OutputFileInfoSchema>;

export const RenderJobSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: RenderJobStatusSchema,
  settings: ExportSettingsSchema,
  outputFiles: z.array(OutputFileInfoSchema),
  progress: RenderProgressSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

export const FreezeTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mixerInsert"), insertId: z.string().uuid() }),
  z.object({ type: z.literal("channelRackChannel"), channelId: z.string().uuid() }),
]);
export type FreezeTarget = z.infer<typeof FreezeTargetSchema>;

export const FreezeDestinationSchema = z.enum([
  "replaceSource",
  "newPlaylistTrack",
  "newChannelRackChannel",
]);
export type FreezeDestination = z.infer<typeof FreezeDestinationSchema>;

export const FreezeSettingsSchema = z.object({
  target: FreezeTargetSchema,
  destination: FreezeDestinationSchema.default("newPlaylistTrack"),
  tailSeconds: z.number().min(0).default(0),
  realtime: z.boolean().default(false),
  includeInserts: z.boolean().default(true),
});
export type FreezeSettings = z.infer<typeof FreezeSettingsSchema>;

export const FreezeResultSchema = z.object({
  jobId: z.string().uuid(),
  audioAssetId: z.string().uuid(),
  audioFilePath: z.string(),
  destinationId: z.string().uuid(),
});
export type FreezeResult = z.infer<typeof FreezeResultSchema>;

export const AIMasteringStyleSchema = z.enum([
  "balanced",
  "warm",
  "bright",
  "punchy",
  "transparent",
]);
export type AIMasteringStyle = z.infer<typeof AIMasteringStyleSchema>;

export const AIMasteringRequestSchema = z.object({
  targetLoudnessLUFS: z.number().default(-14),
  truePeakLimitDbtp: z.number().default(-1.0),
  style: AIMasteringStyleSchema.default("balanced"),
  maxIterations: z.number().int().min(1).max(10).default(3),
  referenceTrackAssetId: z.string().uuid().optional(),
  outputDirectory: z.string().min(1),
  fileName: z.string().min(1),
});
export type AIMasteringRequest = z.infer<typeof AIMasteringRequestSchema>;

export const AIMasteringResultSchema = z.object({
  sessionId: z.string().uuid(),
  finalExportJobId: z.string().uuid(),
  measuredLUFS: z.number(),
  measuredTruePeakDbtp: z.number(),
  appliedChain: z.array(
    z.object({
      pluginId: z.string().uuid(),
      presetName: z.string().optional(),
      parameterSnapshot: z.record(z.number()),
    }),
  ),
  outputFiles: z.array(z.string()),
});
export type AIMasteringResult = z.infer<typeof AIMasteringResultSchema>;
```

### API / interface

#### Backend HTTP/WebSocket surface

`packages/backend/src/routes/export.ts`:

```ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  ExportSettingsSchema,
  FreezeSettingsSchema,
  AIMasteringRequestSchema,
} from "@singularity/shared/schemas/export";

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{
    Params: { projectId: string };
    Body: ExportSettings;
    Reply: RenderJob;
  }>("/api/projects/:projectId/export", {
    schema: { body: ExportSettingsSchema },
  }, async (request, reply) => {
    const job = await request.server.exportService.createJob(
      request.params.projectId,
      request.body,
    );
    return reply.status(201).send(job);
  });

  fastify.get<{
    Params: { projectId: string; jobId: string };
    Reply: RenderJob;
  }>("/api/projects/:projectId/export/:jobId", async (request, reply) => {
    const job = await request.server.exportService.getJob(
      request.params.projectId,
      request.params.jobId,
    );
    return reply.send(job);
  });

  fastify.delete<{
    Params: { projectId: string; jobId: string };
  }>("/api/projects/:projectId/export/:jobId", async (request, reply) => {
    await request.server.exportService.cancelJob(
      request.params.projectId,
      request.params.jobId,
    );
    return reply.status(204).send();
  });

  fastify.get<{
    Params: { projectId: string; jobId: string };
  }>("/api/projects/:projectId/export/:jobId/files", async (request, reply) => {
    const files = await request.server.exportService.listOutputFiles(
      request.params.projectId,
      request.params.jobId,
    );
    return reply.send(files);
  });

  fastify.get<{
    Params: { projectId: string; jobId: string; fileName: string };
  }>("/api/projects/:projectId/export/:jobId/files/:fileName", async (request, reply) => {
    const stream = await request.server.exportService.getOutputFileStream(
      request.params.projectId,
      request.params.jobId,
      request.params.fileName,
    );
    return reply.header("Content-Disposition", `attachment; filename="${request.params.fileName}"`).send(stream);
  });

  fastify.post<{
    Params: { projectId: string };
    Body: FreezeSettings;
    Reply: FreezeResult;
  }>("/api/projects/:projectId/freeze", {
    schema: { body: FreezeSettingsSchema },
  }, async (request, reply) => {
    const result = await request.server.exportService.freeze(
      request.params.projectId,
      request.body,
    );
    return reply.status(201).send(result);
  });

  fastify.post<{
    Params: { projectId: string };
    Body: AIMasteringRequest;
    Reply: AIMasteringResult;
  }>("/api/projects/:projectId/mastering/ai", {
    schema: { body: AIMasteringRequestSchema },
  }, async (request, reply) => {
    const result = await request.server.agentService.runMastering(
      request.params.projectId,
      request.body,
    );
    return reply.status(202).send(result);
  });
}
```

WebSocket events pushed from backend to UI (and agent sessions):

```ts
interface ExportProgressEvent {
  type: "export:progress";
  payload: RenderProgress;
}

interface ExportCompleteEvent {
  type: "export:complete";
  payload: RenderJob;
}

interface ExportErrorEvent {
  type: "export:error";
  payload: { jobId: string; error: string };
}

interface MasteringProgressEvent {
  type: "mastering:progress";
  payload: {
    sessionId: string;
    iteration: number;
    measuredLUFS: number;
    measuredTruePeakDbtp: number;
  };
}
```

#### Backend service interface

`packages/backend/src/services/ExportService.ts`:

```ts
export interface ExportService {
  createJob(projectId: string, settings: ExportSettings): Promise<RenderJob>;
  getJob(projectId: string, jobId: string): Promise<RenderJob>;
  cancelJob(projectId: string, jobId: string): Promise<void>;
  listOutputFiles(projectId: string, jobId: string): Promise<OutputFileInfo[]>;
  getOutputFileStream(
    projectId: string,
    jobId: string,
    fileName: string,
  ): Promise<ReadableStream>;
  freeze(projectId: string, settings: FreezeSettings): Promise<FreezeResult>;
}
```

#### Engine command protocol

Engine commands use the JSON envelope defined in Spec 19 and are sent over the local TCP/socket transport defined in Spec 17.

Command: `render.start`

```ts
interface RenderStartCommand {
  id: string;              // envelope id
  type: "render.start";
  payload: {
    jobId: string;
    projectSnapshot: ProjectSnapshot; // full project JSON + asset paths
    settings: ExportSettings;
    outputDirectory: string;
  };
}

interface RenderStartResponse {
  id: string;              // echoes envelope id
  type: "render.started";
  payload: { jobId: string };
}
```

Command: `render.cancel`

```ts
interface RenderCancelCommand {
  id: string;
  type: "render.cancel";
  payload: { jobId: string };
}
```

Engine events pushed over the same socket:

```ts
interface RenderProgressEventEngine {
  type: "render.progress";
  payload: RenderProgress;
}

interface RenderCompleteEventEngine {
  type: "render.complete";
  payload: {
    jobId: string;
    outputFiles: OutputFileInfo[];
  };
}

interface RenderErrorEventEngine {
  type: "render.error";
  payload: { jobId: string; error: string };
}
```

Command: `freeze.start`

```ts
interface FreezeStartCommand {
  id: string;
  type: "freeze.start";
  payload: {
    jobId: string;
    projectSnapshot: ProjectSnapshot;
    settings: FreezeSettings;
    outputDirectory: string;
  };
}
```

#### Agent skills

Agent skills are defined in the generic skill format (Spec 35) and exposed by the backend agent runtime.

```json
{
  "name": "singularity:export:renderProject",
  "description": "Render the project or a range to WAV/FLAC/OGG/MP3 with optional stems.",
  "input_schema": {
    "$ref": "@singularity/shared/schemas/export/ExportSettings"
  },
  "output_schema": {
    "$ref": "@singularity/shared/schemas/export/RenderJob"
  }
}
```

```json
{
  "name": "singularity:export:cancelJob",
  "description": "Cancel an active render job.",
  "input_schema": {
    "type": "object",
    "properties": {
      "jobId": { "type": "string", "format": "uuid" }
    },
    "required": ["jobId"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "cancelled": { "type": "boolean" }
    }
  }
}
```

```json
{
  "name": "singularity:mastering:analyzeMix",
  "description": "Analyze the current project mix and return loudness, true peak, and spectral statistics.",
  "input_schema": {
    "type": "object",
    "properties": {
      "range": { "enum": ["project", "selection", "loop"], "default": "project" }
    }
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "lufs": { "type": "number" },
      "truePeakDbtp": { "type": "number" },
      "dynamicRangeDb": { "type": "number" },
      "spectralCentroidHz": { "type": "number" }
    },
    "required": ["lufs", "truePeakDbtp", "dynamicRangeDb", "spectralCentroidHz"]
  }
}
```

```json
{
  "name": "singularity:mastering:applyChain",
  "description": "Add or configure a mastering chain on the master mixer insert. Non-destructive; creates a project edit.",
  "input_schema": {
    "type": "object",
    "properties": {
      "style": { "enum": ["balanced", "warm", "bright", "punchy", "transparent"], "default": "balanced" },
      "targetLoudnessLUFS": { "type": "number", "default": -14 },
      "truePeakLimitDbtp": { "type": "number", "default": -1.0 }
    }
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "pluginIds": { "type": "array", "items": { "type": "string", "format": "uuid" } }
    },
    "required": ["pluginIds"]
  }
}
```

```json
{
  "name": "singularity:mastering:exportMastered",
  "description": "Render a mastered version of the project after the agent has applied a chain.",
  "input_schema": {
    "$ref": "@singularity/shared/schemas/export/AIMasteringRequest"
  },
  "output_schema": {
    "$ref": "@singularity/shared/schemas/export/AIMasteringResult"
  }
}
```

The agent mastering workflow is:

1. Call `singularity:mastering:analyzeMix`.
2. Optionally compare against a reference track.
3. Call `singularity:mastering:applyChain` to load/configure stock limiter/EQ/compressor on the master insert.
4. Re-analyze.
5. Iterate up to `maxIterations` until `measuredLUFS` is within ±1 LUFS of `targetLoudnessLUFS` and `measuredTruePeakDbtp` ≤ `truePeakLimitDbtp`.
6. Call `singularity:mastering:exportMastered`.

### UI/UX

- **Export dialog** (`packages/ui/src/dialogs/ExportDialog.tsx`):
  - Format dropdown: WAV, FLAC, OGG, MP3.
  - Sample rate dropdown: 44.1, 48, 88.2, 96 kHz.
  - Dynamic option panel:
    - WAV: bit-depth 16/24/32-bit float.
    - FLAC: bit-depth 16/24.
    - OGG: quality slider 0–10.
    - MP3: bitrate 128/192/256/320 kbps.
  - Range radio: Full project / Selection / Loop region.
  - Stems checkbox; when enabled, show source dropdown and include-master/include-returns toggles.
  - Normalize toggle with target dBFS input.
  - Dither toggle with type dropdown.
  - Real-time export checkbox (advanced).
  - Output directory picker and file name input.
  - Buttons: Export, Cancel.

- **Progress overlay** (`packages/ui/src/components/export/RenderProgressOverlay.tsx`):
  - Stage label, percent bar, elapsed/remaining time.
  - Pass counter when rendering stems.
  - Cancel button (enabled while status is `queued`, `preparing`, `rendering`, `encoding`).

- **Completion panel**:
  - List of output files with Open Folder / Download buttons.
  - Play preview button for each file.

- **AI Mastering entry points**:
  - "AI Master" button in the Export dialog pre-fills the agent terminal with `singularity:mastering:exportMastered`.
  - "AI Master" action in the master mixer insert context menu.
  - Terminal shows per-iteration analysis, applied chain, and final export.

- **Freeze actions**:
  - Mixer insert context menu: "Freeze this insert" / "Bounce to audio track".
  - Channel Rack channel context menu: "Render to audio".
  - Opens a small dialog for destination and tail length.

### Algorithms / behavior

#### Export range resolution

The backend resolves `range` into a `[startSeconds, endSeconds]` pair before sending the command to the engine.

- `project`: `start = 0`, `end = max(end of last Playlist clip, end of last pattern note, loop end if loop enabled)`.
- `selection`: `start = min(start of selected clips/notes/inserts)`, `end = max(end of selected items)`. If nothing is selected, return HTTP `400` with error `selection_is_empty`.
- `loop`: `start = transport.loopStartSeconds`, `end = transport.loopEndSeconds`. If loop is disabled, return HTTP `400`.

#### Offline rendering

1. Engine loads the project snapshot into a temporary non-realtime graph.
2. Set processing sample rate and a fixed offline buffer size of 1024 samples.
3. Run the graph in a non-UI thread, calling `processBlock` in a loop.
4. Write floating-point samples to an intermediate `.tmp` file in the job directory.
5. Apply normalize gain if requested.
6. Apply dither when converting to integer bit depth.
7. Encode to final format using the chosen encoder.
8. Delete intermediate file after successful encode.

#### Real-time rendering

1. Engine validates that all plugins support realtime rendering.
2. Engine routes the master output (or per-insert stem tap) to a disk-writer running on the same realtime callback.
3. Transport plays at normal speed through the active audio device.
4. Progress is derived from transport position.
5. On cancel, stop transport, flush writer, and finalize.

#### Stem rendering

1. `totalPasses = number of stems to render + 1 if includeMaster`.
2. For each pass, the engine temporarily reconfigures the graph so only the target insert (and its upstream dependencies) feeds the output.
3. Include return/sidechain inputs according to the current routing graph.
4. The master pass renders the normal stereo master bus.
5. Each pass is normalized/dithered independently if those options are enabled.
6. File naming: `{fileName}_{safeInsertName}.{ext}` for stems, `{fileName}.{ext}` for the master mix. `safeInsertName` is the insert name with whitespace replaced by underscores and filesystem-unsafe characters removed.

#### Normalize and dither

- Normalize: scan the rendered float buffer for the maximum absolute sample `peak`. If `peak > 0` and `20 * log10(peak) < normalizeTargetDbfs`, compute gain `g = 10^(normalizeTargetDbfs / 20) / peak` and multiply every sample by `g`. If `normalize` is disabled, gain is `1.0`.
- Dither: when target bit depth is integer, add triangular pseudorandom noise with amplitude ±1 LSB before quantization. `noise-shaping` applies a first-order error-feedback shaper. Dither is skipped for 32-bit float WAV and for OGG/MP3 encoders (they receive normalized float and apply their own quantization).

#### MP3 encoding

MP3 is not natively writable by JUCE. The engine links `libmp3lame` and encodes the normalized float buffer at the selected constant bitrate. The `libmp3lame` dependency is included in `engine/CMakeLists.txt` on all desktop targets.

#### Freeze / bounce

1. Determine the time range to render: for a mixer insert, the full project length; for a channel rack channel, the pattern length or the full project if used in the Playlist.
2. Render the target output to a WAV asset in the project bundle's `assets/` folder.
3. If destination is `replaceSource`, disable the original insert/channel and reference the new audio asset in its place.
4. If destination is `newPlaylistTrack`, create a new Playlist track and place the full audio clip at time zero.
5. If destination is `newChannelRackChannel`, create a new sampler channel referencing the asset.
6. Return the new asset ID and destination ID.

## Implementation plan

1. Add `packages/shared/src/schemas/export.ts` with all Zod schemas and TypeScript types.
2. Implement engine render command dispatcher in `engine/src/render/RenderController.cpp`:
   - Offline renderer (`OfflineRenderTask`).
   - Real-time disk writer (`RealtimeRenderTask`).
   - WAV/FLAC/OGG writers via JUCE.
   - MP3 writer via `libmp3lame`.
   - Stem pass scheduler.
   - Normalize/dither utilities.
3. Implement engine freeze command in `engine/src/render/FreezeController.cpp`.
4. Implement backend `ExportService` in `packages/backend/src/services/ExportService.ts`:
   - Job store (in-memory per backend process).
   - Range resolution.
   - Engine command dispatch and progress event forwarding.
   - Output file path generation and cleanup on cancel/error.
5. Wire backend HTTP routes in `packages/backend/src/routes/export.ts`.
6. Emit WebSocket events for progress/complete/error.
7. Implement UI components: `ExportDialog`, `RenderProgressOverlay`, `ExportCompletionPanel`, freeze context-menu items.
8. Implement agent mastering skills and prompt templates in `packages/backend/src/agent/skills/mastering.ts`.
9. Write unit, integration, and E2E tests.

## Testing strategy

- **Unit tests** (`packages/shared`):
  - Export settings schema validation, including format-specific required fields.
  - Range resolution helper for project/selection/loop.
  - Normalize gain calculation.
  - Dither noise amplitude and bit-depth quantization.
  - Safe file-name sanitization.

- **Engine integration tests** (`engine/tests/render`):
  - Render a project containing a 1 kHz sine source and verify output peak, sample count, and sample rate.
  - Verify WAV header bit depth matches setting.
  - Verify FLAC/OGG/MP3 outputs are valid and decode to the expected duration.
  - Verify stem export produces the correct number of files and each contains signal only from its source.
  - Verify normalize raises a -6 dBFS sine to -0.1 dBFS.
  - Verify cancel stops the render and deletes temp files.

- **Backend integration tests** (`packages/backend/tests/export.test.ts`):
  - `POST /api/projects/:id/export` creates a job and returns 201.
  - WebSocket receives `export:progress` with monotonically increasing `percent` ending at 100.
  - `GET /api/projects/:id/export/:jobId/files` returns the expected files.
  - `DELETE` cancels an active job and final status is `cancelled`.
  - Empty selection with `range: "selection"` returns 400.
  - Freeze endpoint returns a valid asset ID and file path.

- **E2E tests**:
  - Export a multi-track project with stems, download all files, and verify count.
  - Trigger AI mastering from the export dialog, wait for completion, and verify the mastered file exists and is within ±1 LUFS of the requested target.

## Acceptance criteria

- [ ] Export dialog allows choosing WAV, FLAC, OGG, and MP3 formats.
- [ ] Export dialog allows sample rates 44.1, 48, 88.2, and 96 kHz.
- [ ] WAV export supports 16-bit, 24-bit, and 32-bit float; FLAC supports 16-bit and 24-bit; OGG supports quality 0–10; MP3 supports 128/192/256/320 kbps.
- [ ] Export range can be set to full project, current selection, or loop region.
- [ ] Stem export creates one file per enabled mixer insert plus the master when selected.
- [ ] Stem file names follow `{fileName}_{safeInsertName}.{ext}` and the master follows `{fileName}.{ext}`.
- [ ] Normalize raises the file peak to within 0.1 dB of the configured target when enabled.
- [ ] Dither is applied when exporting to integer WAV/FLAC bit depths and is disabled for 32-bit float WAV.
- [ ] Real-time export plays through the audio device and writes to disk at normal speed.
- [ ] A render job emits `export:progress` events at least every 500 ms while active.
- [ ] Canceling a job sets its status to `cancelled`, stops engine processing, and removes temporary files.
- [ ] A completed job lists all output files with correct sizes and absolute paths.
- [ ] Output files are downloadable via `GET /api/projects/:projectId/export/:jobId/files/:fileName`.
- [ ] Freeze/bounce creates a new audio asset in the project bundle and returns the correct destination ID.
- [ ] Freezing a mixer insert disables the original insert and replaces it with the rendered audio when destination is `replaceSource`.
- [ ] The agent skill `singularity:mastering:analyzeMix` returns LUFS, true peak, dynamic range, and spectral centroid.
- [ ] The agent skill `singularity:mastering:applyChain` adds/configures stock plugins on the master insert.
- [ ] AI mastering iterates up to `maxIterations` and stops when LUFS is within ±1 LUFS of the target and true peak is ≤ the limit.
- [ ] AI mastering produces a final mastered file at the requested output directory and file name.
- [ ] All acceptance criteria have corresponding automated tests that pass in CI.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture (communication paths and runtime layout).
- Spec 19: Shared Protocol and Schemas (message envelopes and Zod validation patterns).
- Spec 20: JUCE Engine Internals (audio graph, plugin hosting, transport).
- Spec 23: Backend API (project sessions, HTTP/WebSocket route patterns).
- Spec 29: Mixer and Routing Graph (stem sources, insert IDs, sidechain routing).
- Spec 21: Plugin Hosting and Scanner (plugin state, delay compensation, realtime/offline behavior).
- Spec 35: AI Agent System (generic skill format, agent runtime, terminal panel).
- Spec 22: Project Model and .singularity Bundle Format (project JSON, asset references, `.singularity` bundle).
- Spec 32: Audio Recording and Editing (audio asset creation and file management).

## Blocks

- Spec 35: AI Agent Integration — the mastering skills defined here require the export/render pipeline to be operational.
- Any future distribution/publishing spec is blocked by this export pipeline.

## Notes / open questions

- This spec decides that MP3 export is implemented by linking `libmp3lame` in the JUCE engine. JUCE does not ship an MP3 encoder, and distribution integration is out of scope, so a local encoder is required.
- The decision to normalize each stem independently (rather than applying the same gain across all stems) matches the common stem-delivery workflow and is recorded here.
- AI mastering is intentionally agent-driven using stock plugins; no trained ML model is required for v1.0. The agent uses analysis skills and the mixer API to build a chain.
- Real-time export is required only for plugins that report `supportsOfflineRendering === false`; the UI exposes it as an advanced checkbox for user override.
