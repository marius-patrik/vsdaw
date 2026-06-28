# Spec 27: Piano Roll

## Objective

Define the Singularity v1.0 Piano Roll: a complete FL Studio-parity MIDI note and event editor for patterns, rendered on HTML5 Canvas, with note tools, operations, velocity/CC lanes, scale and chord helpers, ghost notes, user scripting, and generative composition helpers.

## Motivation

The Piano Roll is the primary surface for melodic, harmonic, and rhythmic composition. To match FL Studio it must support fast note entry, precise editing, expressive control (velocity and continuous controllers), composition aids (scale highlighting, chord stamps, arpeggiator, riff machine), and user extensibility. This spec turns the parity-spec checklist into concrete types, messages, functions, UI behavior, and acceptance criteria.

## Scope

### In scope

- Note grid with 128 MIDI rows, piano-keyboard sidebar, and octave labels.
- Tool palette: pencil, paint, brush, delete, mute, slip, slice, select, zoom, playback.
- Note operations: add, move, resize, duplicate, quantize, quick quantize, legato, strum.
- Per-note velocity editing via a dedicated velocity lane.
- CC lanes for Mod Wheel (CC1), Pitch Bend, Expression (CC11), and arbitrary custom CCs with freehand and line drawing.
- Scale highlighting across at least ten common scales.
- Chord stamp tool with triads, sevenths, ninths, suspended chords, and inversions.
- Note grouping with group color and name.
- Ghost notes: render notes from other channels in the same pattern and/or other patterns faintly.
- Piano roll scripting / tool extensions: load and run user JS scripts against the current pattern selection.
- Generative helpers: arpeggiator, chord-progression stamper, and riff machine.

### Out of scope

- Audio clip waveform editing (covered by Spec 28: Playlist / Arrangement).
- Full Edison-style destructive sample editing (covered by Spec 31: Audio Recording and Editing).
- Plugin parameter automation clips (covered by Spec 33: Automation, MIDI, and Transport).
- Score / staff notation (post-v1.0 roadmap).
- Proprietary FL Studio generators (Sytrus, Harmor, FLEX full, Gross Beat) — loaded as third-party plugins if owned.

## Related decisions

All entries in `docs/decisions.md` from 2026-06-25 apply, especially:

- Pivot to standalone FL Studio parity.
- Canvas rendering for editors.
- FL Studio-style Channel Rack + Patterns + Playlist project model.
- Multiple time representations (ticks/PPQN, seconds, bars/beats/ticks).
- Theme system based on VS Code themes mapped to CSS custom properties.
- No stubs, MVPs, or placeholders.
- Quality gates (TypeScript strict, Biome, Jest, clang-format/tidy, reviewer agent per PR).

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Piano Roll UI Panel                       │
│  Canvas (note grid + keyboard + lanes)                       │
│  Tool toolbar │ Scale/chord panel │ Inspector │ Lanes panel │
│  Zustand store (tool, selection, zoom, scroll, target)       │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket messages
┌──────────────────────────▼──────────────────────────────────┐
│                 Backend Project Model                        │
│  mutate pattern notes / events / groups                      │
│  persist to .singularity bundle                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ local TCP/socket
┌──────────────────────────▼──────────────────────────────────┐
│                   JUCE Engine                                │
│  update playback pattern; preview notes; render MIDI         │
└─────────────────────────────────────────────────────────────┘
```

The Piano Roll always edits a single active target: `{ patternId, channelId }`. The target is set by opening the Piano Roll from the Channel Rack, the Playlist pattern clip context menu, or the F7 shortcut. All note and event mutations are applied to that target; other data are rendered as ghosts.

### Data model

#### Time base

```ts
// packages/shared/src/constants/time.ts
export const PPQN = 960; // pulses per quarter note; canonical tick resolution
export const DEFAULT_PATTERN_LENGTH_TICKS = PPQN * 4; // one 4/4 bar
```

#### Notes

```ts
// packages/shared/src/schemas/pianoRoll.ts
import { z } from 'zod';

