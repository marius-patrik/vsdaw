# Spec 28: Playlist and Arrangement

## Objective

Define the complete playlist/arrangement panel for Singularity v1.0: a canvas-based timeline with track lanes for audio, MIDI/pattern, automation, and video clips, full editing tools, snap modes, clip operations, non-destructive fades, waveform and MIDI previews, track headers, time ruler, and playhead scrub.

## Motivation

The playlist is the central arrangement surface in FL Studio. Singularity v1.0 must provide an equivalent, production-ready timeline where users assemble patterns, audio recordings, automation, and video into a finished song. This spec turns the parity-spec requirements into concrete data models, API contracts, rendering behavior, and verifiable acceptance criteria.

## Scope

### In scope

- Playlist track model and persistence in `.singularity` `project.json`.
- Track lanes with headers (mute, solo, record arm, volume, pan, input/output routing).
- Clip types: audio, pattern/MIDI, automation, video.
- Editing tools: draw (pencil), paint, delete, mute, slip, slice, select, zoom, playback.
- Snap modes: off, 1/4 beat, 1/2 beat, beat, bar, and sample-accurate.
- Clip operations: copy, paste, duplicate, make unique, group, color, rename, loop, stretch.
- Non-destructive clip fades via drag handles on the top corners.
- Audio waveform thumbnails rendered on audio clips.
- MIDI note preview rendered on pattern/MIDI clips.
- Automation clips with editable breakpoints and curve shapes.
- Time ruler with bar/beat markers, zoom, and playhead scrub.
- Video track with frame-accurate audio sync.
- Selection state (clips, tracks, time ranges) shared with the toolbar and other panels.
- Keyboard shortcuts and context menus.
- Agent skill exposure for arrangement editing.

### Out of scope

- Piano roll note editing inside clips (covered by Spec 27: Piano Roll).
- Full automation breakpoint editor as a separate lane view (automation clips are in scope; detailed lane UX is covered by Spec 33: Automation, MIDI, and Transport).
- Audio recording implementation (covered by Spec 32: Audio Recording and Editing).
- Video decoding and frame rendering internals (engine responsibility; UI receives frame/time sync events only).
- FLP import (secondary migration feature; covered by project-format specs).
- Mixer DSP routing graph visual editor (covered by routing/Patcher specs).

## Related decisions

From `docs/decisions.md`:

- **Project model**: FL Studio-style Channel Rack + Patterns + Playlist is the primary model.
- **Time representation**: ticks (PPQN), seconds, and bars/beats/ticks with sample-accurate offsets.
- **Canvas rendering for editors**: HTML5 Canvas for the timeline, piano roll, mixer, and routing graph.
- **Video playback**: video playback with audio sync in v1.0; full video editor is post-v1.0.
- **Theme system based on VS Code themes**: app design tokens map to VS Code color theme JSON.
- **Backend framework**: Fastify + `@fastify/websocket`.
- **Backend-to-engine transport**: local TCP/socket command protocol.
- **No MVPs/stubs/placeholders**: every shipped component must be complete, tested, and wired end-to-end.

## Detailed design

### Subsystem overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Playlist Panel (React)                    │
│   Dockview panel → Canvas surface → Track headers + timeline  │
│   Zustand store for view state + selection                    │
└───────────────────────┬──────────────────────────────────────┘
                        │ WebSocket events / HTTP API
┌───────────────────────▼──────────────────────────────────────┐
│                     Backend (Bun/Fastify)                     │
│   Project model mutations → engine bridge → persistence       │
└───────────────────────┬──────────────────────────────────────┘
                        │ local TCP/socket commands
┌───────────────────────▼──────────────────────────────────────┐
│                    JUCE Engine (C++)                          │
│   Clip playback scheduling → audio/MIDI/video sync            │
└──────────────────────────────────────────────────────────────┘
```

The playlist panel is a single Dockview panel rendered with HTML5 Canvas. It receives real-time transport position and meter/state events over WebSocket, and it sends mutations to the backend via HTTP or WebSocket request envelopes. The backend updates the in-memory project model, persists to `.singularity`, and forwards transport-relevant changes to the JUCE engine.

### Data model

All shapes are Zod schemas in `packages/shared/src/schemas/playlist.ts`.

#### Time types

```ts
// packages/shared/src/schemas/time.ts
export const TicksSchema = z.number().int().min(0);                 // PPQN ticks
export const SamplesSchema = z.number().int();                      // audio samples
export const BarsBeatsTicksSchema = z.object({
  bars: z.number().int().min(0),
  beats: z.number().int().min(0),
  ticks: z.number().int().min(0),
});

export const TimeRangeSchema = z.object({
  startTicks: TicksSchema,
  durationTicks: TicksSchema,
});
```

Canonical musical time is **ticks at PPQN = 960**. Project tempo and time signature map between ticks, seconds, and bars/beats/ticks. Audio clip boundaries store both `startTick`/`durationTicks` and `startSamples`/`durationSamples` so the engine can schedule sample-accurately.

#### Playlist track

```ts
// packages/shared/src/schemas/playlist.ts
export const TrackTypeSchema = z.enum([
  "audio",
  "pattern",
  "automation",
  "video",
]);

export const PlaylistTrackSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().min(0).max(499), // 0-499, matching FL Studio playlist track count
  name: z.string().min(1).max(128),
  type: TrackTypeSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), // hex, e.g. #3b82f6
  heightPx: z.number().int().min(24).max(512).default(72),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  recordArm: z.boolean().default(false),
  volumeDb: z.number().min(-144).max(24).default(0),
  pan: z.number().min(-1).max(1).default(0),
  input: z.enum(['none', 'stereo', 'mono']).default('none'),
  output: z.object({ insertId: z.string().uuid() }).default({ insertId: 'master' }),
  groupId: z.string().uuid().optional(), // track group for color/selection
});

export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;
```

#### Clip fade

```ts
export const FadeTypeSchema = z.enum(["linear", "logarithmic", "exponential", "sCurve"]);

export const ClipFadeSchema = z.object({
  type: FadeTypeSchema.default("linear"),
  durationTicks: TicksSchema.default(0),
});
```

#### Automation point

```ts
export const AutomationCurveSchema = z.enum([
  "linear",
  "smooth",      // cubic bezier ease-in-out
  "hold",        // step until next point
  "logarithmic",
  "exponential",
]);

export const AutomationPointSchema = z.object({
  id: z.string().uuid(),
  tick: TicksSchema,
  value: z.number(),
  curve: AutomationCurveSchema.default("linear"),
});
```

#### Playlist clip (discriminated union)

```ts
export const BaseClipSchema = z.object({
  id: z.string().uuid(),
  trackId: z.string().uuid(),
  startTick: TicksSchema,
  durationTicks: TicksSchema,
  offsetTicks: TicksSchema.default(0), // source offset for audio/video; 0 for pattern/automation
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  name: z.string().max(128).optional(),
  mute: z.boolean().default(false),
  loop: z.boolean().default(false),
  groupId: z.string().uuid().optional(),
});

export const AudioClipSchema = BaseClipSchema.extend({
  type: z.literal("audio"),
  assetId: z.string().uuid(), // references assets/<uuid>.wav in bundle
  stretchMode: z.enum(["none", "resample", "formant", "granular"]).default("none"),
  pitchSemitones: z.number().min(-128).max(128).default(0),
  fadeIn: ClipFadeSchema.default({ type: 'linear', durationTicks: 0 }),
  fadeOut: ClipFadeSchema.default({ type: 'linear', durationTicks: 0 }),
  startSamples: SamplesSchema,
  durationSamples: SamplesSchema,
});

export const PatternClipSchema = BaseClipSchema.extend({
  type: z.literal("pattern"),
  patternId: z.string().uuid(), // references Channel Rack pattern
});

export const AutomationClipSchema = BaseClipSchema.extend({
  type: z.literal("automation"),
  target: z.object({
    type: z.enum(['channelParam', 'pluginParam', 'mixerParam', 'transportParam']),
    entityId: z.string().uuid(),
    parameterId: z.string().max(256),   // vendor-specific parameter key
  }),
  points: z.array(AutomationPointSchema).min(1),
});

export const VideoClipSchema = BaseClipSchema.extend({
  type: z.literal("video"),
  assetId: z.string().uuid(), // references assets/<uuid>.mp4/mov in bundle
  startFrames: z.number().int().min(0),
  durationFrames: z.number().int().min(0),
});

export const PlaylistClipSchema = z.discriminatedUnion("type", [
  AudioClipSchema,
  PatternClipSchema,
  AutomationClipSchema,
  VideoClipSchema,
]);