export const NoteSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string(),
  channelId: z.string(),
  startTick: z.number().int().min(0),
  durationTicks: z.number().int().min(1),
  key: z.number().int().min(0).max(127), // MIDI note number
  velocity: z.number().int().min(0).max(127).default(100),
  pan: z.number().int().min(-64).max(63).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  name: z.string().max(64).optional(),
  groupId: z.string().optional(),
  muted: z.boolean().default(false),
});
export type Note = z.infer<typeof NoteSchema>;
```

#### Events (CC / pitch bend / channel pressure)

```ts
export const CCEventSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string(),
  channelId: z.string(),
  startTick: z.number().int().min(0),
  type: z.literal('cc'),
  controller: z.number().int().min(0).max(127),
  value: z.number().int().min(0).max(127),
});

export const PitchBendEventSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string(),
  channelId: z.string(),
  startTick: z.number().int().min(0),
  type: z.literal('pitchBend'),
  value: z.number().int().min(-8192).max(8191),
});

export const ChannelPressureEventSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string(),
  channelId: z.string(),
  startTick: z.number().int().min(0),
  type: z.literal('channelPressure'),
  value: z.number().int().min(0).max(127),
});

export const PatternEventSchema = z.discriminatedUnion('type', [
  CCEventSchema,
  PitchBendEventSchema,
  ChannelPressureEventSchema,
]);
export type PatternEvent = z.infer<typeof PatternEventSchema>;
```

#### Pattern channel data

```ts
export const PatternChannelDataSchema = z.object({
  channelId: z.string(),
  notes: z.array(NoteSchema),
  events: z.array(PatternEventSchema),
  stepSequence: z.array(z.boolean()).max(64).optional(),
});