export type PlaylistClip = z.infer<typeof PlaylistClipSchema>;
```

#### Playlist model

```ts
export const PlaylistModelSchema = z.object({
  tracks: z.array(PlaylistTrackSchema).max(500),
  clips: z.array(PlaylistClipSchema),
  nextTrackIndex: z.number().int().min(0).max(500),
  markers: z.array(
    z.object({
      id: z.string().uuid(),
      tick: TicksSchema,
      name: z.string().max(256),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    })
  ),
});

export type PlaylistModel = z.infer<typeof PlaylistModelSchema>;
```

#### View state

```ts
export const SnapModeSchema = z.enum([
  "off",
  "1/4-beat",
  "1/2-beat",
  "beat",
  "bar",
  "sample-accurate",
]);

export const PlaylistToolSchema = z.enum([
  "draw",
  "paint",
  "delete",
  "mute",
  "slip",
  "slice",
  "select",
  "zoom",
  "playback",
]);

export const PlaylistViewStateSchema = z.object({
  tool: PlaylistToolSchema.default("select"),
  snapMode: SnapModeSchema.default("beat"),
  showWaveforms: z.boolean().default(true),
  showMidiPreview: z.boolean().default(true),
  showAutomationCurves: z.boolean().default(true),
  hZoom: z.number().min(0.001).max(100).default(1),   // horizontal pixels per tick multiplier
  vZoom: z.number().min(0.5).max(4).default(1),       // vertical track height multiplier
  scrollX: z.number().default(0),
  scrollY: z.number().default(0),
  loopEnabled: z.boolean().default(false),
  loopStartTicks: TicksSchema.default(0),
  loopEndTicks: TicksSchema.default(0),
});

export type PlaylistViewState = z.infer<typeof PlaylistViewStateSchema>;
```

#### Selection state

```ts
export const PlaylistSelectionSchema = z.object({
  clipIds: z.array(z.string().uuid()).default([]),
  trackIds: z.array(z.string().uuid()).default([]),
  timeRange: TimeRangeSchema.optional(),
});

export type PlaylistSelection = z.infer<typeof PlaylistSelectionSchema>;
```

### API / interface

#### Backend HTTP endpoints

All endpoints are in `packages/backend/src/routes/playlist.ts`. They operate on the active project session. IDs are UUIDs.

```ts
// GET /api/projects/:projectId/playlist
// Returns { playlist: PlaylistModel, viewState: PlaylistViewState }
async function getPlaylist(projectId: string): Promise<{ playlist: PlaylistModel; viewState: PlaylistViewState }>;

// POST /api/projects/:projectId/playlist/tracks
// Body: PlaylistTrackSchema.omit({ id })
// Returns { track: PlaylistTrack }
async function createTrack(projectId: string, body: Omit<PlaylistTrack, "id">): Promise<{ track: PlaylistTrack }>;

// PATCH /api/projects/:projectId/playlist/tracks/:trackId
// Body: Partial<PlaylistTrack>
async function updateTrack(projectId: string, trackId: string, body: Partial<PlaylistTrack>): Promise<void>;

// DELETE /api/projects/:projectId/playlist/tracks/:trackId
// Deletes track and all clips on it. Refuses if track is non-empty and ?force=false.
async function deleteTrack(projectId: string, trackId: string, force?: boolean): Promise<void>;

// POST /api/projects/:projectId/playlist/tracks/reorder
// Body: { trackIds: string[] } in desired top-to-bottom order
async function reorderTracks(projectId: string, trackIds: string[]): Promise<void>;

// POST /api/projects/:projectId/playlist/clips
// Body: PlaylistClipSchema.omit({ id })
// Returns { clip: PlaylistClip }
async function createClip(projectId: string, body: Omit<PlaylistClip, "id">): Promise<{ clip: PlaylistClip }>;

// PATCH /api/projects/:projectId/playlist/clips/:clipId
// Body: Partial<PlaylistClip>
async function updateClip(projectId: string, clipId: string, body: Partial<PlaylistClip>): Promise<void>;

// DELETE /api/projects/:projectId/playlist/clips/:clipId
async function deleteClip(projectId: string, clipId: string): Promise<void>;

// POST /api/projects/:projectId/playlist/clips/:clipId/duplicate
// Body: { offsetTicks?: number } default one bar
// Returns { clip: PlaylistClip }
async function duplicateClip(projectId: string, clipId: string, offsetTicks?: number): Promise<{ clip: PlaylistClip }>;

// POST /api/projects/:projectId/playlist/clips/:clipId/make-unique
// For pattern clips: creates a new pattern copy and repoints the clip.
// For audio/automation/video clips: duplicates underlying source asset reference (non-destructive).
// Returns { clip: PlaylistClip }
async function makeUnique(projectId: string, clipId: string): Promise<{ clip: PlaylistClip }>;

// POST /api/projects/:projectId/playlist/clips/split
// Body: { clipId: string, splitAtTicks: number }
// Returns { leftClip: PlaylistClip; rightClip: PlaylistClip }
async function splitClip(projectId: string, clipId: string, splitAtTicks: number): Promise<{ leftClip: PlaylistClip; rightClip: PlaylistClip }>;

// POST /api/projects/:projectId/playlist/clips/glue
// Body: { clipIds: string[] }
// Only allowed for adjacent same-source audio clips or same-target automation clips.
// Returns { clip: PlaylistClip }
async function glueClips(projectId: string, clipIds: string[]): Promise<{ clip: PlaylistClip }>;

// POST /api/projects/:projectId/playlist/clips/copy
// Body: { clipIds: string[] }
// Returns { clipboardId: string }
async function copyClips(projectId: string, clipIds: string[]): Promise<{ clipboardId: string }>;

// POST /api/projects/:projectId/playlist/clips/paste
// Body: { clipboardId: string, startTicks: number, trackId?: string }
// Returns { clips: PlaylistClip[] }
async function pasteClips(projectId: string, clipboardId: string, startTicks: number, trackId?: string): Promise<{ clips: PlaylistClip[] }>;

// PATCH /api/projects/:projectId/playlist/selection
// Body: PlaylistSelectionSchema
async function setSelection(projectId: string, selection: PlaylistSelection): Promise<void>;

// PATCH /api/projects/:projectId/playlist/view-state
// Body: Partial<PlaylistViewState>
async function setViewState(projectId: string, body: Partial<PlaylistViewState>): Promise<void>;

// POST /api/projects/:projectId/playlist/markers
// Body: Omit<Marker, "id">
async function createMarker(projectId: string, body: Omit<Marker, "id">): Promise<{ marker: Marker }>;

// PATCH /api/projects/:projectId/playlist/markers/:markerId
async function updateMarker(projectId: string, markerId: string, body: Partial<Marker>): Promise<void>;

// DELETE /api/projects/:projectId/playlist/markers/:markerId
async function deleteMarker(projectId: string, markerId: string): Promise<void>;
```

#### WebSocket events

```ts
// packages/shared/src/schemas/websocket.ts

// Client → server
export type PlaylistClientEvent =
  | { type: "playlist.clip.create"; payload: Omit<PlaylistClip, "id"> }
  | { type: "playlist.clip.update"; payload: { clipId: string; patch: Partial<PlaylistClip> } }
  | { type: "playlist.clip.delete"; payload: { clipId: string } }
  | { type: "playlist.clip.move"; payload: { clipId: string; startTicks: number; trackId: string } }
  | { type: "playlist.clip.resize"; payload: { clipId: string; startTicks?: number; durationTicks?: number } }
  | { type: "playlist.track.update"; payload: { trackId: string; patch: Partial<PlaylistTrack> } }
  | { type: "playlist.selection"; payload: PlaylistSelection }
  | { type: "playlist.viewState"; payload: Partial<PlaylistViewState> }
  | { type: "playlist.scrub"; payload: { tick: number } };

// Server → client (broadcast to project session)
export type PlaylistServerEvent =
  | { type: "playlist.model"; payload: PlaylistModel }
  | { type: "playlist.clip.created"; payload: PlaylistClip }
  | { type: "playlist.clip.updated"; payload: { clipId: string; patch: Partial<PlaylistClip> } }
  | { type: "playlist.clip.deleted"; payload: { clipId: string } }
  | { type: "playlist.track.updated"; payload: { trackId: string; patch: Partial<PlaylistTrack> } }
  | { type: "playlist.selection"; payload: PlaylistSelection }
  | { type: "playlist.viewState"; payload: PlaylistViewState }
  | { type: "transport.position"; payload: { tick: number; isPlaying: boolean } };
```

#### Engine commands over TCP/socket

The backend forwards the following commands to the JUCE engine (`engine/src/transport/PlaylistCommands.h`):

```cpp
struct PlaylistSetClipCommand {
    std::string clipId;
    std::string trackId;
    int64_t startTick;
    int64_t durationTicks;
    int64_t offsetTicks;
    bool mute;
    bool loop;
};