export const PatternSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(128),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lengthTicks: z.number().int().min(1).default(DEFAULT_PATTERN_LENGTH_TICKS),
  channelData: z.record(z.string(), PatternChannelDataSchema),
});
export type Pattern = z.infer<typeof PatternSchema>;
```

Notes and events are stored per channel inside a pattern. The active target selects one `channelData[channelId]` bucket to edit.

#### Note groups

```ts
export const NoteGroupSchema = z.object({
  id: z.string().uuid(),
  patternId: z.string(),
  channelId: z.string(),
  name: z.string().max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type NoteGroup = z.infer<typeof NoteGroupSchema>;
```

#### UI state

```ts
// packages/shared/src/schemas/pianoRollUi.ts
export type PianoRollTool =
  | 'pencil'
  | 'paint'
  | 'brush'
  | 'delete'
  | 'mute'
  | 'slip'
  | 'slice'
  | 'select'
  | 'zoom'
  | 'playback';

export type SnapGrid =
  | 'off'
  | `${number}/${number}` // e.g. '1/4', '1/8', '1/16', '1/32'
  | 'bar'
  | 'beat';

export const PianoRollUiStateSchema = z.object({
  target: z
    .object({ patternId: z.string(), channelId: z.string() })
    .nullable(),
  tool: z.enum([
    'pencil',
    'paint',
    'brush',
    'delete',
    'mute',
    'slip',
    'slice',
    'select',
    'zoom',
    'playback',
  ]),
  previousTool: z.enum([
    'pencil',
    'paint',
    'brush',
    'delete',
    'mute',
    'slip',
    'slice',
    'select',
    'zoom',
    'playback',
  ]),
  selectedNoteIds: z.array(z.string().uuid()),
  selectedEventIds: z.array(z.string().uuid()),
  snap: z.object({
    grid: z.enum(['off', 'bar', 'beat', '1/4', '1/8', '1/16', '1/32', '1/64']),
    strengthPercent: z.number().min(0).max(100).default(100),
    quantizeDuration: z.boolean().default(false),
  }),
  scale: z.object({
    root: z.number().int().min(0).max(11).default(0), // C = 0
    type: z.enum([
      'major',
      'minor',
      'harmonicMinor',
      'melodicMinor',
      'dorian',
      'phrygian',
      'lydian',
      'mixolydian',
      'majorPentatonic',
      'minorPentatonic',
      'blues',
    ]),
  }),
  ghostSources: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('channel'), id: z.string() }),
      z.object({ kind: z.literal('pattern'), id: z.string() }),
    ])
  ),
  zoom: z.object({ x: z.number().positive().default(1), y: z.number().positive().default(1) }),
  scroll: z.object({ x: z.number().default(0), y: z.number().default(0) }),
  velocityLane: z.object({
    visible: z.boolean().default(true),
    heightPx: z.number().int().min(40).default(120),
  }),
  ccLanes: z.array(
    z.object({
      id: z.string().uuid(),
      controller: z.union([z.number().int().min(0).max(127), z.literal('pitchBend'), z.literal('channelPressure')]),
      visible: z.boolean().default(true),
      heightPx: z.number().int().min(40).default(100),
    })
  ),
});
export type PianoRollUiState = z.infer<typeof PianoRollUiStateSchema>;
```

### API / interface

All UI-backend messages use the shared JSON envelope from Spec 17:

```ts
interface Message<T = unknown> {
  id: string;
  type: string;
  payload: T;
}
```

#### WebSocket message types (UI → backend)

| Type | Payload | Response |
|---|---|---|
| `pianoRoll.setTarget` | `{ patternId: string; channelId: string }` | `pianoRoll.targetChanged` |
| `pianoRoll.addNotes` | `{ patternId; channelId; notes: Array<Omit<Note,'id'>> }` | `{ notes: Note[] }` |
| `pianoRoll.moveNotes` | `{ patternId; channelId; noteIds; deltaTicks; deltaKey }` | `{ notes: Note[] }` |
| `pianoRoll.resizeNotes` | `{ patternId; channelId; noteIds; lengthTicks; anchor: 'start' \| 'end' }` | `{ notes: Note[] }` |
| `pianoRoll.deleteNotes` | `{ patternId; channelId; noteIds }` | `{ deletedIds: string[] }` |
| `pianoRoll.duplicateNotes` | `{ patternId; channelId; noteIds; offsetTicks }` | `{ notes: Note[] }` |
| `pianoRoll.setNoteProperties` | `{ patternId; channelId; noteIds; patch: Partial<Note> }` | `{ notes: Note[] }` |
| `pianoRoll.quantizeNotes` | `{ patternId; channelId; noteIds; gridTicks; strength; quantizeDuration }` | `{ notes: Note[] }` |
| `pianoRoll.quickQuantize` | `{ patternId; channelId; noteIds }` | `{ notes: Note[] }` |
| `pianoRoll.applyLegato` | `{ patternId; channelId; noteIds }` | `{ notes: Note[] }` |
| `pianoRoll.applyStrum` | `{ patternId; channelId; noteIds; direction: 'up' \| 'down'; tickOffset: number }` | `{ notes: Note[] }` |
| `pianoRoll.createGroup` | `{ patternId; channelId; noteIds; name; color }` | `{ group: NoteGroup; notes: Note[] }` |
| `pianoRoll.renameGroup` | `{ patternId; channelId; groupId; name }` | `{ group: NoteGroup }` |
| `pianoRoll.deleteGroup` | `{ patternId; channelId; groupId }` | `{ ungroupedIds: string[] }` |
| `pianoRoll.addCCEvents` | `{ patternId; channelId; events: Array<Omit<PatternEvent,'id'>> }` | `{ events: PatternEvent[] }` |
| `pianoRoll.moveCCEvents` | `{ patternId; channelId; eventIds; deltaTicks; deltaValue? }` | `{ events: PatternEvent[] }` |
| `pianoRoll.deleteCCEvents` | `{ patternId; channelId; eventIds }` | `{ deletedIds: string[] }` |
| `pianoRoll.setGhostSources` | `{ sources: GhostSource[] }` | ack |
| `pianoRoll.runScript` | `{ scriptId: string; args?: Record<string, unknown> }` | `{ resultPatch: NotePatch }` |
| `pianoRoll.stampChord` | `{ patternId; channelId; startTick; rootKey; quality; inversion; lengthTicks }` | `{ notes: Note[] }` |
| `pianoRoll.generateArpeggio` | `{ patternId; channelId; sourceNoteIds; style; octaveRange; stepTicks; gate }` | `{ notes: Note[] }` |
| `pianoRoll.generateProgression` | `{ patternId; channelId; key; scale; progression; startTick; lengthTicksPerChord }` | `{ notes: Note[] }` |
| `pianoRoll.generateRiff` | `{ patternId; channelId; key; scale; startTick; lengthTicks; density }` | `{ notes: Note[] }` |
| `transport.previewNote` | `{ channelId; key; velocity; durationMs }` | ack |

#### Backend functions

```ts
// packages/backend/src/project/pianoRoll.ts