struct PlaylistDeleteClipCommand {
    std::string clipId;
};

struct PlaylistSplitClipCommand {
    std::string clipId;
    int64_t splitAtTicks;
};

struct PlaylistUpdateTrackCommand {
    std::string trackId;
    bool mute;
    bool solo;
    float volumeDb;
    float pan;
    std::string outputInsertId;
};

struct PlaylistScrubCommand {
    int64_t tick;
};
```

#### React hooks and components

```ts
// packages/ui/src/playlist/usePlaylistStore.ts
export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  projectId: null,
  playlist: null,
  viewState: defaultPlaylistViewState,
  selection: { clipIds: [], trackIds: [] },
  transport: { tick: 0, isPlaying: false },
  // actions
  setTool: (tool) => get().updateViewState({ tool }),
  setSnapMode: (snapMode) => get().updateViewState({ snapMode }),
  createClip: async (clip) => api.post(`/projects/${get().projectId}/playlist/clips`, clip),
  updateClip: async (clipId, patch) => api.patch(`/projects/${get().projectId}/playlist/clips/${clipId}`, patch),
  deleteClip: async (clipId) => api.delete(`/projects/${get().projectId}/playlist/clips/${clipId}`),
  splitClip: async (clipId, splitAtTicks) => api.post(`/projects/${get().projectId}/playlist/clips/split`, { clipId, splitAtTicks }),
  setSelection: (selection) => api.patch(`/projects/${get().projectId}/playlist/selection`, selection),
  updateViewState: (patch) => api.patch(`/projects/${get().projectId}/playlist/view-state`, patch),
}));

// packages/ui/src/playlist/PlaylistPanel.tsx
export function PlaylistPanel({ projectId }: { projectId: string }): React.ReactElement;