export function setPianoRollTarget(
  session: Session,
  target: { patternId: string; channelId: string }
): void;

export function getChannelNotes(
  project: Project,
  patternId: string,
  channelId: string
): Note[];

export function addNotes(
  project: Project,
  patternId: string,
  channelId: string,
  notes: Array<Omit<Note, 'id'>>
): Note[];

export function moveNotes(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  deltaTicks: number,
  deltaKey: number
): Note[];

export function resizeNotes(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  lengthTicks: number,
  anchor: 'start' | 'end'
): Note[];

export function deleteNotes(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[]
): string[];

export function duplicateNotes(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  offsetTicks: number
): Note[];

export function setNoteProperties(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  patch: Partial<Omit<Note, 'id' | 'patternId' | 'channelId'>>
): Note[];

export function quantizeNotes(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  gridTicks: number,
  strength: number,
  quantizeDuration: boolean
): Note[];

export function quickQuantize(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[]
): Note[];

export function applyLegato(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[]
): Note[];

export function applyStrum(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  direction: 'up' | 'down',
  tickOffset: number
): Note[];

export function createNoteGroup(
  project: Project,
  patternId: string,
  channelId: string,
  noteIds: string[],
  name: string,
  color: string
): { group: NoteGroup; notes: Note[] };

export function addCCEvents(
  project: Project,
  patternId: string,
  channelId: string,
  events: Array<Omit<PatternEvent, 'id'>>
): PatternEvent[];

export function moveCCEvents(
  project: Project,
  patternId: string,
  channelId: string,
  eventIds: string[],
  deltaTicks: number,
  deltaValue?: number
): PatternEvent[];

export function deleteCCEvents(
  project: Project,
  patternId: string,
  channelId: string,
  eventIds: string[]
): string[];