// packages/ui/src/playlist/PlaylistCanvas.tsx
export function PlaylistCanvas(props: {
  playlist: PlaylistModel;
  viewState: PlaylistViewState;
  selection: PlaylistSelection;
  transport: { tick: number; isPlaying: boolean };
  width: number;
  height: number;
  onClipCreate: (clip: Omit<PlaylistClip, "id">) => void;
  onClipMove: (clipId: string, startTicks: number, trackId: string) => void;
  onClipResize: (clipId: string, startTicks: number | undefined, durationTicks: number | undefined) => void;
  onClipSelect: (clipId: string, additive: boolean) => void;
  onTrackSelect: (trackId: string, additive: boolean) => void;
  onScrub: (tick: number) => void;
}): React.ReactElement;
```

#### Agent skills

Expose these skills in `packages/backend/src/agent/skills/playlist.ts`:

```ts
{
  name: "playlist_create_track",
  description: "Add a new track to the playlist.",
  parameters: z.object({ projectId: z.string(), name: z.string(), type: TrackTypeSchema }),
}
{
  name: "playlist_create_pattern_clip",
  description: "Place a pattern clip on the playlist at a given bar/beat.",
  parameters: z.object({ projectId: z.string(), patternId: z.string(), trackId: z.string(), startTicks: z.number() }),
}
{
  name: "playlist_create_audio_clip",
  description: "Place an audio asset on the playlist.",
  parameters: z.object({ projectId: z.string(), assetId: z.string(), trackId: z.string(), startTicks: z.number() }),
}
{
  name: "playlist_delete_clip",
  description: "Remove a clip from the playlist.",
  parameters: z.object({ projectId: z.string(), clipId: z.string() }),
}
{
  name: "playlist_set_loop",
  description: "Enable or disable the playlist loop region.",
  parameters: z.object({ projectId: z.string(), enabled: z.boolean(), startTicks: z.number(), endTicks: z.number() }),
}
```

### UI/UX

#### Layout

- Left sidebar: track headers (fixed width, 120 px default, resizable to 48–320 px).
- Main area: canvas timeline with horizontal time ruler at top (24 px) and vertical track lanes.
- Bottom-right: zoom/snap tool strip.
- Track headers stack 1:1 with canvas lanes; scrolling is synchronized.

#### Track header controls

Each header displays:
- Track number and name (editable inline on double-click).
- Mute (`M`), solo (`S`), record arm (`R`) toggle buttons.
- Volume fader (−144 dB to +24 dB) and pan knob (−100 to +100).
- Color swatch and input/output routing dropdowns.
- Right-click context menu: duplicate, delete, hide, freeze, route to mixer insert.

#### Tools and shortcuts

| Tool | Shortcut | Behavior |
|---|---|---|
| Draw (pencil) | `P` | Click empty lane to create a clip of the track's default type; click clip edge to resize. |
| Paint (brush) | `B` | Drag to paint repeated pattern clips at the current snap grid. |
| Delete | `D` | Click clip to delete after confirmation if selection > 1. |
| Mute | `T` | Click clip or track header to toggle mute. |
| Slip | `Y` | Drag audio/video clip body to shift source offset without moving clip position. |
| Slice | `C` | Click clip to split at mouse position. |
| Select | `S` or `Esc` | Drag marquee; `Ctrl/Cmd+click` adds to selection; `Shift+click` range-selects. |
| Zoom | `Z` | Drag horizontally to zoom time; `Alt+scroll` also zooms. |
| Playback | `Space` / `Enter` | Scrub playhead; double-click clip to start playback from clip start. |

Global shortcuts (FL Studio-compatible where noted):
- `F5`: focus/open Playlist panel.
- `Ctrl/Cmd+C`, `Ctrl/Cmd+V`, `Ctrl/Cmd+X`: copy/paste/cut selected clips.
- `Ctrl/Cmd+D`: duplicate selection.
- `Ctrl/Cmd+U`: make unique.
- `Ctrl/Cmd+G`: group selected clips.
- `Ctrl/Cmd+L`: toggle loop region from selection.
- `1`, `2`, `3`, `4`, `5`, `6`, `7`: snap mode cycle.
- `Ctrl/Cmd+scroll`: horizontal zoom.
- `Shift+scroll`: vertical zoom.

#### Canvas rendering

- **Grid**: vertical lines per beat and bar; bar lines heavier. Background uses `editor.background` theme token; grid uses `editorLineNumber.foreground` at 30% opacity.
- **Clips**: rounded rectangle with track color fill at 40% opacity and 1 px border at full opacity. Selected clips show 2 px highlight using `focusBorder` token.
- **Audio clips**: waveform thumbnail drawn from precomputed peak data (`assets/<assetId>.peaks.json`). Center line, positive/negative fills.
- **Pattern clips**: miniature note preview (piano roll strip) showing note start/end/velocity as vertical bars.
- **Automation clips**: breakpoint polyline with curve handles; current value visible as a faint fill under the curve.
- **Video clips**: filmstrip icon + timecode label; thumbnail optional (engine generates on import).
- **Fades**: small triangles/handles in top corners; fade curve overlaid on clip waveform/preview.
- **Playhead**: red vertical line (`#ef4444`) with triangle handle in ruler; scrubbing updates engine transport on mouse release (or continuously if dragging fast).
- **Loop region**: highlighted background between `loopStartTicks` and `loopEndTicks` using `editor.selectionBackground` token.

#### Context menus

- **Clip context menu**: rename, color, duplicate, make unique, split, glue, loop, fade in/out, mute, delete, bounce to audio.
- **Ruler context menu**: add marker, set loop start/end, snap mode, time signature.
- **Track header context menu**: insert track, delete track, duplicate track, freeze, route to mixer insert.

### Algorithms / behavior

#### Snap calculation

```ts
function snapTick(rawTick: number, snapMode: SnapMode, bpm: number, sampleRate: number): number {
  if (snapMode === "off") return Math.round(rawTick);
  if (snapMode === "sample-accurate") {
    const samplesPerTick = (60 * sampleRate) / (bpm * PPQN);
    const sample = Math.round(rawTick * samplesPerTick);
    return sample / samplesPerTick;
  }
  const divisions: Record<Exclude<SnapMode, "off" | "sample-accurate">, number> = {
    "1/4-beat": PPQN / 4,
    "1/2-beat": PPQN / 2,
    beat: PPQN,
    bar: PPQN * beatsPerBar,
  };
  const grid = divisions[snapMode];
  return Math.round(rawTick / grid) * grid;
}
```

#### Hit testing

The canvas builds a spatial index on every model change:

```ts
interface HitRegion {
  clipId: string;
  kind: "body" | "left-edge" | "right-edge" | "top-left-fade" | "top-right-fade";
  rect: { x: number; y: number; w: number; h: number };
}

function buildHitIndex(clips: PlaylistClip[], tracks: PlaylistTrack[], viewState: PlaylistViewState): HitRegion[];
function hitTest(x: number, y: number, index: HitRegion[]): HitRegion | null;
```