export function runPianoRollScript(
  project: Project,
  target: { patternId: string; channelId: string },
  scriptId: string,
  args?: Record<string, unknown>
): { notes: Note[]; events: PatternEvent[]; deleteNoteIds: string[]; deleteEventIds: string[] };
```

Every mutation must:

1. Validate payloads with the shared Zod schemas.
2. Apply the mutation atomically to the in-memory project model.
3. Persist the change to the `.singularity` bundle via the project save path.
4. Push the updated notes/events to the JUCE engine over the local TCP/socket protocol.
5. Broadcast a WebSocket event (`project.updated`) so all connected UI clients sync.

#### Engine messages (backend → JUCE)

```ts
// local TCP/socket command protocol
{
  type: 'pattern.setChannelNotes',
  payload: { patternId: string; channelId: string; notes: Note[] }
}
{
  type: 'pattern.setChannelEvents',
  payload: { patternId: string; channelId: string; events: PatternEvent[] }
}
{
  type: 'transport.previewNote',
  payload: { channelId: string; key: number; velocity: number; durationMs: number }
}
```

The engine must reflect the new pattern data in time for the next audio callback.

### UI/UX

#### Layout

The Piano Roll panel is a Dockview panel with the following regions:

1. **Top toolbar**: tool buttons, snap selector, quantize menu, scale/chord toggles, ghost-note toggles, script menu, zoom controls.
2. **Left sidebar**: vertical piano keyboard with octave labels (e.g. "C2", "C3"). Clicking a key previews the note.
3. **Main canvas**: note grid. X axis = time (bars/beats/ticks). Y axis = pitch. Black-key rows use a darker background than white-key rows.
4. **Bottom lanes**: velocity lane (always present) and zero-or-more CC lanes. Each lane is a resizable horizontal panel with its own mini-toolbar.
5. **Right inspector** (optional side panel): note properties (start, length, key, velocity, pan, color, name, group).

#### Tool behaviors

| Tool | Pointer action | Modifier behavior |
|---|---|---|
| **Pencil** | Click empty cell → create note of length = snap grid. Drag right → set initial length. | `Shift` disables snap. `Alt` copies note under cursor instead of creating. |
| **Paint** | Click-drag horizontally across a row → paint one note per snap cell. | `Shift` disables snap. |
| **Brush** | Click-drag freely → create notes whose pitch follows the vertical path and length equals the snap grid. | `Shift` locks to horizontal (same pitch). |
| **Delete** | Click note → delete. Drag across notes → delete all touched. | — |
| **Mute** | Click note → toggle `muted`. | — |
| **Slip** | Drag selected notes horizontally → move start tick while preserving pitch and length. | `Shift` disables snap. |
| **Slice** | Click a note → split at cursor tick into two adjacent notes. `Shift`+drag draws a vertical slice line and splits every note it crosses. | — |
| **Select** | Click to select; `Ctrl/Cmd` toggle; `Shift` range select; drag for marquee. | `Ctrl/Cmd+A` selects all notes in target. |
| **Zoom** | Drag horizontally → zoom time. Drag vertically → zoom key height. Mouse wheel without tool also zooms. | — |
| **Playback** | Click grid → set playhead to that tick and start transport. Click note → preview note. | `Space` toggles transport from playhead. |

#### Snap grid

Snap is applied to start tick and duration. The grid choices map to ticks:

```ts
const SNAP_GRID_TICKS: Record<SnapGrid, number | null> = {
  off: null,
  bar: PPQN * 4,
  beat: PPQN,
  '1/4': PPQN / 4,
  '1/8': PPQN / 8,
  '1/16': PPQN / 16,
  '1/32': PPQN / 32,
  '1/64': PPQN / 64,
};
```

When `strengthPercent` < 100, the snapped position is a linear interpolation between the original and fully-snapped positions:

```ts
function applyStrength(original: number, snapped: number, strength: number): number {
  return original + (snapped - original) * (strength / 100);
}
```

#### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `F7` | Open / focus Piano Roll for the selected channel in the active pattern. |
| `P` | Pencil tool. |
| `B` | Brush tool. |
| `D` | Delete tool. |
| `M` | Mute tool. |
| `S` | Select tool. |
| `Z` | Zoom tool (press `Z`, drag, release to return to previous tool). |
| `Y` | Playback tool. |
| `Ctrl/Cmd + Q` | Quick quantize selected notes. |
| `Ctrl/Cmd + D` | Duplicate selected notes. |
| `Ctrl/Cmd + L` | Apply legato to selected notes. |
| `Ctrl/Cmd + U` | Strum up. |
| `Ctrl/Cmd + Shift + U` | Strum down. |
| `Delete` / `Backspace` | Delete selected notes. |
| `Ctrl/Cmd + Arrow` | Nudge selected notes by one snap grid (left/right) or one semitone (up/down). |
| `Alt + Drag` | Duplicate and drag. |

Shortcuts are managed by the global shortcut registry described in Spec 25: Dockview Layout and Shell Panels; defaults match FL Studio where possible.

#### Theme tokens

Piano Roll uses CSS custom properties mapped from the VS Code theme:

```css
--sing-piano-roll-bg: var(--editor-background);
--sing-piano-roll-grid-line: var(--panel-border);
--sing-piano-roll-beat-line: var(--foreground);
--sing-piano-roll-bar-line: var(--foreground);
--sing-piano-roll-white-key: var(--sideBar-background);
--sing-piano-roll-black-key: var(--panel-dropBorder);
--sing-piano-roll-note: var(--charts-blue);
--sing-piano-roll-note-selected: var(--charts-yellow);
--sing-piano-roll-note-muted: var(--disabledForeground);
--sing-piano-roll-ghost: var(--descriptionForeground);
--sing-piano-roll-velocity-lane-bg: var(--editor-background);
--sing-piano-roll-cc-lane-bg: var(--editor-background);
```

### Algorithms / behavior

#### Scale highlighting

`isKeyInScale(key, root, scaleType)` returns true when the interval from `root` to `key mod 12` is in the scale's interval set.

Supported scales and interval sets (semitones from root):

```ts
const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};
```

In-scale rows and keyboard keys receive a subtle highlight color (`--sing-piano-roll-scale-highlight`). Out-of-scale rows are shaded.

#### Chord stamp

`stampChord(rootKey, quality, inversion)` builds a chord and optionally rotates it:

```ts
type ChordQuality =
  | 'major' | 'minor' | 'dim' | 'aug'
  | 'maj7' | 'min7' | 'dom7' | 'min7b5'
  | 'maj9' | 'min9' | 'dom9'
  | 'sus2' | 'sus4';

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