Edge handles are 6 px wide; fade handles are 12×12 px at top corners.

#### Waveform thumbnail generation

On audio asset import, the backend calls the engine to generate a peak file:

```ts
// assets/<assetId>.peaks.json
{
  "version": 1,
  "sampleRate": 48000,
  "framesPerPeak": 256,
  "durationSamples": 1920000,
  "peaks": [
    { "min": -0.3, "max": 0.4 },
    ...
  ]
}
```

The canvas scales peaks to clip width and draws min/max pairs.

#### Automation curve evaluation

For a clip with points sorted by `tick`, the value at playlist tick `t` is:

```ts
function evaluateAutomation(points: AutomationPoint[], t: number): number {
  if (t <= points[0].tick) return points[0].value;
  if (t >= points[points.length - 1].tick) return points[points.length - 1].value;
  const i = points.findIndex((p) => p.tick > t);
  const p0 = points[i - 1];
  const p1 = points[i];
  const ratio = (t - p0.tick) / (p1.tick - p0.tick);
  return interpolate(p0.value, p1.value, ratio, p0.curve);
}
```

Supported curves: linear, smooth (cubic ease-in-out), hold (step), logarithmic, exponential.

#### Make unique

- **Pattern clip**: clone the pattern (including channel rack notes/events) with a new UUID, update `clip.patternId` to the clone.
- **Audio/video/automation clip**: create a new clip record with a new UUID referencing the same asset; the source asset remains shared until explicitly bounced/destructively edited.

#### Glue

Allowed only when:
- All clips are on the same track.
- They are adjacent (end of previous == start of next) within 1 tick.
- For audio clips: same `assetId`, `stretchMode`, `pitchSemitones`, and compatible fades.
- For automation clips: same `target`.

Result is a single clip spanning the union with merged content.

## Implementation plan

1. **Shared schemas**: implement `packages/shared/src/schemas/playlist.ts`, `time.ts`, and websocket event types; add unit tests for schema round-trips.
2. **Backend model**: add `PlaylistModel` to the in-memory project store; implement HTTP routes and WebSocket event broadcasting.
3. **Engine bridge**: implement playlist clip/track commands in the JUCE engine and wire them to the transport/playback graph.
4. **Canvas component**: build `PlaylistCanvas` with hit testing, clip rendering, ruler, and playhead.
5. **Track headers**: implement `TrackHeaderList` synchronized with canvas scroll.
6. **Tools and interactions**: implement tool state machine, drag handlers, marquee selection, snap, copy/paste clipboard.
7. **Waveform/MIDI previews**: integrate peak file generation and note-preview rendering.
8. **Fades and automation curves**: implement fade handles and breakpoint editing on the canvas.
9. **Video track**: receive engine frame-sync events and display timecode/thumbnails; do not implement a full video editor.
10. **Agent skills**: expose playlist skills and add integration tests.
11. **E2E**: automate create-track, place-clip, split, duplicate, zoom, scrub, and loop workflows.

## Testing strategy

- **Unit tests** (`packages/shared/tests/playlist-schema.test.ts`):
  - Validate `PlaylistTrackSchema`, `PlaylistClipSchema`, `PlaylistViewStateSchema` for valid/invalid inputs.
  - Test `snapTick` for all snap modes and edge cases (zero, negative input clamped, sample-accurate).
  - Test `evaluateAutomation` for each curve type.
  - Test `makeUnique` and `glue` preconditions.

- **Integration tests** (`packages/backend/tests/playlist-api.test.ts`):
  - Create/read/update/delete tracks and clips via HTTP endpoints.
  - Copy/paste clipboard persists per project session.
  - WebSocket broadcasts `playlist.model` after mutations.
  - Invalid schema payloads return HTTP 400.

- **Engine integration tests** (`engine/tests/playlist_commands_test.cpp`):
  - Engine accepts `PlaylistSetClipCommand` and schedules audio correctly.
  - Split and delete commands update the playback graph without glitches.

- **E2E tests** (`packages/web/e2e/playlist.spec.ts`):
  - Create a project, add an audio track, import a sample, place a clip, zoom, split, and duplicate.
  - Toggle mute/solo on track headers and verify engine state.
  - Scrub playhead and verify transport position sync.
  - Set a loop region and verify playback loops.

## Acceptance criteria

- [ ] `PlaylistModel` and `PlaylistClip` schemas exist in `packages/shared` and pass 100% of unit tests.
- [ ] The backend exposes every endpoint listed in the API section and returns HTTP 400 for schema-invalid payloads.
- [ ] WebSocket events `playlist.clip.created`, `playlist.clip.updated`, `playlist.clip.deleted`, `playlist.track.updated`, and `transport.position` are broadcast to all clients in the same project session.
- [ ] The JUCE engine accepts and acts on `PlaylistSetClipCommand`, `PlaylistDeleteClipCommand`, `PlaylistSplitClipCommand`, `PlaylistUpdateTrackCommand`, and `PlaylistScrubCommand` without dropping audio.
- [ ] The playlist panel renders in a Dockview tab and displays up to 500 tracks.
- [ ] Track headers show mute/solo/record-arm buttons, volume fader, pan knob, and input/output routing; toggling mute/solo updates engine playback within 50 ms.
- [ ] The canvas renders audio clips with waveform thumbnails, pattern clips with MIDI note previews, automation clips with breakpoint curves, and video clips with timecode labels.
- [ ] All eight tools (draw, paint, delete, mute, slip, slice, select, zoom) are selectable via toolbar or single-key shortcuts and perform their defined actions.
- [ ] All six snap modes (off, 1/4-beat, 1/2-beat, beat, bar, sample-accurate) apply to clip creation, move, resize, split, and marker placement.
- [ ] Clips support copy, paste, duplicate, make unique, group, color, rename, loop, and stretch; duplicate offsets by exactly one bar by default.
- [ ] Audio/video clips support non-destructive fade in/out by dragging the top-left and top-right corners; fade types include linear, logarithmic, exponential, and s-curve.
- [ ] The time ruler shows bar/beat markers, supports horizontal zoom, and allows playhead scrubbing; scrubbing updates engine position and UI playhead continuously.
- [ ] A video track type exists and stays frame-accurate in sync with audio transport (≤1 frame drift at 30 fps during 60-second playback).
- [ ] Markers can be added, renamed, moved, colored, and deleted from the ruler context menu.
- [ ] Agent skills `playlist_create_track`, `playlist_create_pattern_clip`, `playlist_create_audio_clip`, `playlist_delete_clip`, and `playlist_set_loop` execute successfully through the backend API.
- [ ] Playlist state is persisted in `project.json` inside the `.singularity` bundle and reloads identically.
- [ ] No `TODO`, `FIXME`, or placeholder implementations remain in the playlist subsystem code merged to `integration/fl-studio-rewrite`.

## Dependencies

- **Spec 17: Singularity v1.0 Standalone App Architecture** — defines the runtime stack, communication paths, and package responsibilities on which this spec builds.
- **Spec 22: Project Model and .singularity Bundle Format** — provides the project bundle schema and ZIP persistence pattern used by the playlist model.
- **Spec 27: Piano Roll** — pattern clips reference pattern data created/edited there.
- **Spec 33: Automation, MIDI, and Transport** — automation clips reference parameter targets defined there.

## Blocks

- **Spec 34: Export, Rendering, and AI Mastering** — export range and stem selection derive from playlist selection and loop region.
- **Spec 29: Mixer and Routing Graph** — track header output routing and mute/solo state must stay bidirectionally synchronized with mixer inserts.
- **Spec 22: Project Model and .singularity Bundle Format** — full `project.json` serialization of playlist data depends on the model defined in this spec.

## Notes / open questions

- **Decision made**: maximum playlist track count is **500**, matching FL Studio's default playlist track limit. This is a parity-driven decision and is encoded in the `PlaylistTrackSchema.index` max validator.
- **Decision made**: PPQN is fixed at **960 ticks per quarter note** for canonical musical time. Audio clips additionally store sample boundaries for sample-accurate engine scheduling.
- **Decision made**: video track is a first-class playlist track type, not a separate panel. The engine renders video; the UI receives only frame/time sync events and thumbnails.
- **Decision made**: "make unique" for pattern clips creates a deep copy of the pattern (notes + channel rack events). For audio/video/automation clips it creates a new clip record sharing the same asset; destructive editing of the asset is out of scope for this spec.
- The exact VS Code theme token mapping for track header backgrounds and clip selection highlights will be finalized in the design-system spec, but the tokens referenced here (`editor.background`, `editorLineNumber.foreground`, `focusBorder`, `editor.selectionBackground`) are required inputs.