function buildChord(rootKey: number, quality: ChordQuality, inversion: number): number[] {
  const intervals = CHORD_INTERVALS[quality];
  const notes = intervals.map((i) => rootKey + i);
  const safeInversion = inversion % notes.length;
  return [...notes.slice(safeInversion), ...notes.slice(0, safeInversion).map((n) => n + 12)];
}
```

The chord-stamp tool inserts one note per chord member at the clicked start tick with the configured length.

#### Legato

```ts
function applyLegato(notes: Note[]): Note[] {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  return sorted.map((note, i) => {
    if (i === sorted.length - 1) return note;
    const next = sorted[i + 1];
    return { ...note, lengthTicks: next.startTick - note.startTick };
  });
}
```

If the computed length is < 1 tick, clamp to 1 tick.

#### Strum

```ts
function applyStrum(notes: Note[], direction: 'up' | 'down', tickOffset: number): Note[] {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
  return sorted.map((note, i) => ({
    ...note,
    startTick: Math.max(0, note.startTick + (direction === 'up' ? 1 : -1) * i * tickOffset),
  }));
}
```

#### Arpeggiator

```ts
type ArpeggioStyle = 'up' | 'down' | 'upDown' | 'downUp' | 'random' | 'chord';

function arpeggiate(
  sourceNotes: Note[],
  style: ArpeggioStyle,
  octaveRange: number,
  stepTicks: number,
  gate: number // 0.0 - 1.0
): Note[] {
  const baseKeys = [...new Set(sourceNotes.map((n) => n.key))].sort((a, b) => a - b);
  const expanded: number[] = [];
  for (let oct = 0; oct < octaveRange; oct++) {
    expanded.push(...baseKeys.map((k) => k + oct * 12));
  }
  const ordered = style === 'down' || style === 'downUp' ? [...expanded].reverse() : expanded;
  let sequence: number[] = [];
  switch (style) {
    case 'up':
    case 'down':
      sequence = ordered;
      break;
    case 'upDown':
      sequence = [...ordered, ...ordered.slice(1, -1).reverse()];
      break;
    case 'downUp':
      sequence = [...ordered, ...ordered.slice(1, -1).reverse()];
      break;
    case 'random':
      sequence = Array.from({ length: ordered.length * 2 }, () => ordered[Math.floor(Math.random() * ordered.length)]);
      break;
    case 'chord':
      sequence = expanded; // all notes at once, one step per octave
      break;
  }
  const startTick = Math.min(...sourceNotes.map((n) => n.startTick));
  return sequence.map((key, i) => ({
    key,
    startTick: startTick + i * stepTicks,
    lengthTicks: Math.max(1, Math.floor(stepTicks * gate)),
    velocity: 100,
    // other Note fields filled by caller
  }));
}
```

#### CC lane drawing

Freehand drawing samples the pointer X position every 8 px and stores one event per sample. The line tool stores events at 1/32-beat intervals (PPQN / 8) between the start and end points, with linear interpolation of the value. Duplicate events at the same tick within the same lane are replaced by the last-drawn value.

#### Scripting API

User scripts run in a dedicated Web Worker. The backend sends a snapshot; the script returns a patch. The backend applies the patch after validation.

```ts
interface PianoRollScriptContext {
  readonly target: { patternId: string; channelId: string };
  readonly ppqn: number;
  getNotes(): ReadonlyArray<Readonly<Note>>;
  getSelectedNotes(): ReadonlyArray<Readonly<Note>>;
  getEvents(): ReadonlyArray<Readonly<PatternEvent>>;
  insertNote(partial: Omit<Note, 'id' | 'patternId' | 'channelId'>): Note;
  updateNote(id: string, patch: Partial<Omit<Note, 'id' | 'patternId' | 'channelId'>>): Note;
  deleteNote(id: string): void;
  insertEvent(partial: Omit<PatternEvent, 'id' | 'patternId' | 'channelId'>): PatternEvent;
  updateEvent(id: string, patch: Partial<PatternEvent>): PatternEvent;
  deleteEvent(id: string): void;
}
```

The returned patch must contain full mutated objects; the backend reconciles by ID. Scripts that throw or exceed 5 seconds are rejected and do not modify the project.

## Implementation plan

1. **Shared schemas**: add `pianoRoll.ts`, `pianoRollUi.ts`, and `time.ts` constants to `packages/shared`.
2. **Backend model**: implement the `packages/backend/src/project/pianoRoll.ts` mutation functions, validation, persistence, and engine push.
3. **Engine integration**: add `pattern.setChannelNotes`, `pattern.setChannelEvents`, and `transport.previewNote` handlers in the JUCE engine.
4. **Canvas renderer**: build the HTML5 Canvas note grid, keyboard sidebar, time ruler, and playhead in `packages/ui`.
5. **Tools**: implement pointer controllers for pencil, paint, brush, delete, mute, slip, slice, select, zoom, and playback.
6. **Lanes**: implement velocity lane and CC lane canvas panels with freehand/line drawing and lane management UI.
7. **Composition helpers**: implement scale highlighting, chord stamp, arpeggiator, chord-progression stamper, and riff machine.
8. **Groups, colors, names**: add note group CRUD and inspector controls.
9. **Ghost notes**: implement read-only rendering of notes from configured ghost sources.
10. **Scripting**: implement the Web Worker sandbox, script registry, and menu.
11. **Shortcuts and theme**: wire shortcuts through the global registry and apply theme tokens.
12. **Tests**: unit tests for pure math, integration tests for backend mutations, E2E tests for critical user flows.

## Testing strategy

- **Unit tests** (`packages/shared` / `packages/backend`):
  - Quantize, legato, strum, chord building, arpeggio generation, scale membership.
  - Snap grid tick conversion and strength interpolation.
  - Zod schema validation for notes, events, and UI state.
- **Integration tests** (`packages/backend`):
  - Each WebSocket message type produces the correct project model update and engine command.
  - Persistence round-trip: save and reload a `.singularity` bundle containing notes, events, and groups.
  - Script sandbox rejects malformed/timeout scripts without mutating state.
- **E2E tests** (`packages/desktop` or `packages/web`):
  - Create, move, resize, and delete notes with the mouse and keyboard.
  - Change velocity via the velocity lane and verify playback/engine state.
  - Draw a CC lane, save, reload, and assert events are restored.
  - Apply quantize, legato, strum, chord stamp, and arpeggiator; assert resulting note positions.
  - Toggle ghost notes and verify faint rendering (pixel or accessibility assertion).
  - Run a sample script that transposes selected notes by one octave.

## Acceptance criteria

- [ ] Pressing `F7` opens or focuses the Piano Roll panel and sets the target to the selected Channel Rack channel in the active pattern.
- [ ] The note grid renders 128 MIDI rows, a piano-keyboard sidebar with octave labels (e.g. "C2"), and bar/beat/tick grid lines.
- [ ] With the pencil tool, clicking an empty grid cell creates a note whose start and length are snapped to the current snap grid; the note appears on canvas and is persisted in `project.json` within 100 ms of mouse-up.
- [ ] Dragging a note body with any tool moves its start tick and key by snap-grid increments; a live preview follows the pointer and `pianoRoll.moveNotes` is sent on mouse-up.
- [ ] Dragging the right edge of a note resizes its length by snap-grid increments and sends `pianoRoll.resizeNotes` on mouse-up.
- [ ] The delete tool removes a clicked note; pressing `Delete` or `Backspace` removes all selected notes; `Ctrl/Cmd+Z` undoes the deletion.
- [ ] The select tool supports single click, `Ctrl/Cmd` toggle, `Shift` range select, and marquee selection; selected notes render with `--sing-piano-roll-note-selected`.
- [ ] `Ctrl/Cmd+D` duplicates selected notes offset by one snap grid; duplicates are persisted and selected.
- [ ] The quantize dialog snaps selected note starts (and optionally durations) to the chosen grid with configurable strength; `Ctrl/Cmd+Q` performs quick quantize using a 1/4-beat grid, 100% strength, start-only.
- [ ] Legato (`Ctrl/Cmd+L`) extends each selected note's end to the start of the next selected note sorted by start tick, without creating negative lengths.
- [ ] Strum (`Ctrl/Cmd+U` up, `Ctrl/Cmd+Shift+U` down) offsets selected note starts by 1–50 ticks per note in pitch order.
- [ ] The velocity lane renders one bar per note in view; dragging a bar updates `velocity` in real time and commits on mouse-up; values are clamped to 0–127.
- [ ] The CC lane panel supports adding lanes for Mod Wheel (CC1), Pitch Bend, Expression (CC11), and arbitrary CC numbers; freehand drawing stores events and line drawing stores interpolated events at 1/32-beat spacing.
- [ ] Scale highlighting tints rows and keyboard keys belonging to the selected scale and shades non-scale rows; at least the 11 scales listed in `SCALE_INTERVALS` are supported.
- [ ] The chord-stamp tool inserts the correct notes for the chosen quality and inversion at the clicked start tick and length.
- [ ] The arpeggiator helper generates notes from the current selection with styles `up`, `down`, `upDown`, `downUp`, `random`, and `chord`, supporting 1–4 octave ranges.
- [ ] The chord-progression helper inserts a chosen progression across consecutive bars as chord notes.
- [ ] The riff machine generates a monophonic phrase in the chosen key/scale and length, constrained to the selected scale.
- [ ] Note groups can be created, renamed, and deleted; notes in a group share a color and name; moving or resizing any note in a group applies the same transform to all group members.
- [ ] Ghost notes from configured sources render at ≤30% opacity, are not selectable, and do not generate MIDI during playback.
- [ ] Running a piano-roll script applies its returned patch to the project; scripts that throw or exceed 5 seconds return an error and leave the project unchanged.
- [ ] Every note/event mutation is reflected in JUCE engine playback within one audio callback of the backend commit.
- [ ] All functional acceptance criteria have automated unit or integration tests; visual/UX criteria have E2E or screenshot assertions.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture
- Spec 18: Monorepo and Build System
- Spec 19: Shared Protocol and Schemas
- Spec 20: JUCE Audio Engine Foundation
- Spec 22: Project Model and .singularity Bundle Format
- Spec 24: Design System and VS Code Theme Integration
- Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)

## Blocks

- Spec 28: Playlist and Arrangement (consumes pattern note data for MIDI clip thumbnails)
- Spec 33: Automation, MIDI, and Transport (shares CC/event model and lane UI components)
- Spec 30: Browser, Plugin Database, and Presets (drag-and-drop samples/MIDI onto Piano Roll)
- Spec 35: AI Agent System (agent must be able to mutate notes via the backend functions defined here)
- Spec 34: Export, Rendering, and AI Mastering (must render pattern notes to audio)

## Notes / open questions

- **Active target decision**: The Piano Roll edits exactly one `{ patternId, channelId }` pair at a time. This matches FL Studio's behavior and keeps the data model simple. Opening the Piano Roll from the Channel Rack sets the target; opening from a Playlist clip sets both pattern and channel.
- **Storage decision**: Notes and events are stored per channel inside each pattern (`pattern.channels[channelId]`). This makes ghost-note lookups and pattern-channel isolation trivial and aligns with the Channel Rack + Patterns model.
- **PPQN decision**: Canonical resolution is `960 PPQN`, matching FL Studio's timeline resolution. All UI grids derive from this constant.
- **Quick quantize decision**: Default quick quantize is 1/4 beat, 100% strength, start-only. This is consistent with FL Studio's quick-quantize behavior and can be changed in settings.
- **Scripting sandbox decision**: User scripts run in a Web Worker with a read-only snapshot and must return an explicit patch. The backend validates the patch before applying it. This prevents scripts from directly mutating state or blocking the main thread.
- **Ghost source decision**: Ghost notes are purely visual. They read from other channels in the same pattern and/or other patterns. They do not participate in playback, selection, or export.
