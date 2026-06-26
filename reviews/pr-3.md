OpenAI Codex v0.142.2
--------
workdir: /Users/user/Projects/vsdaw
model: gpt-5.5
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019f04a8-bf3c-7c13-a139-c2a39336ed1c
--------
user
changes against 'main'
exec
/bin/zsh -lc 'git diff dbd672d8146dc971cad6592869e9c867c6b8a1ac' in /Users/user/Projects/vsdaw
 succeeded in 12350ms:
2026-06-26 18:00:09.739 xcodebuild[48882:10405495]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:00:11.243 xcodebuild[48882:10405494] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-IfbDoGlv' (errno=Operation not permitted)
2026-06-26 18:00:14.434 xcodebuild[48897:10405697]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:00:14.745 xcodebuild[48897:10405695] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
diff --git a/src/components/shared/Toolbar.tsx b/src/components/shared/Toolbar.tsx
index 0275f6c..4ae6f7d 100644
--- a/src/components/shared/Toolbar.tsx
+++ b/src/components/shared/Toolbar.tsx
@@ -1,8 +1,10 @@
-import { Download, LayoutGrid, MoreHorizontal, Save, Settings } from "lucide-react";
+import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
+import { Download, LayoutGrid, MoreHorizontal, Plus, Save, Settings } from "lucide-react";
 import * as React from "react";
 import type { TimePosition, TimeSignature, ViewName } from "../../views/shared/types.js";
 import { TimeDisplay } from "../transport/TimeDisplay.js";
 import { TransportControls } from "../transport/TransportControls.js";
+import { ViewSwitcher } from "./ViewSwitcher.js";
 
 export interface ToolbarProps {
   view: string;
@@ -24,6 +26,7 @@ export interface ToolbarProps {
   onSetTempo: (bpm: number) => void;
   onSetTimeSignature: (timeSignature: TimeSignature) => void;
   onShowView: (view: ViewName) => void;
+  onAddTrack?: (trackType: "audio" | "midi" | "bus") => void;
   onSettings: () => void;
   onExport: () => void;
 }
@@ -48,6 +51,7 @@ export const Toolbar: React.FC<ToolbarProps> = ({
   onSetTempo,
   onSetTimeSignature,
   onShowView,
+  onAddTrack,
   onSettings,
   onExport,
 }) => {
@@ -69,21 +73,31 @@ export const Toolbar: React.FC<ToolbarProps> = ({
     <div
       role="toolbar"
       aria-label={`${view} toolbar`}
-      className="flex items-center gap-2 px-2 py-1 select-none"
+      className="flex items-center gap-3 px-3 py-2 select-none"
       style={{
         borderBottom: "1px solid var(--vsdaw-border)",
         backgroundColor: "var(--vsdaw-panel-bg)",
       }}
     >
-      <div className="flex items-center gap-1.5 min-w-[120px]">
-        <span className="font-semibold whitespace-nowrap">{projectName || "Untitled"}</span>
-        <Save
-          size={12}
-          style={{ opacity: saved ? 0.3 : 1, color: saved ? "inherit" : "var(--vsdaw-warning)" }}
-          aria-label={saved ? "Saved" : "Unsaved changes"}
-        />
+      {/* Left: project info, add track, view switcher */}
+      <div className="flex items-center gap-3 min-w-0">
+        <div className="flex items-center gap-1.5 min-w-[120px]">
+          <span className="font-semibold whitespace-nowrap text-sm truncate">
+            {projectName || "Untitled"}
+          </span>
+          <Save
+            size={12}
+            style={{ opacity: saved ? 0.3 : 1, color: saved ? "inherit" : "var(--vsdaw-warning)" }}
+            aria-label={saved ? "Saved" : "Unsaved changes"}
+          />
+        </div>
+
+        {onAddTrack && <AddTrackButton onAddTrack={onAddTrack} />}
+
+        <ViewSwitcher active={view.toLowerCase() as ViewName} onChange={onShowView} />
       </div>
 
+      {/* Center: transport */}
       <div className="flex-1 flex justify-center">
         <TransportControls
           isPlaying={isPlaying}
@@ -99,63 +113,137 @@ export const Toolbar: React.FC<ToolbarProps> = ({
         />
       </div>
 
-      <TimeDisplay
-        position={position}
-        bpm={bpm}
-        timeSignature={timeSignature}
-        onSetTempo={onSetTempo}
-        onSetTimeSignature={onSetTimeSignature}
-      />
+      {/* Right: time/tempo, overflow */}
+      <div className="flex items-center gap-3 ml-auto">
+        <TimeDisplay
+          position={position}
+          bpm={bpm}
+          timeSignature={timeSignature}
+          onSetTempo={onSetTempo}
+          onSetTimeSignature={onSetTimeSignature}
+        />
+
+        <div className="relative" ref={overflowRef}>
+          <button
+            type="button"
+            aria-label="Overflow menu"
+            aria-haspopup="menu"
+            aria-expanded={showOverflow}
+            onClick={() => setShowOverflow((s) => !s)}
+            style={iconButtonStyle}
+          >
+            <MoreHorizontal size={16} />
+          </button>
+          {showOverflow && (
+            <div
+              role="menu"
+              className="absolute top-full right-0 mt-1 min-w-[180px] rounded z-50"
+              style={{
+                backgroundColor: "var(--vsdaw-panel-bg)",
+                border: "1px solid var(--vsdaw-border)",
+                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
+              }}
+            >
+              <OverflowItem
+                icon={<LayoutGrid size={14} />}
+                label="Show timeline"
+                onClick={() => {
+                  setShowOverflow(false);
+                  onShowView("timeline");
+                }}
+              />
+              <OverflowItem
+                icon={<Settings size={14} />}
+                label="Settings"
+                onClick={() => {
+                  setShowOverflow(false);
+                  onSettings();
+                }}
+              />
+              <OverflowItem
+                icon={<Download size={14} />}
+                label="Export"
+                onClick={() => {
+                  setShowOverflow(false);
+                  onExport();
+                }}
+              />
+            </div>
+          )}
+        </div>
+      </div>
+    </div>
+  );
+};
 
-      <div className="relative ml-auto" ref={overflowRef}>
+const AddTrackButton: React.FC<{ onAddTrack: (trackType: "audio" | "midi" | "bus") => void }> = ({
+  onAddTrack,
+}) => {
+  const [open, setOpen] = React.useState(false);
+  return (
+    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
+      <DropdownMenu.Trigger asChild>
         <button
           type="button"
-          aria-label="Overflow menu"
+          aria-label="Add track"
           aria-haspopup="menu"
-          aria-expanded={showOverflow}
-          onClick={() => setShowOverflow((s) => !s)}
-          style={iconButtonStyle}
+          aria-expanded={open}
+          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded cursor-pointer"
+          style={{
+            border: "1px solid var(--vsdaw-border)",
+            backgroundColor: "var(--vsdaw-button-bg)",
+            color: "var(--vsdaw-button-fg)",
+          }}
+          onMouseEnter={(e) => {
+            e.currentTarget.style.backgroundColor = "var(--vsdaw-button-hover)";
+          }}
+          onMouseLeave={(e) => {
+            e.currentTarget.style.backgroundColor = "var(--vsdaw-button-bg)";
+          }}
         >
-          <MoreHorizontal size={16} />
+          <Plus size={14} />
+          Add Track
         </button>
-        {showOverflow && (
-          <div
-            role="menu"
-            className="absolute top-full right-0 mt-1 min-w-[180px] rounded z-50"
-            style={{
-              backgroundColor: "var(--vsdaw-panel-bg)",
-              border: "1px solid var(--vsdaw-border)",
-              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
-            }}
+      </DropdownMenu.Trigger>
+      <DropdownMenu.Portal>
+        <DropdownMenu.Content
+          className="rounded z-50 min-w-[160px]"
+          style={{
+            backgroundColor: "var(--vsdaw-panel-bg)",
+            border: "1px solid var(--vsdaw-border)",
+            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
+          }}
+        >
+          <DropdownMenu.Item
+            className="px-3 py-2 text-xs cursor-pointer outline-none"
+            style={{ color: "inherit" }}
+            onSelect={() => onAddTrack("audio")}
+            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
+            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
           >
-            <OverflowItem
-              icon={<LayoutGrid size={14} />}
-              label="Show timeline"
-              onClick={() => {
-                setShowOverflow(false);
-                onShowView("timeline");
-              }}
-            />
-            <OverflowItem
-              icon={<Settings size={14} />}
-              label="Settings"
-              onClick={() => {
-                setShowOverflow(false);
-                onSettings();
-              }}
-            />
-            <OverflowItem
-              icon={<Download size={14} />}
-              label="Export"
-              onClick={() => {
-                setShowOverflow(false);
-                onExport();
-              }}
-            />
-          </div>
-        )}
-      </div>
-    </div>
+            Audio Track
+          </DropdownMenu.Item>
+          <DropdownMenu.Item
+            className="px-3 py-2 text-xs cursor-pointer outline-none"
+            style={{ color: "inherit" }}
+            onSelect={() => onAddTrack("midi")}
+            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
+            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
+          >
+            MIDI Track
+          </DropdownMenu.Item>
+          <DropdownMenu.Item
+            className="px-3 py-2 text-xs cursor-pointer outline-none"
+            style={{ color: "inherit" }}
+            onSelect={() => onAddTrack("bus")}
+            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
+            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
+          >
+            Bus Track
+          </DropdownMenu.Item>
+        </DropdownMenu.Content>
+      </DropdownMenu.Portal>
+    </DropdownMenu.Root>
   );
 };
 
@@ -182,8 +270,8 @@ export const iconButtonStyle: React.CSSProperties = {
   display: "inline-flex",
   alignItems: "center",
   justifyContent: "center",
-  width: 26,
-  height: 26,
+  width: 28,
+  height: 28,
   padding: 0,
   border: "1px solid transparent",
   borderRadius: 4,
diff --git a/src/components/shared/ViewSwitcher.tsx b/src/components/shared/ViewSwitcher.tsx
new file mode 100644
index 0000000..42ee75b
--- /dev/null
+++ b/src/components/shared/ViewSwitcher.tsx
@@ -0,0 +1,56 @@
+import type * as React from "react";
+import type { ViewName } from "../../views/shared/types.js";
+
+const VIEWS: { id: ViewName; label: string }[] = [
+  { id: "timeline", label: "Timeline" },
+  { id: "mixer", label: "Mixer" },
+  { id: "pianoRoll", label: "Piano Roll" },
+  { id: "browser", label: "Browser" },
+  { id: "graph", label: "Graph" },
+];
+
+export interface ViewSwitcherProps {
+  active: ViewName;
+  onChange: (view: ViewName) => void;
+}
+
+export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ active, onChange }) => {
+  return (
+    <div
+      role="tablist"
+      aria-label="View switcher"
+      className="flex items-center rounded overflow-hidden"
+      style={{
+        border: "1px solid var(--vsdaw-border)",
+        backgroundColor: "var(--vsdaw-bg)",
+      }}
+    >
+      {VIEWS.map((view) => {
+        const isActive = view.id === active;
+        return (
+          <button
+            key={view.id}
+            type="button"
+            role="tab"
+            aria-selected={isActive}
+            onClick={() => onChange(view.id)}
+            className="px-2.5 py-1 text-xs font-medium border-0 cursor-pointer whitespace-nowrap"
+            style={{
+              backgroundColor: isActive ? "var(--vsdaw-button-bg)" : "transparent",
+              color: isActive ? "var(--vsdaw-button-fg)" : "var(--vsdaw-fg)",
+              borderRight: "1px solid var(--vsdaw-border)",
+            }}
+            onMouseEnter={(e) => {
+              if (!isActive) e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)";
+            }}
+            onMouseLeave={(e) => {
+              if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
+            }}
+          >
+            {view.label}
+          </button>
+        );
+      })}
+    </div>
+  );
+};
diff --git a/src/components/transport/TransportControls.tsx b/src/components/transport/TransportControls.tsx
index a2e2552..bcf9077 100644
--- a/src/components/transport/TransportControls.tsx
+++ b/src/components/transport/TransportControls.tsx
@@ -31,7 +31,12 @@ export const TransportControls: React.FC<TransportControlsProps> = ({
 }) => {
   return (
     <TooltipProvider>
-      <div role="group" aria-label="Transport controls" className="flex items-center gap-1">
+      <div
+        role="group"
+        aria-label="Transport controls"
+        className="flex items-center gap-1.5 px-2 py-1 rounded"
+        style={{ backgroundColor: "var(--vsdaw-bg)", border: "1px solid var(--vsdaw-border)" }}
+      >
         <Tooltip content={isPlaying ? "Pause (Space)" : "Play (Space)"}>
           <TransportButton
             ariaLabel={isPlaying ? "Pause" : "Play"}
@@ -39,13 +44,13 @@ export const TransportControls: React.FC<TransportControlsProps> = ({
             onClick={isPlaying ? onPause : onPlay}
             accent={isPlaying}
           >
-            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
+            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
           </TransportButton>
         </Tooltip>
 
         <Tooltip content="Stop (Cmd/Ctrl+1)">
           <TransportButton ariaLabel="Stop" onClick={onStop}>
-            <Square size={14} />
+            <Square size={16} />
           </TransportButton>
         </Tooltip>
 
@@ -57,11 +62,11 @@ export const TransportControls: React.FC<TransportControlsProps> = ({
             accent={isRecording}
             accentColor="var(--vsdaw-error)"
           >
-            <Circle size={14} fill={isRecording ? "currentColor" : "none"} />
+            <Circle size={16} fill={isRecording ? "currentColor" : "none"} />
           </TransportButton>
         </Tooltip>
 
-        <div className="w-px h-4.5 mx-1" style={{ backgroundColor: "var(--vsdaw-border)" }} />
+        <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--vsdaw-border)" }} />
 
         <Tooltip content="Toggle loop (Cmd/Ctrl+L)">
           <TransportButton
@@ -70,7 +75,7 @@ export const TransportControls: React.FC<TransportControlsProps> = ({
             onClick={onToggleLoop}
             accent={isLooping}
           >
-            <Repeat size={14} />
+            <Repeat size={16} />
           </TransportButton>
         </Tooltip>
 
@@ -81,7 +86,7 @@ export const TransportControls: React.FC<TransportControlsProps> = ({
             onClick={onToggleMetronome}
             accent={isMetronomeEnabled}
           >
-            <Music2 size={14} />
+            <Music2 size={16} />
           </TransportButton>
         </Tooltip>
       </div>
@@ -106,6 +111,8 @@ const TransportButton: React.FC<{
       onClick={onClick}
       style={{
         ...iconButtonStyle,
+        width: 32,
+        height: 32,
         color: accent ? accentColor || "var(--vsdaw-button-fg)" : "inherit",
         backgroundColor: accent ? accentColor || "var(--vsdaw-button-bg)" : "transparent",
       }}
diff --git a/src/shared/midi.ts b/src/shared/midi.ts
new file mode 100644
index 0000000..a542c8f
--- /dev/null
+++ b/src/shared/midi.ts
@@ -0,0 +1,228 @@
+export interface MidiNote {
+  tick: number;
+  duration: number;
+  pitch: number;
+  velocity: number;
+}
+
+export interface ParsedMidiFile {
+  format: number;
+  ticksPerQuarter: number;
+  tempo: number; // microseconds per quarter note
+  notes: MidiNote[];
+}
+
+const DEFAULT_TEMPO = 500_000; // 120 BPM
+
+function readUint16(data: Uint8Array, offset: number): number {
+  return (data[offset] << 8) | data[offset + 1];
+}
+
+function readUint24(data: Uint8Array, offset: number): number {
+  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
+}
+
+function readUint32(data: Uint8Array, offset: number): number {
+  return (
+    (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]
+  );
+}
+
+function readVariableLength(data: Uint8Array, offset: number): { value: number; length: number } {
+  let value = 0;
+  let i = 0;
+  while (i < 4) {
+    const byte = data[offset + i];
+    value = (value << 7) | (byte & 0x7f);
+    i++;
+    if ((byte & 0x80) === 0) break;
+  }
+  return { value, length: i };
+}
+
+function textDecoder(bytes: Uint8Array): string {
+  if (typeof TextDecoder !== "undefined") {
+    return new TextDecoder("latin1").decode(bytes);
+  }
+  let result = "";
+  for (const byte of bytes) {
+    result += String.fromCharCode(byte);
+  }
+  return result;
+}
+
+export class MidiParseError extends Error {
+  constructor(message: string) {
+    super(message);
+    this.name = "MidiParseError";
+  }
+}
+
+export function parseMidiFile(data: Uint8Array): ParsedMidiFile {
+  if (data.length < 14 || textDecoder(data.subarray(0, 4)) !== "MThd") {
+    throw new MidiParseError("Not a valid MIDI file");
+  }
+
+  const headerLength = readUint32(data, 4);
+  if (headerLength !== 6) {
+    throw new MidiParseError(`Unsupported MIDI header length: ${headerLength}`);
+  }
+
+  const format = readUint16(data, 8);
+  const trackCount = readUint16(data, 10);
+  const division = readUint16(data, 12);
+
+  if ((division & 0x8000) !== 0) {
+    throw new MidiParseError("SMPTE timecode division is not supported");
+  }
+
+  const ticksPerQuarter = division;
+  let tempo = DEFAULT_TEMPO;
+  const notes: MidiNote[] = [];
+
+  let offset = 14;
+  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
+    if (offset + 8 > data.length) {
+      throw new MidiParseError("Truncated MIDI track header");
+    }
+
+    const chunkId = textDecoder(data.subarray(offset, offset + 4));
+    if (chunkId !== "MTrk") {
+      throw new MidiParseError(`Unexpected MIDI chunk: ${chunkId}`);
+    }
+    const chunkLength = readUint32(data, offset + 4);
+    offset += 8;
+
+    if (offset + chunkLength > data.length) {
+      throw new MidiParseError("Truncated MIDI track data");
+    }
+
+    const trackEnd = offset + chunkLength;
+    let tick = 0;
+    let runningStatus = 0;
+    const activeNotes = new Map<number, { tick: number; velocity: number }>();
+
+    while (offset < trackEnd) {
+      const delta = readVariableLength(data, offset);
+      offset += delta.length;
+      tick += delta.value;
+
+      if (offset >= trackEnd) {
+        throw new MidiParseError("Unexpected end of track while reading event status");
+      }
+
+      let status = data[offset];
+
+      if (status === 0xff) {
+        offset++;
+        const metaType = data[offset++];
+        const metaLength = readVariableLength(data, offset);
+        offset += metaLength.length;
+
+        if (offset + metaLength.value > trackEnd) {
+          throw new MidiParseError("Meta event exceeds track bounds");
+        }
+
+        if (metaType === 0x2f) {
+          offset += metaLength.value;
+          if (offset !== trackEnd) {
+            offset = trackEnd;
+          }
+          runningStatus = 0;
+          break;
+        }
+
+        if (metaType === 0x51 && metaLength.value === 3) {
+          tempo = readUint24(data, offset);
+        }
+
+        offset += metaLength.value;
+        runningStatus = 0;
+        continue;
+      }
+
+      if (status === 0xf0 || status === 0xf7) {
+        const sysexLength = readVariableLength(data, offset + 1);
+        offset += 1 + sysexLength.length + sysexLength.value;
+        runningStatus = 0;
+        continue;
+      }
+
+      if (status < 0x80) {
+        if (runningStatus === 0) {
+          throw new MidiParseError(`Unexpected data byte without running status: ${status}`);
+        }
+        status = runningStatus;
+      } else {
+        runningStatus = status;
+        offset++;
+      }
+
+      const command = status & 0xf0;
+      switch (command) {
+        case 0x80: {
+          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated note-off event");
+          const pitch = data[offset++];
+          offset++;
+          closeNote(activeNotes, notes, pitch, tick);
+          break;
+        }
+        case 0x90: {
+          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated note-on event");
+          const pitch = data[offset++];
+          const velocity = data[offset++];
+          if (velocity === 0) {
+            closeNote(activeNotes, notes, pitch, tick);
+          } else {
+            activeNotes.set(pitch, { tick, velocity });
+          }
+          break;
+        }
+        case 0xa0:
+        case 0xb0: {
+          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated MIDI event");
+          offset += 2;
+          break;
+        }
+        case 0xc0:
+        case 0xd0: {
+          offset += 1;
+          break;
+        }
+        case 0xe0: {
+          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated pitch-bend event");
+          offset += 2;
+          break;
+        }
+        default: {
+          throw new MidiParseError(`Unsupported MIDI status: ${status.toString(16)}`);
+        }
+      }
+    }
+
+    for (const [pitch, note] of activeNotes) {
+      notes.push({ tick: note.tick, duration: tick - note.tick, pitch, velocity: note.velocity });
+    }
+  }
+
+  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
+
+  return { format, ticksPerQuarter, tempo, notes };
+}
+
+function closeNote(
+  activeNotes: Map<number, { tick: number; velocity: number }>,
+  notes: MidiNote[],
+  pitch: number,
+  tick: number,
+): void {
+  const note = activeNotes.get(pitch);
+  if (!note) return;
+  activeNotes.delete(pitch);
+  notes.push({
+    tick: note.tick,
+    duration: Math.max(0, tick - note.tick),
+    pitch,
+    velocity: note.velocity,
+  });
+}
diff --git a/src/views/timeline/main.tsx b/src/views/timeline/main.tsx
index 51003e0..ede1ff0 100644
--- a/src/views/timeline/main.tsx
+++ b/src/views/timeline/main.tsx
@@ -108,13 +108,14 @@ const TimelineView: React.FC = () => {
             onSetTempo={state.transport.setTempo}
             onSetTimeSignature={state.transport.setTimeSignature}
             onShowView={state.commands.showView}
+            onAddTrack={state.trackActions.createTrack}
             onSettings={() => state.commands.showView("browser")}
             onExport={state.commands.export}
           />
           <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
             <div
               ref={headerScrollRef}
-              role="rowgroup"
+              role="region"
               aria-label="Track headers"
               onScroll={() => syncScroll("header")}
               style={{ overflowY: "auto", flexShrink: 0 }}
diff --git a/tests/unit/midi.test.ts b/tests/unit/midi.test.ts
new file mode 100644
index 0000000..7f03676
--- /dev/null
+++ b/tests/unit/midi.test.ts
@@ -0,0 +1,96 @@
+import { MidiParseError, parseMidiFile } from "../../src/shared/midi.js";
+
+function buildMinimalMidi(): Uint8Array {
+  const header = new Uint8Array([
+    0x4d,
+    0x54,
+    0x68,
+    0x64, // MThd
+    0x00,
+    0x00,
+    0x00,
+    0x06, // header length
+    0x00,
+    0x00, // format 0
+    0x00,
+    0x01, // 1 track
+    0x00,
+    0x60, // 96 ppqn
+  ]);
+
+  const trackData = new Uint8Array([
+    0x00,
+    0xff,
+    0x51,
+    0x03,
+    0x07,
+    0xa1,
+    0x20, // set tempo 500000us
+    0x00,
+    0x90,
+    0x3c,
+    0x64, // note on C4 velocity 100
+    0x60,
+    0x80,
+    0x3c,
+    0x00, // note off after 96 ticks
+    0x00,
+    0xff,
+    0x2f,
+    0x00, // end of track
+  ]);
+
+  const trackHeader = new Uint8Array([
+    0x4d,
+    0x54,
+    0x72,
+    0x6b, // MTrk
+    (trackData.length >> 24) & 0xff,
+    (trackData.length >> 16) & 0xff,
+    (trackData.length >> 8) & 0xff,
+    trackData.length & 0xff,
+  ]);
+
+  const result = new Uint8Array(header.length + trackHeader.length + trackData.length);
+  result.set(header, 0);
+  result.set(trackHeader, header.length);
+  result.set(trackData, header.length + trackHeader.length);
+  return result;
+}
+
+describe("parseMidiFile", () => {
+  test("parses a minimal single-note MIDI file", () => {
+    const parsed = parseMidiFile(buildMinimalMidi());
+    expect(parsed.format).toBe(0);
+    expect(parsed.ticksPerQuarter).toBe(96);
+    expect(parsed.tempo).toBe(500_000);
+    expect(parsed.notes).toHaveLength(1);
+    expect(parsed.notes[0]).toEqual({
+      tick: 0,
+      duration: 96,
+      pitch: 60,
+      velocity: 100,
+    });
+  });
+
+  test("rejects non-MIDI data", () => {
+    expect(() => parseMidiFile(new Uint8Array([1, 2, 3]))).toThrow(MidiParseError);
+  });
+
+  test("rejects unsupported SMPTE division", () => {
+    const data = buildMinimalMidi();
+    data[12] = 0xe7;
+    data[13] = 0x28;
+    expect(() => parseMidiFile(data)).toThrow(MidiParseError);
+  });
+
+  test("treats note-on with velocity 0 as note-off", () => {
+    const base = buildMinimalMidi();
+    const noteOffIndex = base.findIndex((byte, i) => byte === 0x80 && base[i + 1] === 0x3c);
+    expect(noteOffIndex).toBeGreaterThan(-1);
+    base[noteOffIndex] = 0x90;
+    const parsed = parseMidiFile(base);
+    expect(parsed.notes).toHaveLength(1);
+    expect(parsed.notes[0].duration).toBe(96);
+  });
+});

exec
/bin/zsh -lc "grep -R \"export type ViewName\\|type ViewName\\|ViewName\" -n src | head -50 && grep -R \"showView\" -n src | head -80" in /Users/user/Projects/vsdaw
 succeeded in 163ms:
src/components/shared/ViewSwitcher.tsx:2:import type { ViewName } from "../../views/shared/types.js";
src/components/shared/ViewSwitcher.tsx:4:const VIEWS: { id: ViewName; label: string }[] = [
src/components/shared/ViewSwitcher.tsx:13:  active: ViewName;
src/components/shared/ViewSwitcher.tsx:14:  onChange: (view: ViewName) => void;
src/components/shared/Toolbar.tsx:4:import type { TimePosition, TimeSignature, ViewName } from "../../views/shared/types.js";
src/components/shared/Toolbar.tsx:28:  onShowView: (view: ViewName) => void;
src/components/shared/Toolbar.tsx:97:        <ViewSwitcher active={view.toLowerCase() as ViewName} onChange={onShowView} />
src/views/shared/types.ts:70:  | { type: "view/ready"; view: ViewName }
src/views/shared/types.ts:103:  | { type: "command/show"; view: ViewName };
src/views/shared/types.ts:129:export type ViewName = "timeline" | "mixer" | "pianoRoll" | "browser" | "graph";
src/views/shared/useViewState.ts:11:  ViewName,
src/views/shared/useViewState.ts:17:export function useViewState(view: ViewName) {
src/views/shared/useViewState.ts:127:    showView: (target: ViewName) => send({ type: "command/show", view: target }),
src/views/graph/main.tsx:62:            onShowView={state.commands.showView}
src/views/graph/main.tsx:63:            onSettings={() => state.commands.showView("browser")}
src/views/pianoRoll/main.tsx:66:            onShowView={state.commands.showView}
src/views/pianoRoll/main.tsx:67:            onSettings={() => state.commands.showView("browser")}
src/views/shared/useViewState.ts:127:    showView: (target: ViewName) => send({ type: "command/show", view: target }),
src/views/browser/main.tsx:118:            onShowView={state.commands.showView}
src/views/browser/main.tsx:119:            onSettings={() => state.commands.showView("browser")}
src/views/mixer/main.tsx:57:            onShowView={state.commands.showView}
src/views/mixer/main.tsx:58:            onSettings={() => state.commands.showView("browser")}
src/views/timeline/main.tsx:110:            onShowView={state.commands.showView}
src/views/timeline/main.tsx:112:            onSettings={() => state.commands.showView("browser")}

exec
/bin/zsh -lc "sed -n '1,160p' src/views/shared/types.ts && sed -n '1,100p' src/views/pianoRoll/main.tsx && sed -n '1,90p' src/views/graph/main.tsx && sed -n '1,80p' src/views/mixer/main.tsx && sed -n '100,140p' src/views/browser/main.tsx" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
/**
 * Shared message types for view ↔ extension host communication.
 * Views do not own audio state; every mutation is sent to the host,
 * which broadcasts authoritative state updates.
 */

export interface WebviewApi<T = unknown> {
  postMessage(message: T): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface TimePosition {
  bars: number;
  beats: number;
  ticks: number;
  seconds: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface TrackState {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  soloed: boolean;
  armed: boolean;
  volume: number; // 0..1
  pan: number; // -1..1
  height: number;
  regions: RegionState[];
}

export interface RegionState {
  id: string;
  start: number; // beats
  duration: number; // beats
  name: string;
  color: string;
}

export interface NoteState {
  id: string;
  start: number; // beats
  duration: number; // beats
  pitch: number; // MIDI note number
  velocity: number; // 0..127
}

export interface DeviceItem {
  id: string;
  name: string;
  category: "instrument" | "effect" | "utility";
}

export interface BrowserNode {
  id: string;
  name: string;
  type: "folder" | "file" | "device";
  children?: BrowserNode[];
  device?: DeviceItem;
}

// Messages sent from a view to the extension host
export type ViewMessage =
  | { type: "view/ready"; view: ViewName }
  | { type: "transport/play" }
  | { type: "transport/pause" }
  | { type: "transport/stop" }
  | { type: "transport/record" }
  | { type: "transport/toggleLoop" }
  | { type: "transport/toggleMetronome" }
  | { type: "transport/setTempo"; bpm: number }
  | { type: "transport/setTimeSignature"; timeSignature: TimeSignature }
  | { type: "transport/seek"; beats: number }
  | { type: "track/setMute"; trackId: string; muted: boolean }
  | { type: "track/setSolo"; trackId: string; soloed: boolean }
  | { type: "track/setArm"; trackId: string; armed: boolean }
  | { type: "track/setVolume"; trackId: string; volume: number }
  | { type: "track/setPan"; trackId: string; pan: number }
  | { type: "track/setName"; trackId: string; name: string }
  | { type: "track/create"; trackType: "audio" | "midi" | "bus"; name?: string; color?: string }
  | { type: "track/delete"; trackId: string }
  | { type: "track/setColor"; trackId: string; color: string }
  | { type: "track/addInsert"; trackId: string; deviceName: string; insertIndex?: number }
  | { type: "timeline/selectRegion"; regionId: string | null }
  | { type: "timeline/moveRegion"; regionId: string; start: number }
  | { type: "pianoRoll/addNote"; note: NoteState }
  | { type: "pianoRoll/setNoteVelocity"; noteId: string; velocity: number }
  | { type: "pianoRoll/deleteNote"; noteId: string }
  | { type: "mixer/openDevice"; trackId: string; slotIndex: number }
  | { type: "browser/preview"; nodeId: string }
  | { type: "browser/dragStart"; nodeId: string }
  | { type: "command/undo" }
  | { type: "command/redo" }
  | { type: "command/delete" }
  | { type: "command/duplicate" }
  | { type: "command/export" }
  | { type: "command/show"; view: ViewName };

export interface SelectionState {
  trackId?: string;
  regionId?: string;
  noteIds?: string[];
}

// Messages sent from the extension host to views
export type HostMessage =
  | {
      type: "host/transport";
      isPlaying: boolean;
      isRecording: boolean;
      isLooping: boolean;
      isMetronomeEnabled: boolean;
      position: TimePosition;
      bpm: number;
      timeSignature: TimeSignature;
    }
  | { type: "host/tracks"; tracks: TrackState[] }
  | ({ type: "host/selection" } & SelectionState)
  | { type: "host/browser"; root: BrowserNode }
  | { type: "host/project"; name: string; saved: boolean }
  | { type: "host/error"; message: string };

export type ViewName = "timeline" | "mixer" | "pianoRoll" | "browser" | "graph";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { PianoRollGrid } from "../../components/pianoRoll/PianoRollGrid.js";
import { VelocityLane } from "../../components/pianoRoll/VelocityLane.js";
import { ErrorBoundary } from "../../components/shared/ErrorBoundary.js";
import { PanelShell } from "../../components/shared/PanelShell.js";
import { ThemeProvider } from "../../components/shared/ThemeProvider.js";
import { Toolbar } from "../../components/shared/Toolbar.js";
import type { NoteState } from "../shared/types.js";
import { useViewState } from "../shared/useViewState.js";

let noteIdCounter = 0;

const PianoRollView: React.FC = () => {
  const state = useViewState("pianoRoll");
  const [notes, setNotes] = React.useState<NoteState[]>([]);
  const [snap, setSnap] = React.useState<Parameters<typeof PianoRollGrid>[0]["snap"]>("beat");

  const addNote = (note: Omit<NoteState, "id">) => {
    const id = `n-${Date.now()}-${++noteIdCounter}`;
    setNotes((prev) => [...prev, { ...note, id }]);
    state.send({ type: "pianoRoll/addNote", note: { ...note, id } });
  };

  const moveNote = (id: string, start: number, pitch: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, start, pitch } : n)));
  };

  const resizeNote = (id: string, duration: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, duration } : n)));
  };

  const setVelocity = (id: string, velocity: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, velocity } : n)));
    state.send({ type: "pianoRoll/setNoteVelocity", noteId: id, velocity });
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    state.send({ type: "pianoRoll/deleteNote", noteId: id });
  };

  return (
    <ErrorBoundary viewName="Piano Roll">
      <ThemeProvider>
        <PanelShell>
          <Toolbar
            view="Piano Roll"
            projectName={state.projectName}
            saved={state.saved}
            isPlaying={state.isPlaying}
            isRecording={state.isRecording}
            isLooping={state.isLooping}
            isMetronomeEnabled={state.isMetronomeEnabled}
            position={state.position}
            bpm={state.bpm}
            timeSignature={state.timeSignature}
            onPlay={state.transport.play}
            onPause={state.transport.pause}
            onStop={state.transport.stop}
            onRecord={state.transport.record}
            onToggleLoop={state.transport.toggleLoop}
            onToggleMetronome={state.transport.toggleMetronome}
            onSetTempo={state.transport.setTempo}
            onSetTimeSignature={state.transport.setTimeSignature}
            onShowView={state.commands.showView}
            onSettings={() => state.commands.showView("browser")}
            onExport={state.commands.export}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px",
              borderBottom: "1px solid var(--vsdaw-border)",
            }}
          >
            <label htmlFor="snap-select" style={{ fontSize: 11 }}>
              Snap
            </label>
            <select
              id="snap-select"
              aria-label="Snap mode"
              value={snap}
              onChange={(e) => setSnap(e.target.value as typeof snap)}
              style={{
                backgroundColor: "var(--vsdaw-input-bg)",
                color: "inherit",
                border: "1px solid var(--vsdaw-input-border)",
                borderRadius: 4,
                padding: "2px 6px",
              }}
            >
              <option value="off">Off</option>
              <option value="1/4">1/4 beat</option>
              <option value="1/2">1/2 beat</option>
              <option value="beat">Beat</option>
              <option value="bar">Bar</option>
            </select>
import * as React from "react";
import { createRoot } from "react-dom/client";
import { type GraphEdge, type GraphNode, GraphView } from "../../components/graph/GraphView.js";
import { ErrorBoundary } from "../../components/shared/ErrorBoundary.js";
import { PanelShell } from "../../components/shared/PanelShell.js";
import { ThemeProvider } from "../../components/shared/ThemeProvider.js";
import { Toolbar } from "../../components/shared/Toolbar.js";
import { useViewState } from "../shared/useViewState.js";

const defaultNodes: GraphNode[] = [
  { id: "in", type: "input", label: "Audio Input", x: 40, y: 120 },
  { id: "t1", type: "track", label: "Track 1", x: 220, y: 80 },
  { id: "t2", type: "track", label: "Track 2", x: 220, y: 180 },
  { id: "out", type: "output", label: "Master Out", x: 460, y: 130 },
];

const defaultEdges: GraphEdge[] = [
  { from: "in", to: "t1" },
  { from: "t1", to: "out" },
  { from: "t2", to: "out" },
];

const GraphPage: React.FC = () => {
  const state = useViewState("graph");
  const [nodes, setNodes] = React.useState<GraphNode[]>(defaultNodes);
  const [edges, setEdges] = React.useState<GraphEdge[]>(defaultEdges);

  const onNodeMove = (id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  const onConnect = (from: string, to: string) => {
    setEdges((prev) => {
      if (prev.some((e) => e.from === from && e.to === to)) return prev;
      return [...prev, { from, to }];
    });
  };

  return (
    <ErrorBoundary viewName="Graph">
      <ThemeProvider>
        <PanelShell>
          <Toolbar
            view="Graph"
            projectName={state.projectName}
            saved={state.saved}
            isPlaying={state.isPlaying}
            isRecording={state.isRecording}
            isLooping={state.isLooping}
            isMetronomeEnabled={state.isMetronomeEnabled}
            position={state.position}
            bpm={state.bpm}
            timeSignature={state.timeSignature}
            onPlay={state.transport.play}
            onPause={state.transport.pause}
            onStop={state.transport.stop}
            onRecord={state.transport.record}
            onToggleLoop={state.transport.toggleLoop}
            onToggleMetronome={state.transport.toggleMetronome}
            onSetTempo={state.transport.setTempo}
            onSetTimeSignature={state.transport.setTimeSignature}
            onShowView={state.commands.showView}
            onSettings={() => state.commands.showView("browser")}
            onExport={state.commands.export}
          />
          <GraphView nodes={nodes} edges={edges} onNodeMove={onNodeMove} onConnect={onConnect} />
        </PanelShell>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

const root = document.getElementById("root");
if (root) createRoot(root).render(<GraphPage />);
import * as React from "react";
import { createRoot } from "react-dom/client";
import { MixerStrip } from "../../components/mixer/MixerStrip.js";
import { EmptyState } from "../../components/shared/EmptyState.js";
import { ErrorBoundary } from "../../components/shared/ErrorBoundary.js";
import { PanelShell } from "../../components/shared/PanelShell.js";
import { ThemeProvider } from "../../components/shared/ThemeProvider.js";
import { Toolbar } from "../../components/shared/Toolbar.js";
import type { TrackState } from "../shared/types.js";
import { useViewState } from "../shared/useViewState.js";

const masterTrack = (tracks: TrackState[], themeColor: string): TrackState => ({
  id: "master",
  name: "Master",
  color: themeColor,
  muted: false,
  soloed: false,
  armed: false,
  volume: 0.8,
  pan: 0,
  height: 0,
  regions: [],
});

const MixerView: React.FC = () => {
  const state = useViewState("mixer");
  const [accentColor, setAccentColor] = React.useState("#cccccc");

  React.useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setAccentColor(styles.getPropertyValue("--vsdaw-button-bg").trim() || "#cccccc");
  }, []);

  return (
    <ErrorBoundary viewName="Mixer">
      <ThemeProvider>
        <PanelShell>
          <Toolbar
            view="Mixer"
            projectName={state.projectName}
            saved={state.saved}
            isPlaying={state.isPlaying}
            isRecording={state.isRecording}
            isLooping={state.isLooping}
            isMetronomeEnabled={state.isMetronomeEnabled}
            position={state.position}
            bpm={state.bpm}
            timeSignature={state.timeSignature}
            onPlay={state.transport.play}
            onPause={state.transport.pause}
            onStop={state.transport.stop}
            onRecord={state.transport.record}
            onToggleLoop={state.transport.toggleLoop}
            onToggleMetronome={state.transport.toggleMetronome}
            onSetTempo={state.transport.setTempo}
            onSetTimeSignature={state.transport.setTimeSignature}
            onShowView={state.commands.showView}
            onSettings={() => state.commands.showView("browser")}
            onExport={state.commands.export}
          />
          {state.tracks.length === 0 ? (
            <EmptyState
              title="No mixer channels"
              subtitle="Tracks added to the project will appear here as channel strips."
            />
          ) : (
            <fieldset
              aria-label="Mixer channels"
              style={{
                flex: 1,
                display: "flex",
                overflowX: "auto",
                overflowY: "hidden",
                border: 0,
                margin: 0,
                padding: 0,
              }}
            >
              {state.tracks.map((track: TrackState) => (
                <MixerStrip
            view="Browser"
            projectName={state.projectName}
            saved={state.saved}
            isPlaying={state.isPlaying}
            isRecording={state.isRecording}
            isLooping={state.isLooping}
            isMetronomeEnabled={state.isMetronomeEnabled}
            position={state.position}
            bpm={state.bpm}
            timeSignature={state.timeSignature}
            onPlay={state.transport.play}
            onPause={state.transport.pause}
            onStop={state.transport.stop}
            onRecord={state.transport.record}
            onToggleLoop={state.transport.toggleLoop}
            onToggleMetronome={state.transport.toggleMetronome}
            onSetTempo={state.transport.setTempo}
            onSetTimeSignature={state.transport.setTimeSignature}
            onShowView={state.commands.showView}
            onSettings={() => state.commands.showView("browser")}
            onExport={state.commands.export}
          />
          <BrowserTree
            root={root}
            onPreview={state.browserActions.preview}
            onDragStart={state.browserActions.dragStart}
          />
        </PanelShell>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<BrowserView />);

exec
/bin/zsh -lc "grep -R \"parseMidiFile\\|MidiNote\\|ParsedMidi\" -n . --exclude-dir=node_modules --exclude-dir=.git" in /Users/user/Projects/vsdaw
 exited 130 in 46270ms:
exec
/bin/zsh -lc "git grep -n \"parseMidiFile\\|MidiNote\\|ParsedMidi\" -- ." in /Users/user/Projects/vsdaw
 succeeded in 2636ms:
2026-06-26 18:01:26.747 xcodebuild[49251:10408923]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:01:27.014 xcodebuild[49251:10408922] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5RnHpuT0' (errno=Operation not permitted)
2026-06-26 18:01:27.700 xcodebuild[49253:10408948]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:01:27.872 xcodebuild[49253:10408947] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
src/engine/messageHandlers.ts:12:  type MidiNoteIdPayload,
src/engine/messageHandlers.ts:13:  type MidiNoteVelocityPayload,
src/engine/messageHandlers.ts:386:      const opts = p as MidiNoteIdPayload;
src/engine/messageHandlers.ts:394:      const opts = p as MidiNoteVelocityPayload;
src/extension/viewMessageAdapter.ts:13:  type MidiNoteIdPayload,
src/extension/viewMessageAdapter.ts:14:  type MidiNoteVelocityPayload,
src/extension/viewMessageAdapter.ts:180:      const payload: MidiNoteVelocityPayload = {
src/extension/viewMessageAdapter.ts:187:      const payload: MidiNoteIdPayload = { noteId: message.noteId };
src/shared/midi.ts:1:export interface MidiNote {
src/shared/midi.ts:8:export interface ParsedMidiFile {
src/shared/midi.ts:12:  notes: MidiNote[];
src/shared/midi.ts:61:export function parseMidiFile(data: Uint8Array): ParsedMidiFile {
src/shared/midi.ts:81:  const notes: MidiNote[] = [];
src/shared/midi.ts:215:  notes: MidiNote[],
src/shared/protocol.ts:313:export interface MidiNoteIdPayload {
src/shared/protocol.ts:317:export interface MidiNoteVelocityPayload {
tests/unit/midi.test.ts:1:import { MidiParseError, parseMidiFile } from "../../src/shared/midi.js";
tests/unit/midi.test.ts:61:describe("parseMidiFile", () => {
tests/unit/midi.test.ts:63:    const parsed = parseMidiFile(buildMinimalMidi());
tests/unit/midi.test.ts:77:    expect(() => parseMidiFile(new Uint8Array([1, 2, 3]))).toThrow(MidiParseError);
tests/unit/midi.test.ts:84:    expect(() => parseMidiFile(data)).toThrow(MidiParseError);
tests/unit/midi.test.ts:92:    const parsed = parseMidiFile(base);

exec
/bin/zsh -lc 'git diff --stat dbd672d8146dc971cad6592869e9c867c6b8a1ac && git diff --name-only dbd672d8146dc971cad6592869e9c867c6b8a1ac' in /Users/user/Projects/vsdaw
 succeeded in 5017ms:
2026-06-26 18:01:36.381 xcodebuild[49269:10409184]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:01:36.556 xcodebuild[49269:10409183] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-HJsHLFwv' (errno=Operation not permitted)
2026-06-26 18:01:37.214 xcodebuild[49271:10409199]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:01:37.388 xcodebuild[49271:10409198] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
 src/components/shared/Toolbar.tsx              | 210 ++++++++++++++++-------
 src/components/shared/ViewSwitcher.tsx         |  56 ++++++
 src/components/transport/TransportControls.tsx |  21 ++-
 src/shared/midi.ts                             | 228 +++++++++++++++++++++++++
 src/views/timeline/main.tsx                    |   3 +-
 tests/unit/midi.test.ts                        |  96 +++++++++++
 6 files changed, 545 insertions(+), 69 deletions(-)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LKCbzSnl' (errno=Operation not permitted)
2026-06-26 18:01:38.896 xcodebuild[49277:10409233]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:01:39.072 xcodebuild[49277:10409232] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XyUjSf5u' (errno=Operation not permitted)
2026-06-26 18:01:39.728 xcodebuild[49279:10409250]  DVTFilePathFSEvents: Failed to start fs event stream.
2026-06-26 18:01:39.905 xcodebuild[49279:10409249] [MT] DVTDeveloperPaths: Failed to get length of DARWIN_USER_CACHE_DIR from confstr(3), error = Error Domain=NSPOSIXErrorDomain Code=5 "Input/output error". Using NSCachesDirectory instead.
src/components/shared/Toolbar.tsx
src/components/shared/ViewSwitcher.tsx
src/components/transport/TransportControls.tsx
src/shared/midi.ts
src/views/timeline/main.tsx
tests/unit/midi.test.ts

exec
/bin/zsh -lc "nl -ba src/components/shared/Toolbar.tsx | sed -n '1,340p'
printf '\\n--- midi ---\\n'
nl -ba src/shared/midi.ts | sed -n '1,260p'
printf '\\n--- ViewSwitcher ---\\n'
nl -ba src/components/shared/ViewSwitcher.tsx | sed -n '1,80p'" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
     1	import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
     2	import { Download, LayoutGrid, MoreHorizontal, Plus, Save, Settings } from "lucide-react";
     3	import * as React from "react";
     4	import type { TimePosition, TimeSignature, ViewName } from "../../views/shared/types.js";
     5	import { TimeDisplay } from "../transport/TimeDisplay.js";
     6	import { TransportControls } from "../transport/TransportControls.js";
     7	import { ViewSwitcher } from "./ViewSwitcher.js";
     8	
     9	export interface ToolbarProps {
    10	  view: string;
    11	  projectName?: string;
    12	  saved?: boolean;
    13	  isPlaying: boolean;
    14	  isRecording: boolean;
    15	  isLooping: boolean;
    16	  isMetronomeEnabled: boolean;
    17	  position: TimePosition;
    18	  bpm: number;
    19	  timeSignature: TimeSignature;
    20	  onPlay: () => void;
    21	  onPause: () => void;
    22	  onStop: () => void;
    23	  onRecord: () => void;
    24	  onToggleLoop: () => void;
    25	  onToggleMetronome: () => void;
    26	  onSetTempo: (bpm: number) => void;
    27	  onSetTimeSignature: (timeSignature: TimeSignature) => void;
    28	  onShowView: (view: ViewName) => void;
    29	  onAddTrack?: (trackType: "audio" | "midi" | "bus") => void;
    30	  onSettings: () => void;
    31	  onExport: () => void;
    32	}
    33	
    34	export const Toolbar: React.FC<ToolbarProps> = ({
    35	  view,
    36	  projectName,
    37	  saved = true,
    38	  isPlaying,
    39	  isRecording,
    40	  isLooping,
    41	  isMetronomeEnabled,
    42	  position,
    43	  bpm,
    44	  timeSignature,
    45	  onPlay,
    46	  onPause,
    47	  onStop,
    48	  onRecord,
    49	  onToggleLoop,
    50	  onToggleMetronome,
    51	  onSetTempo,
    52	  onSetTimeSignature,
    53	  onShowView,
    54	  onAddTrack,
    55	  onSettings,
    56	  onExport,
    57	}) => {
    58	  const [showOverflow, setShowOverflow] = React.useState(false);
    59	  const overflowRef = React.useRef<HTMLDivElement>(null);
    60	
    61	  React.useEffect(() => {
    62	    if (!showOverflow) return;
    63	    const handleClick = (e: MouseEvent) => {
    64	      if (!overflowRef.current?.contains(e.target as Node)) {
    65	        setShowOverflow(false);
    66	      }
    67	    };
    68	    document.addEventListener("mousedown", handleClick);
    69	    return () => document.removeEventListener("mousedown", handleClick);
    70	  }, [showOverflow]);
    71	
    72	  return (
    73	    <div
    74	      role="toolbar"
    75	      aria-label={`${view} toolbar`}
    76	      className="flex items-center gap-3 px-3 py-2 select-none"
    77	      style={{
    78	        borderBottom: "1px solid var(--vsdaw-border)",
    79	        backgroundColor: "var(--vsdaw-panel-bg)",
    80	      }}
    81	    >
    82	      {/* Left: project info, add track, view switcher */}
    83	      <div className="flex items-center gap-3 min-w-0">
    84	        <div className="flex items-center gap-1.5 min-w-[120px]">
    85	          <span className="font-semibold whitespace-nowrap text-sm truncate">
    86	            {projectName || "Untitled"}
    87	          </span>
    88	          <Save
    89	            size={12}
    90	            style={{ opacity: saved ? 0.3 : 1, color: saved ? "inherit" : "var(--vsdaw-warning)" }}
    91	            aria-label={saved ? "Saved" : "Unsaved changes"}
    92	          />
    93	        </div>
    94	
    95	        {onAddTrack && <AddTrackButton onAddTrack={onAddTrack} />}
    96	
    97	        <ViewSwitcher active={view.toLowerCase() as ViewName} onChange={onShowView} />
    98	      </div>
    99	
   100	      {/* Center: transport */}
   101	      <div className="flex-1 flex justify-center">
   102	        <TransportControls
   103	          isPlaying={isPlaying}
   104	          isRecording={isRecording}
   105	          isLooping={isLooping}
   106	          isMetronomeEnabled={isMetronomeEnabled}
   107	          onPlay={onPlay}
   108	          onPause={onPause}
   109	          onStop={onStop}
   110	          onRecord={onRecord}
   111	          onToggleLoop={onToggleLoop}
   112	          onToggleMetronome={onToggleMetronome}
   113	        />
   114	      </div>
   115	
   116	      {/* Right: time/tempo, overflow */}
   117	      <div className="flex items-center gap-3 ml-auto">
   118	        <TimeDisplay
   119	          position={position}
   120	          bpm={bpm}
   121	          timeSignature={timeSignature}
   122	          onSetTempo={onSetTempo}
   123	          onSetTimeSignature={onSetTimeSignature}
   124	        />
   125	
   126	        <div className="relative" ref={overflowRef}>
   127	          <button
   128	            type="button"
   129	            aria-label="Overflow menu"
   130	            aria-haspopup="menu"
   131	            aria-expanded={showOverflow}
   132	            onClick={() => setShowOverflow((s) => !s)}
   133	            style={iconButtonStyle}
   134	          >
   135	            <MoreHorizontal size={16} />
   136	          </button>
   137	          {showOverflow && (
   138	            <div
   139	              role="menu"
   140	              className="absolute top-full right-0 mt-1 min-w-[180px] rounded z-50"
   141	              style={{
   142	                backgroundColor: "var(--vsdaw-panel-bg)",
   143	                border: "1px solid var(--vsdaw-border)",
   144	                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
   145	              }}
   146	            >
   147	              <OverflowItem
   148	                icon={<LayoutGrid size={14} />}
   149	                label="Show timeline"
   150	                onClick={() => {
   151	                  setShowOverflow(false);
   152	                  onShowView("timeline");
   153	                }}
   154	              />
   155	              <OverflowItem
   156	                icon={<Settings size={14} />}
   157	                label="Settings"
   158	                onClick={() => {
   159	                  setShowOverflow(false);
   160	                  onSettings();
   161	                }}
   162	              />
   163	              <OverflowItem
   164	                icon={<Download size={14} />}
   165	                label="Export"
   166	                onClick={() => {
   167	                  setShowOverflow(false);
   168	                  onExport();
   169	                }}
   170	              />
   171	            </div>
   172	          )}
   173	        </div>
   174	      </div>
   175	    </div>
   176	  );
   177	};
   178	
   179	const AddTrackButton: React.FC<{ onAddTrack: (trackType: "audio" | "midi" | "bus") => void }> = ({
   180	  onAddTrack,
   181	}) => {
   182	  const [open, setOpen] = React.useState(false);
   183	  return (
   184	    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
   185	      <DropdownMenu.Trigger asChild>
   186	        <button
   187	          type="button"
   188	          aria-label="Add track"
   189	          aria-haspopup="menu"
   190	          aria-expanded={open}
   191	          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded cursor-pointer"
   192	          style={{
   193	            border: "1px solid var(--vsdaw-border)",
   194	            backgroundColor: "var(--vsdaw-button-bg)",
   195	            color: "var(--vsdaw-button-fg)",
   196	          }}
   197	          onMouseEnter={(e) => {
   198	            e.currentTarget.style.backgroundColor = "var(--vsdaw-button-hover)";
   199	          }}
   200	          onMouseLeave={(e) => {
   201	            e.currentTarget.style.backgroundColor = "var(--vsdaw-button-bg)";
   202	          }}
   203	        >
   204	          <Plus size={14} />
   205	          Add Track
   206	        </button>
   207	      </DropdownMenu.Trigger>
   208	      <DropdownMenu.Portal>
   209	        <DropdownMenu.Content
   210	          className="rounded z-50 min-w-[160px]"
   211	          style={{
   212	            backgroundColor: "var(--vsdaw-panel-bg)",
   213	            border: "1px solid var(--vsdaw-border)",
   214	            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
   215	          }}
   216	        >
   217	          <DropdownMenu.Item
   218	            className="px-3 py-2 text-xs cursor-pointer outline-none"
   219	            style={{ color: "inherit" }}
   220	            onSelect={() => onAddTrack("audio")}
   221	            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
   222	            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
   223	          >
   224	            Audio Track
   225	          </DropdownMenu.Item>
   226	          <DropdownMenu.Item
   227	            className="px-3 py-2 text-xs cursor-pointer outline-none"
   228	            style={{ color: "inherit" }}
   229	            onSelect={() => onAddTrack("midi")}
   230	            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
   231	            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
   232	          >
   233	            MIDI Track
   234	          </DropdownMenu.Item>
   235	          <DropdownMenu.Item
   236	            className="px-3 py-2 text-xs cursor-pointer outline-none"
   237	            style={{ color: "inherit" }}
   238	            onSelect={() => onAddTrack("bus")}
   239	            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
   240	            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
   241	          >
   242	            Bus Track
   243	          </DropdownMenu.Item>
   244	        </DropdownMenu.Content>
   245	      </DropdownMenu.Portal>
   246	    </DropdownMenu.Root>
   247	  );
   248	};
   249	
   250	const OverflowItem: React.FC<{
   251	  icon: React.ReactNode;
   252	  label: string;
   253	  onClick: () => void;
   254	}> = ({ icon, label, onClick }) => (
   255	  <button
   256	    type="button"
   257	    role="menuitem"
   258	    onClick={onClick}
   259	    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left bg-transparent border-0 text-inherit cursor-pointer"
   260	    style={{ color: "inherit" }}
   261	    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
   262	    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
   263	  >
   264	    {icon}
   265	    {label}
   266	  </button>
   267	);
   268	
   269	export const iconButtonStyle: React.CSSProperties = {
   270	  display: "inline-flex",
   271	  alignItems: "center",
   272	  justifyContent: "center",
   273	  width: 28,
   274	  height: 28,
   275	  padding: 0,
   276	  border: "1px solid transparent",
   277	  borderRadius: 4,
   278	  backgroundColor: "transparent",
   279	  color: "inherit",
   280	  cursor: "pointer",
   281	};

--- midi ---
     1	export interface MidiNote {
     2	  tick: number;
     3	  duration: number;
     4	  pitch: number;
     5	  velocity: number;
     6	}
     7	
     8	export interface ParsedMidiFile {
     9	  format: number;
    10	  ticksPerQuarter: number;
    11	  tempo: number; // microseconds per quarter note
    12	  notes: MidiNote[];
    13	}
    14	
    15	const DEFAULT_TEMPO = 500_000; // 120 BPM
    16	
    17	function readUint16(data: Uint8Array, offset: number): number {
    18	  return (data[offset] << 8) | data[offset + 1];
    19	}
    20	
    21	function readUint24(data: Uint8Array, offset: number): number {
    22	  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
    23	}
    24	
    25	function readUint32(data: Uint8Array, offset: number): number {
    26	  return (
    27	    (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]
    28	  );
    29	}
    30	
    31	function readVariableLength(data: Uint8Array, offset: number): { value: number; length: number } {
    32	  let value = 0;
    33	  let i = 0;
    34	  while (i < 4) {
    35	    const byte = data[offset + i];
    36	    value = (value << 7) | (byte & 0x7f);
    37	    i++;
    38	    if ((byte & 0x80) === 0) break;
    39	  }
    40	  return { value, length: i };
    41	}
    42	
    43	function textDecoder(bytes: Uint8Array): string {
    44	  if (typeof TextDecoder !== "undefined") {
    45	    return new TextDecoder("latin1").decode(bytes);
    46	  }
    47	  let result = "";
    48	  for (const byte of bytes) {
    49	    result += String.fromCharCode(byte);
    50	  }
    51	  return result;
    52	}
    53	
    54	export class MidiParseError extends Error {
    55	  constructor(message: string) {
    56	    super(message);
    57	    this.name = "MidiParseError";
    58	  }
    59	}
    60	
    61	export function parseMidiFile(data: Uint8Array): ParsedMidiFile {
    62	  if (data.length < 14 || textDecoder(data.subarray(0, 4)) !== "MThd") {
    63	    throw new MidiParseError("Not a valid MIDI file");
    64	  }
    65	
    66	  const headerLength = readUint32(data, 4);
    67	  if (headerLength !== 6) {
    68	    throw new MidiParseError(`Unsupported MIDI header length: ${headerLength}`);
    69	  }
    70	
    71	  const format = readUint16(data, 8);
    72	  const trackCount = readUint16(data, 10);
    73	  const division = readUint16(data, 12);
    74	
    75	  if ((division & 0x8000) !== 0) {
    76	    throw new MidiParseError("SMPTE timecode division is not supported");
    77	  }
    78	
    79	  const ticksPerQuarter = division;
    80	  let tempo = DEFAULT_TEMPO;
    81	  const notes: MidiNote[] = [];
    82	
    83	  let offset = 14;
    84	  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    85	    if (offset + 8 > data.length) {
    86	      throw new MidiParseError("Truncated MIDI track header");
    87	    }
    88	
    89	    const chunkId = textDecoder(data.subarray(offset, offset + 4));
    90	    if (chunkId !== "MTrk") {
    91	      throw new MidiParseError(`Unexpected MIDI chunk: ${chunkId}`);
    92	    }
    93	    const chunkLength = readUint32(data, offset + 4);
    94	    offset += 8;
    95	
    96	    if (offset + chunkLength > data.length) {
    97	      throw new MidiParseError("Truncated MIDI track data");
    98	    }
    99	
   100	    const trackEnd = offset + chunkLength;
   101	    let tick = 0;
   102	    let runningStatus = 0;
   103	    const activeNotes = new Map<number, { tick: number; velocity: number }>();
   104	
   105	    while (offset < trackEnd) {
   106	      const delta = readVariableLength(data, offset);
   107	      offset += delta.length;
   108	      tick += delta.value;
   109	
   110	      if (offset >= trackEnd) {
   111	        throw new MidiParseError("Unexpected end of track while reading event status");
   112	      }
   113	
   114	      let status = data[offset];
   115	
   116	      if (status === 0xff) {
   117	        offset++;
   118	        const metaType = data[offset++];
   119	        const metaLength = readVariableLength(data, offset);
   120	        offset += metaLength.length;
   121	
   122	        if (offset + metaLength.value > trackEnd) {
   123	          throw new MidiParseError("Meta event exceeds track bounds");
   124	        }
   125	
   126	        if (metaType === 0x2f) {
   127	          offset += metaLength.value;
   128	          if (offset !== trackEnd) {
   129	            offset = trackEnd;
   130	          }
   131	          runningStatus = 0;
   132	          break;
   133	        }
   134	
   135	        if (metaType === 0x51 && metaLength.value === 3) {
   136	          tempo = readUint24(data, offset);
   137	        }
   138	
   139	        offset += metaLength.value;
   140	        runningStatus = 0;
   141	        continue;
   142	      }
   143	
   144	      if (status === 0xf0 || status === 0xf7) {
   145	        const sysexLength = readVariableLength(data, offset + 1);
   146	        offset += 1 + sysexLength.length + sysexLength.value;
   147	        runningStatus = 0;
   148	        continue;
   149	      }
   150	
   151	      if (status < 0x80) {
   152	        if (runningStatus === 0) {
   153	          throw new MidiParseError(`Unexpected data byte without running status: ${status}`);
   154	        }
   155	        status = runningStatus;
   156	      } else {
   157	        runningStatus = status;
   158	        offset++;
   159	      }
   160	
   161	      const command = status & 0xf0;
   162	      switch (command) {
   163	        case 0x80: {
   164	          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated note-off event");
   165	          const pitch = data[offset++];
   166	          offset++;
   167	          closeNote(activeNotes, notes, pitch, tick);
   168	          break;
   169	        }
   170	        case 0x90: {
   171	          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated note-on event");
   172	          const pitch = data[offset++];
   173	          const velocity = data[offset++];
   174	          if (velocity === 0) {
   175	            closeNote(activeNotes, notes, pitch, tick);
   176	          } else {
   177	            activeNotes.set(pitch, { tick, velocity });
   178	          }
   179	          break;
   180	        }
   181	        case 0xa0:
   182	        case 0xb0: {
   183	          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated MIDI event");
   184	          offset += 2;
   185	          break;
   186	        }
   187	        case 0xc0:
   188	        case 0xd0: {
   189	          offset += 1;
   190	          break;
   191	        }
   192	        case 0xe0: {
   193	          if (offset + 1 >= trackEnd) throw new MidiParseError("Truncated pitch-bend event");
   194	          offset += 2;
   195	          break;
   196	        }
   197	        default: {
   198	          throw new MidiParseError(`Unsupported MIDI status: ${status.toString(16)}`);
   199	        }
   200	      }
   201	    }
   202	
   203	    for (const [pitch, note] of activeNotes) {
   204	      notes.push({ tick: note.tick, duration: tick - note.tick, pitch, velocity: note.velocity });
   205	    }
   206	  }
   207	
   208	  notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
   209	
   210	  return { format, ticksPerQuarter, tempo, notes };
   211	}
   212	
   213	function closeNote(
   214	  activeNotes: Map<number, { tick: number; velocity: number }>,
   215	  notes: MidiNote[],
   216	  pitch: number,
   217	  tick: number,
   218	): void {
   219	  const note = activeNotes.get(pitch);
   220	  if (!note) return;
   221	  activeNotes.delete(pitch);
   222	  notes.push({
   223	    tick: note.tick,
   224	    duration: Math.max(0, tick - note.tick),
   225	    pitch,
   226	    velocity: note.velocity,
   227	  });
   228	}

--- ViewSwitcher ---
     1	import type * as React from "react";
     2	import type { ViewName } from "../../views/shared/types.js";
     3	
     4	const VIEWS: { id: ViewName; label: string }[] = [
     5	  { id: "timeline", label: "Timeline" },
     6	  { id: "mixer", label: "Mixer" },
     7	  { id: "pianoRoll", label: "Piano Roll" },
     8	  { id: "browser", label: "Browser" },
     9	  { id: "graph", label: "Graph" },
    10	];
    11	
    12	export interface ViewSwitcherProps {
    13	  active: ViewName;
    14	  onChange: (view: ViewName) => void;
    15	}
    16	
    17	export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ active, onChange }) => {
    18	  return (
    19	    <div
    20	      role="tablist"
    21	      aria-label="View switcher"
    22	      className="flex items-center rounded overflow-hidden"
    23	      style={{
    24	        border: "1px solid var(--vsdaw-border)",
    25	        backgroundColor: "var(--vsdaw-bg)",
    26	      }}
    27	    >
    28	      {VIEWS.map((view) => {
    29	        const isActive = view.id === active;
    30	        return (
    31	          <button
    32	            key={view.id}
    33	            type="button"
    34	            role="tab"
    35	            aria-selected={isActive}
    36	            onClick={() => onChange(view.id)}
    37	            className="px-2.5 py-1 text-xs font-medium border-0 cursor-pointer whitespace-nowrap"
    38	            style={{
    39	              backgroundColor: isActive ? "var(--vsdaw-button-bg)" : "transparent",
    40	              color: isActive ? "var(--vsdaw-button-fg)" : "var(--vsdaw-fg)",
    41	              borderRight: "1px solid var(--vsdaw-border)",
    42	            }}
    43	            onMouseEnter={(e) => {
    44	              if (!isActive) e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)";
    45	            }}
    46	            onMouseLeave={(e) => {
    47	              if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
    48	            }}
    49	          >
    50	            {view.label}
    51	          </button>
    52	        );
    53	      })}
    54	    </div>
    55	  );
    56	};

exec
/bin/zsh -lc 'cat package.json && (test -f package-lock.json && grep -n "@radix-ui/react-dropdown-menu" package-lock.json | head || true) && (test -f pnpm-lock.yaml && grep -n "@radix-ui/react-dropdown-menu" pnpm-lock.yaml | head || true)' in /Users/user/Projects/vsdaw
 succeeded in 0ms:
{
  "name": "vsdaw",
  "displayName": "VSDAW",
  "description": "OpenDAW-powered digital audio workstation inside VS Code.",
  "version": "0.1.0",
  "publisher": "marius-patrik",
  "license": "AGPL-3.0-or-later",
  "private": true,
  "repository": {
    "type": "git",
    "url": "https://github.com/marius-patrik/vsdaw.git"
  },
  "bugs": {
    "url": "https://github.com/marius-patrik/vsdaw/issues"
  },
  "homepage": "https://github.com/marius-patrik/vsdaw#readme",
  "icon": "media/icon.png",
  "type": "module",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": ["Visualization", "Debuggers", "Other"],
  "keywords": ["daw", "audio", "music", "midi", "opendaw", "production"],
  "activationEvents": [
    "onCommand:vsdaw.newProject",
    "onCommand:vsdaw.openProject",
    "onCommand:vsdaw.showTimeline",
    "onCommand:vsdaw.showMixer",
    "onCommand:vsdaw.showPianoRoll",
    "onCommand:vsdaw.showBrowser",
    "onCommand:vsdaw.showGraph",
    "onCommand:vsdaw.export",
    "onCommand:vsdaw.settings",
    "onCommand:vsdaw.engineHealth",
    "onCustomEditor:vsdaw.editor"
  ],
  "contributes": {
    "commands": [
      {
        "command": "vsdaw.newProject",
        "title": "New Project",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.openProject",
        "title": "Open Project",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.showTimeline",
        "title": "Show Timeline",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.showMixer",
        "title": "Show Mixer",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.showPianoRoll",
        "title": "Show Piano Roll",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.showBrowser",
        "title": "Show Browser",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.showGraph",
        "title": "Show Graph",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.export",
        "title": "Export Audio",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.settings",
        "title": "Open Settings",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.showEngineMenu",
        "title": "Show Engine Menu",
        "category": "VSDAW"
      },
      {
        "command": "vsdaw.engineHealth",
        "title": "Check Engine Health",
        "category": "VSDAW"
      }
    ],
    "keybindings": [
      {
        "command": "vsdaw.showMixer",
        "key": "ctrl+shift+m",
        "mac": "cmd+shift+m",
        "when": "editorFocus || webviewPanelFocus"
      },
      {
        "command": "vsdaw.showBrowser",
        "key": "ctrl+shift+b",
        "mac": "cmd+shift+b",
        "when": "editorFocus || webviewPanelFocus"
      },
      {
        "command": "vsdaw.export",
        "key": "ctrl+shift+e",
        "mac": "cmd+shift+e",
        "when": "editorFocus || webviewPanelFocus"
      }
    ],
    "customEditors": [
      {
        "viewType": "vsdaw.editor",
        "displayName": "VSDAW Project",
        "selector": [
          {
            "filenamePattern": "*.vsdaw"
          }
        ],
        "priority": "default"
      }
    ],
    "configuration": {
      "title": "VSDAW",
      "properties": {
        "vsdaw.audio.defaultSampleRate": {
          "type": "number",
          "default": 48000,
          "description": "Default sample rate for new projects."
        },
        "vsdaw.audio.defaultBufferSize": {
          "type": "number",
          "default": 128,
          "description": "Default audio buffer size."
        },
        "vsdaw.audio.inputDeviceId": {
          "type": ["string", "null"],
          "default": null,
          "description": "Default audio input device identifier."
        },
        "vsdaw.audio.outputDeviceId": {
          "type": ["string", "null"],
          "default": null,
          "description": "Default audio output device identifier."
        },
        "vsdaw.autoSave": {
          "type": "boolean",
          "default": true,
          "description": "Enable auto-save after edits."
        },
        "vsdaw.autoSaveDelay": {
          "type": "number",
          "default": 500,
          "description": "Delay in milliseconds before auto-save triggers."
        },
        "vsdaw.recording.countInBars": {
          "type": "number",
          "default": 1,
          "description": "Number of count-in bars before recording."
        },
        "vsdaw.export.defaultDirectory": {
          "type": "string",
          "default": "${workspaceFolder}/exports",
          "description": "Default directory for exported audio files."
        }
      }
    }
  },
  "main": "./out/extension/extension.js",
  "scripts": {
    "build": "bun run typecheck && bun run typecheck:engine && bun run build:engine && bun run build:extension && bun run build:views",
    "build:integration-tests": "node scripts/build-integration-tests.mjs",
    "build:engine": "node scripts/build-engine.mjs",
    "build:extension": "node scripts/build-extension.mjs",
    "build:views": "node scripts/build-views.mjs",
    "prepare": "husky",
    "watch:engine": "node scripts/build-engine.mjs --watch",
    "watch:extension": "node scripts/build-extension.mjs --watch",
    "watch:views": "node scripts/build-views.mjs --watch",
    "test": "jest",
    "test:integration": "bun run build:integration-tests && bunx vscode-test",
    "test:smoke": "node scripts/smoke.js",
    "test:engine": "node scripts/test-engine-isolated.mjs",
    "test:server": "bun out/extension/server.js",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "typecheck:engine": "tsc --noEmit --project tsconfig.engine.json",
    "package": "bun run build && node scripts/package.mjs",
    "version": "standard-version"
  },
  "lint-staged": {
    "*.{ts,tsx,mjs,js,json,md,yml,yaml}": ["biome check --write --no-errors-on-unmatched"]
  },
  "dependencies": {
    "chrome-launcher": "^1.2.1",
    "playwright-core": "^1.61.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@ffmpeg/ffmpeg": "^0.12.15",
    "@ffmpeg/util": "^0.12.2",
    "@hookform/resolvers": "^5.4.0",
    "@opendaw/lib-dsp": "^0.0.85",
    "@opendaw/lib-runtime": "^0.0.80",
    "@opendaw/lib-std": "^0.0.79",
    "@opendaw/studio-adapters": "^0.0.117",
    "@opendaw/studio-boxes": "^0.0.95",
    "@opendaw/studio-core": "^0.0.153",
    "@opendaw/studio-enums": "^0.0.78",
    "@opendaw/studio-sdk": "^0.0.155",
    "@radix-ui/react-accordion": "^1.2.14",
    "@radix-ui/react-checkbox": "^1.3.5",
    "@radix-ui/react-context-menu": "^2.3.1",
    "@radix-ui/react-dialog": "^1.1.17",
    "@radix-ui/react-dropdown-menu": "^2.1.18",
    "@radix-ui/react-label": "^2.1.10",
    "@radix-ui/react-popover": "^1.1.17",
    "@radix-ui/react-progress": "^1.1.10",
    "@radix-ui/react-radio-group": "^1.4.1",
    "@radix-ui/react-scroll-area": "^1.2.12",
    "@radix-ui/react-select": "^2.3.1",
    "@radix-ui/react-separator": "^1.1.10",
    "@radix-ui/react-slider": "^1.4.1",
    "@radix-ui/react-slot": "^1.3.0",
    "@radix-ui/react-tabs": "^1.1.15",
    "@radix-ui/react-tooltip": "^1.2.10",
    "@tanstack/react-query": "^5.101.1",
    "@types/bun": "^1.1.0",
    "@types/dagre": "^0.7.54",
    "@types/jest": "^29.5.14",
    "@types/jszip": "^3.4.1",
    "@types/mocha": "^10.0.10",
    "@types/node": "^22.0.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@types/vscode": "^1.80.0",
    "@types/webmidi": "^3.0.1",
    "@vscode/test-cli": "^0.0.10",
    "@vscode/test-electron": "^2.4.1",
    "@vscode/vsce": "^3.3.0",
    "autoprefixer": "^10.5.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "dagre": "^0.8.5",
    "esbuild": "^0.25.0",
    "framer-motion": "^12.42.0",
    "husky": "^9.1.7",
    "immer": "^11.1.8",
    "jest": "^29.7.0",
    "jszip": "^3.10.1",
    "lint-staged": "^15.4.0",
    "lucide-react": "^1.21.0",
    "mocha": "^10.7.0",
    "ovsx": "^0.10.0",
    "postcss": "^8.5.15",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-hook-form": "^7.80.0",
    "standard-version": "^9.5.0",
    "tailwind-merge": "^3.6.0",
    "tailwindcss": "^3.4.0",
    "ts-jest": "^29.4.11",
    "typescript": "^5.7.0",
    "webmidi": "^3.1.16",
    "zod": "^3.24.3",
    "zustand": "^5.0.14"
  }
}

exec
/bin/zsh -lc 'cat tsconfig.json && cat jest.config.* 2>/dev/null || true' in /Users/user/Projects/vsdaw
 succeeded in 0ms:
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "isolatedModules": true,
    "outDir": "./out",
    "rootDir": ".",
    "types": ["bun", "node", "vscode", "jest", "webmidi"]
  },
  "include": ["src/**/*", "scripts/**/*.ts"],
  "exclude": ["node_modules", "out", "dist", "src/engine"]
}
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest/presets/default",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: false,
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts", "<rootDir>/src/**/*.test.ts"],
  collectCoverageFrom: [
    "src/shared/**/*.ts",
    "src/engine/messageHandlers.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
  ],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
  coverageReporters: ["text", "lcov"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

exec
/bin/zsh -lc 'cat tsconfig.test.json' in /Users/user/Projects/vsdaw
 succeeded in 0ms:
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "isolatedModules": false,
    "noEmit": false,
    "types": ["node", "jest"]
  },
  "include": [
    "src/shared/**/*",
    "src/engine/messageHandlers.ts",
    "src/extension/**/*.ts",
    "tests/unit/**/*",
    "tests/__mocks__/**/*"
  ]
}

exec
/bin/zsh -lc "sed -n '1,220p' scripts/build-views.mjs && sed -n '1,220p' scripts/build-extension.mjs" in /Users/user/Projects/vsdaw
 succeeded in 1222ms:
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outdir = path.join(root, "out", "webview", "views");
const publicDir = path.join(root, "public", "views");
const sharedDir = path.join(root, "src", "views", "shared");

fs.mkdirSync(outdir, { recursive: true });

const watch = process.argv.includes("--watch");

const views = ["timeline", "mixer", "pianoRoll", "browser", "graph"];

/** @type {esbuild.BuildOptions} */
const baseConfig = {
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  loader: {
    ".ts": "ts",
    ".tsx": "tsx",
    ".css": "css",
  },
  external: [],
};

function viewConfig(view) {
  return {
    ...baseConfig,
    entryPoints: [path.join(root, "src", "views", view, "main.tsx")],
    outfile: path.join(outdir, `${view}.js`),
  };
}

async function buildTailwind() {
  const tailwindInput = path.join(sharedDir, "global.css");
  const tailwindOutput = path.join(outdir, "styles.css");
  try {
    execSync(`npx tailwindcss -i "${tailwindInput}" -o "${tailwindOutput}" --minify`, {
      stdio: "inherit",
      cwd: root,
    });
    console.log("Tailwind CSS built.");
  } catch (error) {
    console.warn(
      "Tailwind CSS build skipped (tailwindcss not installed). Inline styles still provide theme support.",
    );
  }
}

async function copyHtml() {
  for (const view of views) {
    const src = path.join(publicDir, `${view}.html`);
    const dest = path.join(outdir, `${view}.html`);
    if (fs.existsSync(src)) {
      let html = fs.readFileSync(src, "utf8");
      // Ensure the generated Tailwind stylesheet is referenced if it exists.
      if (fs.existsSync(path.join(outdir, "styles.css"))) {
        html = html.replace("</head>", '  <link rel="stylesheet" href="./styles.css">\n</head>');
      }
      fs.writeFileSync(dest, html);
      console.log(`Copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
    }
  }
}

async function build() {
  if (watch) {
    const contexts = await Promise.all(views.map((view) => esbuild.context(viewConfig(view))));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    await buildTailwind();
    await copyHtml();
    console.log("Watching views...");
  } else {
    await Promise.all(views.map((view) => esbuild.build(viewConfig(view))));
    await buildTailwind();
    await copyHtml();
    console.log("Views build complete.");
  }
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outdir = path.join(root, "out", "extension");

fs.mkdirSync(outdir, { recursive: true });

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: [path.join(root, "src", "extension", "extension.ts")],
  outfile: path.join(outdir, "extension.js"),
  bundle: true,
  format: "cjs",
  target: "node18",
  platform: "node",
  external: ["vscode", "playwright-core", "chrome-launcher"],
  sourcemap: true,
};

/** @type {esbuild.BuildOptions} */
const serverConfig = {
  entryPoints: [path.join(root, "src", "extension", "server.ts")],
  outfile: path.join(outdir, "server.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "node",
  external: ["bun"],
  sourcemap: true,
};

async function build() {
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxServer = await esbuild.context(serverConfig);
    await Promise.all([ctxExt.watch(), ctxServer.watch()]);
    console.log("Watching extension...");
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(serverConfig);
    fs.writeFileSync(
      path.join(outdir, "package.json"),
      JSON.stringify({ type: "commonjs" }, null, 2),
    );
    console.log("Extension build complete.");
  }
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});

exec
/bin/zsh -lc "sed -n '1,180p' src/views/shared/useViewState.ts && sed -n '1,260p' src/extension/viewMessageAdapter.ts && grep -R \"command/show\" -n src/extension src/engine src | head -50" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
import { useCallback, useEffect, useState } from "react";
import { messageBus } from "./messageBus.js";
import type {
  BrowserNode,
  HostMessage,
  SelectionState,
  TimePosition,
  TimeSignature,
  TrackState,
  ViewMessage,
  ViewName,
} from "./types.js";

const defaultPosition: TimePosition = { bars: 1, beats: 1, ticks: 0, seconds: 0 };
const defaultTimeSignature: TimeSignature = { numerator: 4, denominator: 4 };

export function useViewState(view: ViewName) {
  const [ready, setReady] = useState(false);
  const [projectName, setProjectName] = useState<string>("Untitled");
  const [saved, setSaved] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(false);
  const [position, setPosition] = useState<TimePosition>(defaultPosition);
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>(defaultTimeSignature);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [selection, setSelection] = useState<SelectionState>({});
  const [browserRoot, setBrowserRoot] = useState<BrowserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((message: ViewMessage) => {
    messageBus.send(message);
  }, []);

  useEffect(() => {
    messageBus.send({ type: "view/ready", view });
    setReady(true);

    const unsubscribe = messageBus.subscribe((message: HostMessage) => {
      switch (message.type) {
        case "host/project":
          setProjectName(message.name);
          setSaved(message.saved);
          break;
        case "host/transport":
          setIsPlaying(message.isPlaying);
          setIsRecording(message.isRecording);
          setIsLooping(message.isLooping);
          setIsMetronomeEnabled(message.isMetronomeEnabled);
          setPosition(message.position);
          setBpm(message.bpm);
          setTimeSignature(message.timeSignature);
          break;
        case "host/tracks":
          setTracks(message.tracks);
          break;
        case "host/selection":
          setSelection(message);
          break;
        case "host/browser":
          setBrowserRoot(message.root);
          break;
        case "host/error":
          setError(message.message);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [view]);

  const transport = {
    play: () => send({ type: "transport/play" }),
    pause: () => send({ type: "transport/pause" }),
    stop: () => send({ type: "transport/stop" }),
    record: () => send({ type: "transport/record" }),
    toggleLoop: () => send({ type: "transport/toggleLoop" }),
    toggleMetronome: () => send({ type: "transport/toggleMetronome" }),
    setTempo: (value: number) => send({ type: "transport/setTempo", bpm: value }),
    setTimeSignature: (value: TimeSignature) =>
      send({ type: "transport/setTimeSignature", timeSignature: value }),
    seek: (beats: number) => send({ type: "transport/seek", beats }),
  };

  const trackActions = {
    setMute: (trackId: string, muted: boolean) => send({ type: "track/setMute", trackId, muted }),
    setSolo: (trackId: string, soloed: boolean) => send({ type: "track/setSolo", trackId, soloed }),
    setArm: (trackId: string, armed: boolean) => send({ type: "track/setArm", trackId, armed }),
    setVolume: (trackId: string, volume: number) =>
      send({ type: "track/setVolume", trackId, volume }),
    setPan: (trackId: string, pan: number) => send({ type: "track/setPan", trackId, pan }),
    setName: (trackId: string, name: string) => send({ type: "track/setName", trackId, name }),
    createTrack: (trackType: "audio" | "midi" | "bus", name?: string, color?: string) =>
      send({ type: "track/create", trackType, name, color }),
    deleteTrack: (trackId: string) => send({ type: "track/delete", trackId }),
    setColor: (trackId: string, color: string) => send({ type: "track/setColor", trackId, color }),
    addInsert: (trackId: string, deviceName: string, insertIndex?: number) =>
      send({ type: "track/addInsert", trackId, deviceName, insertIndex }),
  };

  const timelineActions = {
    selectRegion: (regionId: string | null) => send({ type: "timeline/selectRegion", regionId }),
    moveRegion: (regionId: string, start: number) =>
      send({ type: "timeline/moveRegion", regionId, start }),
  };

  const mixerActions = {
    openDevice: (trackId: string, slotIndex: number) =>
      send({ type: "mixer/openDevice", trackId, slotIndex }),
  };

  const browserActions = {
    preview: (nodeId: string) => send({ type: "browser/preview", nodeId }),
    dragStart: (nodeId: string) => send({ type: "browser/dragStart", nodeId }),
  };

  const commands = {
    undo: () => send({ type: "command/undo" }),
    redo: () => send({ type: "command/redo" }),
    delete: () => send({ type: "command/delete" }),
    duplicate: () => send({ type: "command/duplicate" }),
    export: () => send({ type: "command/export" }),
    showView: (target: ViewName) => send({ type: "command/show", view: target }),
  };

  return {
    ready,
    projectName,
    saved,
    isPlaying,
    isRecording,
    isLooping,
    isMetronomeEnabled,
    position,
    bpm,
    timeSignature,
    tracks,
    selection,
    browserRoot,
    error,
    transport,
    trackActions,
    timelineActions,
    mixerActions,
    browserActions,
    commands,
    send,
  };
}
/**
 * Adapts React view messages into engine envelopes.
 *
 * Views use slash-delimited types (e.g. `transport/play`) while the OpenDAW
 * engine expects dotted `MessageType` values (e.g. `transport.play`). This
 * module performs the translation and shapes the payload so the engine can
 * handle the request directly.
 */

import {
  type MessageEnvelope,
  MessageType,
  type MidiNoteIdPayload,
  type MidiNoteVelocityPayload,
  type RegionMovePayload,
  type TrackBooleanPayload,
  type TrackColorPayload,
  type TrackCreatePayload,
  type TrackIdPayload,
  type TrackInsertPayload,
  type TrackNamePayload,
  type TrackPanPayload,
  type TrackVolumePayload,
  type TransportSeekPayload,
  type TransportTempoPayload,
  type TransportTimeSignaturePayload,
} from "../shared/protocol.js";
import type { ViewMessage } from "../views/shared/types.js";

const MIN_VOLUME_DB = -120;

const DEFAULT_TRACK_COLORS: Record<"audio" | "midi" | "bus", string> = {
  audio: "hsl(210, 70%, 50%)",
  midi: "hsl(280, 70%, 50%)",
  bus: "hsl(35, 70%, 50%)",
};

function defaultTrackName(type: "audio" | "midi" | "bus"): string {
  switch (type) {
    case "audio":
      return "Audio Track";
    case "midi":
      return "MIDI Track";
    case "bus":
      return "Bus Track";
  }
}

function linearToDb(volume: number): number {
  const clamped = Math.max(0, Math.min(1, volume));
  if (clamped <= 0) return MIN_VOLUME_DB;
  return 20 * Math.log10(clamped);
}

/**
 * Translates a view message into a host-to-engine envelope.
 *
 * @returns The adapted envelope, or `undefined` when the view message has no
 * engine equivalent or cannot be converted without additional state.
 */
export function adaptViewMessage(
  projectId: string,
  message: ViewMessage,
): MessageEnvelope | undefined {
  const base = { projectId, direction: "host-to-engine" as const };

  switch (message.type) {
    // Transport
    case "transport/play":
      return { ...base, type: MessageType.TransportPlay };
    case "transport/pause":
      return { ...base, type: MessageType.TransportPause };
    case "transport/stop":
      return { ...base, type: MessageType.TransportStop };
    case "transport/record":
      return { ...base, type: MessageType.TransportRecord };
    case "transport/setTempo": {
      const payload: TransportTempoPayload = { bpm: message.bpm };
      return { ...base, type: MessageType.TransportSetTempo, payload };
    }
    case "transport/setTimeSignature": {
      const payload: TransportTimeSignaturePayload = {
        numerator: message.timeSignature.numerator,
        denominator: message.timeSignature.denominator,
      };
      return { ...base, type: MessageType.TransportSetTimeSignature, payload };
    }
    case "transport/seek": {
      // The timeline works in beats; the engine's transport seek uses PPQN
      // ticks when the unit is "ppqn".
      const payload: TransportSeekPayload = {
        position: message.beats * 960,
        unit: "ppqn",
      };
      return { ...base, type: MessageType.TransportSeek, payload };
    }

    // Tracks
    case "track/setMute": {
      const payload: TrackBooleanPayload = {
        trackId: message.trackId,
        value: message.muted,
      };
      return { ...base, type: MessageType.TrackSetMute, payload };
    }
    case "track/setSolo": {
      const payload: TrackBooleanPayload = {
        trackId: message.trackId,
        value: message.soloed,
      };
      return { ...base, type: MessageType.TrackSetSolo, payload };
    }
    case "track/setArm": {
      const payload: TrackBooleanPayload = {
        trackId: message.trackId,
        value: message.armed,
      };
      return { ...base, type: MessageType.TrackSetArm, payload };
    }
    case "track/setVolume": {
      const payload: TrackVolumePayload = {
        trackId: message.trackId,
        volumeDb: linearToDb(message.volume),
      };
      return { ...base, type: MessageType.TrackSetVolumeDb, payload };
    }
    case "track/setPan": {
      const payload: TrackPanPayload = {
        trackId: message.trackId,
        pan: message.pan,
      };
      return { ...base, type: MessageType.TrackSetPan, payload };
    }
    case "track/setName": {
      const payload: TrackNamePayload = {
        trackId: message.trackId,
        name: message.name,
      };
      return { ...base, type: MessageType.TrackSetName, payload };
    }
    case "track/create": {
      const payload: TrackCreatePayload = {
        type: message.trackType,
        name: message.name ?? defaultTrackName(message.trackType),
        color: message.color ?? DEFAULT_TRACK_COLORS[message.trackType],
      };
      return { ...base, type: MessageType.TrackCreate, payload };
    }
    case "track/delete": {
      const payload: TrackIdPayload = { trackId: message.trackId };
      return { ...base, type: MessageType.TrackDelete, payload };
    }
    case "track/setColor": {
      const payload: TrackColorPayload = {
        trackId: message.trackId,
        color: message.color,
      };
      return { ...base, type: MessageType.TrackSetColor, payload };
    }
    case "track/addInsert": {
      const payload: TrackInsertPayload = {
        trackId: message.trackId,
        deviceName: message.deviceName,
        insertIndex: message.insertIndex,
      };
      return { ...base, type: MessageType.TrackAddInsert, payload };
    }

    // Timeline
    case "timeline/moveRegion": {
      const payload: RegionMovePayload = {
        regionId: message.regionId,
        position: message.start,
      };
      return { ...base, type: MessageType.RegionMove, payload };
    }

    // Piano roll
    case "pianoRoll/setNoteVelocity": {
      const payload: MidiNoteVelocityPayload = {
        noteId: message.noteId,
        velocity: message.velocity,
      };
      return { ...base, type: MessageType.MidiSetNoteVelocity, payload };
    }
    case "pianoRoll/deleteNote": {
      const payload: MidiNoteIdPayload = { noteId: message.noteId };
      return { ...base, type: MessageType.MidiDeleteNote, payload };
    }

    // Unsupported: lifecycle, UI-only, or state-dependent toggles.
    case "view/ready":
    case "transport/toggleLoop":
    case "transport/toggleMetronome":
    case "timeline/selectRegion":
    case "pianoRoll/addNote":
    case "mixer/openDevice":
    case "browser/preview":
    case "browser/dragStart":
    case "command/undo":
    case "command/redo":
    case "command/delete":
    case "command/duplicate":
    case "command/export":
    case "command/show":
      return undefined;

    default:
      return undefined;
  }
}
src/extension/viewMessageAdapter.ts:205:    case "command/show":
src/extension/viewMessageAdapter.ts:205:    case "command/show":
src/views/shared/types.ts:103:  | { type: "command/show"; view: ViewName };
src/views/shared/useViewState.ts:127:    showView: (target: ViewName) => send({ type: "command/show", view: target }),

exec
/bin/zsh -lc "sed -n '1,240p' src/views/shared/messageBus.ts && grep -R \"showView\\|show.*view\\|command/show\\|ViewName\" -n src/extension src | head -200" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
import type { HostMessage, ViewMessage } from "./types.js";
import { getVsCodeApi } from "./vscodeApi.js";

const vscode = getVsCodeApi<ViewMessage>();

const listeners = new Set<(message: HostMessage) => void>();

window.addEventListener("message", (event) => {
  // In VS Code webviews, messages from the extension host use the webview
  // itself as the source. We accept all data objects with a `type` field.
  if (event.data && typeof event.data === "object" && "type" in event.data) {
    for (const listener of listeners) {
      listener(event.data as HostMessage);
    }
  }
});

/**
 * Thin typed wrapper around `acquireVsCodeApi().postMessage` and the
 * window `message` event. Views use this to send actions to the host and
 * receive authoritative state updates.
 */
export const messageBus = {
  send(message: ViewMessage) {
    vscode.postMessage(message);
  },

  subscribe(listener: (message: HostMessage) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getState(): unknown {
    return vscode.getState();
  },

  setState(state: unknown) {
    vscode.setState(state);
  },
};
src/extension/viewMessageAdapter.ts:205:    case "command/show":
src/extension/views/mixer.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/views/pianoRoll.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/views/browser.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/views/graph.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/viewMessageAdapter.ts:205:    case "command/show":
src/extension/views/mixer.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/views/pianoRoll.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/views/browser.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/extension/views/graph.ts:12:  show(projectId: string): vscode.WebviewPanel {
src/components/shared/ViewSwitcher.tsx:2:import type { ViewName } from "../../views/shared/types.js";
src/components/shared/ViewSwitcher.tsx:4:const VIEWS: { id: ViewName; label: string }[] = [
src/components/shared/ViewSwitcher.tsx:13:  active: ViewName;
src/components/shared/ViewSwitcher.tsx:14:  onChange: (view: ViewName) => void;
src/components/shared/Toolbar.tsx:4:import type { TimePosition, TimeSignature, ViewName } from "../../views/shared/types.js";
src/components/shared/Toolbar.tsx:28:  onShowView: (view: ViewName) => void;
src/components/shared/Toolbar.tsx:97:        <ViewSwitcher active={view.toLowerCase() as ViewName} onChange={onShowView} />
src/views/graph/main.tsx:62:            onShowView={state.commands.showView}
src/views/graph/main.tsx:63:            onSettings={() => state.commands.showView("browser")}
src/views/pianoRoll/main.tsx:66:            onShowView={state.commands.showView}
src/views/pianoRoll/main.tsx:67:            onSettings={() => state.commands.showView("browser")}
src/views/shared/types.ts:70:  | { type: "view/ready"; view: ViewName }
src/views/shared/types.ts:103:  | { type: "command/show"; view: ViewName };
src/views/shared/types.ts:129:export type ViewName = "timeline" | "mixer" | "pianoRoll" | "browser" | "graph";
src/views/shared/useViewState.ts:11:  ViewName,
src/views/shared/useViewState.ts:17:export function useViewState(view: ViewName) {
src/views/shared/useViewState.ts:127:    showView: (target: ViewName) => send({ type: "command/show", view: target }),
src/views/browser/main.tsx:118:            onShowView={state.commands.showView}
src/views/browser/main.tsx:119:            onSettings={() => state.commands.showView("browser")}
src/views/mixer/main.tsx:57:            onShowView={state.commands.showView}
src/views/mixer/main.tsx:58:            onSettings={() => state.commands.showView("browser")}
src/views/timeline/main.tsx:110:            onShowView={state.commands.showView}
src/views/timeline/main.tsx:112:            onSettings={() => state.commands.showView("browser")}

exec
/bin/zsh -lc "grep -R \"onDidReceiveMessage\\|adaptViewMessage\\|postMessage\" -n src/extension | head -200 && sed -n '1,240p' src/extension/views/timeline.ts && ls src/extension/views && sed -n '1,160p' src/extension/views/mixer.ts" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
src/extension/viewMessageAdapter.ts:61:export function adaptViewMessage(
src/extension/engineTransport.ts:5:  postMessage(message: MessageEnvelope): void;
src/extension/engineTransport.ts:6:  readonly onDidReceiveMessage: vscode.Event<MessageEnvelope>;
src/extension/engineTransport.ts:11:  private _onDidReceiveMessage = new vscode.EventEmitter<MessageEnvelope>();
src/extension/engineTransport.ts:12:  public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;
src/extension/engineTransport.ts:21:      panel.webview.onDidReceiveMessage((raw: unknown) => {
src/extension/engineTransport.ts:23:          this._onDidReceiveMessage.fire(raw as MessageEnvelope);
src/extension/engineTransport.ts:35:  postMessage(message: MessageEnvelope): void {
src/extension/engineTransport.ts:36:    void this.panel.webview.postMessage(message);
src/extension/engineTransport.ts:40:    this._onDidReceiveMessage.dispose();
src/extension/playwrightEngine.ts:21:  private _onDidReceiveMessage = new vscode.EventEmitter<MessageEnvelope>();
src/extension/playwrightEngine.ts:22:  public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;
src/extension/playwrightEngine.ts:39:  postMessage(message: MessageEnvelope): void {
src/extension/playwrightEngine.ts:56:    this._onDidReceiveMessage.fire(message);
src/extension/playwrightEngine.ts:66:    this._onDidReceiveMessage.dispose();
src/extension/playwrightEngine.ts:267:      const subscription = transport.onDidReceiveMessage((message) => {
src/extension/playwrightEngine.ts:276:      transport.postMessage({
src/extension/messageRouter.ts:6:import { adaptViewMessage } from "./viewMessageAdapter.js";
src/extension/messageRouter.ts:43:      transport.onDidReceiveMessage((message) => {
src/extension/messageRouter.ts:92:      panel.webview.onDidReceiveMessage((raw: unknown) => {
src/extension/messageRouter.ts:142:      transport.postMessage(envelope);
src/extension/messageRouter.ts:155:      Promise.resolve(panel.webview.postMessage(envelope)).catch((error) => {
src/extension/messageRouter.ts:167:      Promise.resolve(panel.webview.postMessage(message)).catch((error) => {
src/extension/messageRouter.ts:180:        panel.webview.postMessage({
src/extension/messageRouter.ts:234:        transport.postMessage(envelope);
src/extension/messageRouter.ts:356:    const envelope = adaptViewMessage(projectId, viewMessage);
import type * as vscode from "vscode";
import { VsdawDocument, VsdawEditorProvider } from "../editor/vsdawEditor.js";
import type { ProjectManager } from "../projectManager.js";

export class TimelineCustomEditorProvider extends VsdawEditorProvider {
  public static override readonly viewType = "vsdaw.editor";
}

export { VsdawDocument };
base.ts
browser.ts
graph.ts
index.ts
mixer.ts
pianoRoll.ts
timeline.ts
import * as vscode from "vscode";
import type { MessageRouter } from "../messageRouter.js";
import { createViewPanel } from "./base.js";

export class MixerWebviewProvider {
  constructor(
    private context: vscode.ExtensionContext,
    private router: MessageRouter,
    private getServerOrigin: () => string | undefined,
  ) {}

  show(projectId: string): vscode.WebviewPanel {
    return createViewPanel({
      context: this.context,
      router: this.router,
      projectId,
      viewType: "vsdaw.mixer",
      bundleName: "mixer",
      title: `Mixer (${projectId.slice(0, 8)})`,
      column: vscode.ViewColumn.Beside,
      serverOrigin: this.getServerOrigin() ?? "",
    });
  }
}

exec
/bin/zsh -lc "sed -n '1,440p' src/extension/messageRouter.ts" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
import type * as vscode from "vscode";
import { MessageSchema, MessageType } from "../shared/protocol.js";
import type { HostMessage, ViewMessage } from "../views/shared/types.js";
import type { EngineTransport } from "./engineTransport.js";
import type { MessageEnvelope, PendingRequest } from "./types.js";
import { adaptViewMessage } from "./viewMessageAdapter.js";

export interface MessageRouterCallbacks {
  onEngineReady: (projectId: string, payload: unknown) => void;
  onEngineError: (projectId: string, payload: unknown) => void;
  onEngineStateUpdate: (projectId: string, message: MessageEnvelope) => void;
  onViewMessage: (projectId: string, message: MessageEnvelope) => void;
  onViewSelection?: (projectId: string, regionId: string | null) => void;
}

export class MessageRouter implements vscode.Disposable {
  private engines = new Map<string, EngineTransport>();
  private views = new Map<string, Set<vscode.WebviewPanel>>();
  private pending = new Map<string, Map<string, PendingRequest>>();

  constructor(
    private outputChannel: vscode.OutputChannel,
    private callbacks: MessageRouterCallbacks,
  ) {}

  dispose(): void {
    for (const [, map] of this.pending) {
      for (const [, req] of map) {
        clearTimeout(req.timeout);
        req.reject(new Error("Message router disposed"));
      }
    }
    this.pending.clear();
    this.engines.clear();
    this.views.clear();
  }

  registerEngine(projectId: string, transport: EngineTransport): vscode.Disposable {
    this.engines.set(projectId, transport);
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      transport.onDidReceiveMessage((message) => {
        this.handleEngineMessage(projectId, message);
      }),
    );

    disposables.push(
      transport.onDidDispose(() => {
        this.unregisterEngine(projectId);
        for (const d of disposables) {
          d.dispose();
        }
      }),
    );

    return {
      dispose: () => {
        for (const d of disposables) {
          d.dispose();
        }
      },
    };
  }

  unregisterEngine(projectId: string): void {
    this.engines.delete(projectId);
    const pending = this.pending.get(projectId);
    if (pending) {
      for (const [, req] of pending) {
        clearTimeout(req.timeout);
        req.reject(new Error("Engine transport disposed"));
      }
      this.pending.delete(projectId);
    }
    // Do NOT delete view registrations here; engine lifecycle is independent of views.
  }

  registerView(projectId: string, panel: vscode.WebviewPanel): void {
    let set = this.views.get(projectId);
    if (!set) {
      set = new Set();
      this.views.set(projectId, set);
    }
    if (set.has(panel)) {
      return;
    }
    set.add(panel);

    const disposables: vscode.Disposable[] = [];
    disposables.push(
      panel.webview.onDidReceiveMessage((raw: unknown) => {
        this.handleViewMessage(projectId, raw);
      }),
    );
    disposables.push(
      panel.onDidDispose(() => {
        this.unregisterView(projectId, panel);
        for (const d of disposables) {
          d.dispose();
        }
      }),
    );
  }

  unregisterView(projectId: string, panel: vscode.WebviewPanel): void {
    const set = this.views.get(projectId);
    if (set) {
      set.delete(panel);
      if (set.size === 0) {
        this.views.delete(projectId);
      }
    }
  }

  getViews(projectId: string): vscode.WebviewPanel[] {
    const set = this.views.get(projectId);
    return set ? Array.from(set) : [];
  }

  findView(projectId: string, viewType: string): vscode.WebviewPanel | undefined {
    const set = this.views.get(projectId);
    if (!set) return undefined;
    for (const panel of set) {
      if (panel.viewType === viewType) {
        return panel;
      }
    }
    return undefined;
  }

  routeToEngine(projectId: string, message: Omit<MessageEnvelope, "direction">): void {
    const transport = this.engines.get(projectId);
    if (!transport) {
      this.outputChannel.appendLine(
        `[router] no engine for project ${projectId} (dropping ${message.type})`,
      );
      return;
    }
    const envelope: MessageEnvelope = { ...message, direction: "host-to-engine" };
    try {
      transport.postMessage(envelope);
    } catch (error) {
      this.outputChannel.appendLine(
        `[router] failed to post to engine ${projectId}: ${String(error)}`,
      );
    }
  }

  routeToViews(projectId: string, message: Omit<MessageEnvelope, "direction">): void {
    const envelope: MessageEnvelope = { ...message, direction: "host-to-view" };
    const set = this.views.get(projectId);
    if (!set) return;
    for (const panel of set) {
      Promise.resolve(panel.webview.postMessage(envelope)).catch((error) => {
        this.outputChannel.appendLine(
          `[router] failed to post to view ${projectId}: ${String(error)}`,
        );
      });
    }
  }

  broadcastToViews(projectId: string, message: HostMessage): void {
    const set = this.views.get(projectId);
    if (!set) return;
    for (const panel of set) {
      Promise.resolve(panel.webview.postMessage(message)).catch((error) => {
        this.outputChannel.appendLine(
          `[router] failed to broadcast to view ${projectId}: ${String(error)}`,
        );
      });
    }
  }

  private routeErrorToViews(projectId: string, text: string): void {
    const set = this.views.get(projectId);
    if (!set) return;
    for (const panel of set) {
      Promise.resolve(
        panel.webview.postMessage({
          type: "host/error",
          message: text,
        }),
      ).catch((error) => {
        this.outputChannel.appendLine(
          `[router] failed to post error to view ${projectId}: ${String(error)}`,
        );
      });
    }
  }

  async requestEngine(
    projectId: string,
    type: string,
    payload: unknown,
    options: { responseType?: string; timeoutMs?: number } = {},
  ): Promise<MessageEnvelope> {
    const transport = this.engines.get(projectId);
    if (!transport) {
      throw new Error(`No engine transport for project ${projectId}`);
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutMs = options.timeoutMs ?? 10000;

    return new Promise<MessageEnvelope>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.clearPending(projectId, requestId);
        reject(new Error(`Engine request ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const pending: PendingRequest = {
        resolve,
        reject,
        timeout,
        responseType: options.responseType,
      };

      let map = this.pending.get(projectId);
      if (!map) {
        map = new Map();
        this.pending.set(projectId, map);
      }
      map.set(requestId, pending);

      const envelope: MessageEnvelope = {
        projectId,
        direction: "host-to-engine",
        type,
        payload,
        requestId,
      };
      try {
        transport.postMessage(envelope);
      } catch (error) {
        this.clearPending(projectId, requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private clearPending(projectId: string, requestId: string): void {
    const map = this.pending.get(projectId);
    if (!map) return;
    const req = map.get(requestId);
    if (req) {
      clearTimeout(req.timeout);
      map.delete(requestId);
    }
    if (map.size === 0) {
      this.pending.delete(projectId);
    }
  }

  private handleEngineMessage(projectId: string, raw: unknown): void {
    const parse = MessageSchema.safeParse(raw);
    if (!parse.success) {
      this.outputChannel.appendLine(`[router] invalid engine message: ${JSON.stringify(raw)}`);
      return;
    }
    const message = parse.data as MessageEnvelope;
    if (message.projectId !== projectId) {
      this.outputChannel.appendLine(
        `[router] engine message projectId mismatch: ${message.projectId} vs ${projectId}`,
      );
      return;
    }
    if (message.direction !== "engine-to-host") {
      this.outputChannel.appendLine(
        `[router] unexpected engine message direction: ${message.direction}`,
      );
      return;
    }

    // Resolve pending requests first.
    if (message.requestId) {
      const resolved = this.tryResolvePending(projectId, message);
      if (resolved) return;
      this.outputChannel.appendLine(
        `[router] dropping unmatched engine response: ${message.type} ${message.requestId}`,
      );
      return;
    }

    if (message.type === MessageType.EngineReady) {
      this.callbacks.onEngineReady(projectId, message.payload);
      return;
    }
    if (message.type === MessageType.EngineError) {
      this.callbacks.onEngineError(projectId, message.payload);
      const text =
        typeof message.payload === "object" && message.payload !== null
          ? ((message.payload as { message?: string }).message ?? JSON.stringify(message.payload))
          : String(message.payload);
      this.routeErrorToViews(projectId, text);
      return;
    }

    if (
      message.type === MessageType.StateUpdate ||
      message.type === MessageType.TransportPositionChanged
    ) {
      this.callbacks.onEngineStateUpdate(projectId, message);
      return;
    }

    // Broadcast engine state to all views for this project.
    this.routeToViews(projectId, {
      projectId,
      type: message.type,
      payload: message.payload,
      requestId: message.requestId,
    });
  }

  private tryResolvePending(projectId: string, message: MessageEnvelope): boolean {
    const map = this.pending.get(projectId);
    if (!map || !message.requestId) return false;
    const req = map.get(message.requestId);
    if (!req) return false;

    if (req.responseType && req.responseType !== message.type) {
      this.outputChannel.appendLine(
        `[router] response type mismatch for ${message.requestId}: expected ${req.responseType}, got ${message.type}`,
      );
      return true;
    }

    clearTimeout(req.timeout);
    map.delete(message.requestId);
    if (map.size === 0) {
      this.pending.delete(projectId);
    }
    req.resolve(message);
    return true;
  }

  private handleViewMessage(projectId: string, raw: unknown): void {
    if (raw === null || typeof raw !== "object" || !("type" in raw)) {
      this.outputChannel.appendLine(`[router] invalid view message: ${JSON.stringify(raw)}`);
      return;
    }

    const viewMessage = raw as ViewMessage;

    // Lifecycle/UI-only messages are not forwarded to the engine.
    if (viewMessage.type === "view/ready") {
      return;
    }

    if (viewMessage.type === "timeline/selectRegion") {
      this.callbacks.onViewSelection?.(projectId, viewMessage.regionId ?? null);
      return;
    }

    const envelope = adaptViewMessage(projectId, viewMessage);
    if (!envelope) {
      const reason = `unsupported view message type: ${viewMessage.type}`;
      this.outputChannel.appendLine(`[router] ${reason}`);
      this.routeErrorToViews(projectId, reason);
      return;
    }

    const parse = MessageSchema.safeParse(envelope);
    if (!parse.success) {
      this.outputChannel.appendLine(`[router] invalid adapted envelope: ${parse.error.message}`);
      return;
    }
    const message = parse.data as MessageEnvelope;
    if (message.projectId !== projectId) {
      this.outputChannel.appendLine(
        `[router] adapted envelope projectId mismatch: ${message.projectId} vs ${projectId}`,
      );
      return;
    }
    if (message.direction !== "host-to-engine") {
      this.outputChannel.appendLine(
        `[router] unexpected adapted envelope direction: ${message.direction}`,
      );
      return;
    }

    this.callbacks.onViewMessage(projectId, message);

    this.routeToEngine(projectId, {
      projectId,
      type: message.type,
      payload: message.payload,
      requestId: message.requestId,
    });
  }
}

exec
/bin/zsh -lc "grep -R \"TrackCreate\\|track.create\\|TrackCreatePayload\" -n src | head -120" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
src/extension/viewMessageAdapter.ts:18:  type TrackCreatePayload,
src/extension/viewMessageAdapter.ts:141:    case "track/create": {
src/extension/viewMessageAdapter.ts:142:      const payload: TrackCreatePayload = {
src/extension/viewMessageAdapter.ts:147:      return { ...base, type: MessageType.TrackCreate, payload };
src/shared/protocol.ts:104:  TrackCreate = "track.create",
src/shared/protocol.ts:196:export interface TrackCreatePayload {
src/views/shared/types.ts:86:  | { type: "track/create"; trackType: "audio" | "midi" | "bus"; name?: string; color?: string }
src/views/shared/useViewState.ts:98:      send({ type: "track/create", trackType, name, color }),
src/engine/messageHandlers.ts:30:  type TrackCreatePayload,
src/engine/messageHandlers.ts:143:    case MessageType.TrackCreate: {
src/engine/messageHandlers.ts:144:      const opts = p as TrackCreatePayload;

exec
/bin/zsh -lc "sed -n '120,180p' src/engine/messageHandlers.ts && sed -n '180,210p' src/shared/protocol.ts" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
    case MessageType.TransportSetLoop: {
      const opts = p as TransportLoopPayload;
      controller.setLoop(opts.enabled, opts.start, opts.end);
      return { type: "ok" };
    }
    case MessageType.TransportSetTempo: {
      const opts = p as TransportTempoPayload;
      if (opts?.bpm == null || opts.bpm <= 0) {
        return { type: "error", message: "Valid BPM is required" };
      }
      controller.setTempo(opts.bpm);
      return { type: "ok" };
    }
    case MessageType.TransportSetTimeSignature: {
      const opts = p as TransportTimeSignaturePayload;
      if (opts?.numerator == null || opts?.denominator == null || opts.denominator <= 0) {
        return { type: "error", message: "Valid time signature is required" };
      }
      controller.setTimeSignature(opts.numerator, opts.denominator);
      return { type: "ok" };
    }

    // Tracks
    case MessageType.TrackCreate: {
      const opts = p as TrackCreatePayload;
      if (!opts?.type) {
        return { type: "error", message: "Track type is required" };
      }
      const id = controller.createTrack(opts.type, opts.name, opts.index, opts.color);
      return { type: "ok", payload: { trackId: id } };
    }
    case MessageType.TrackDelete: {
      const opts = p as TrackIdPayload;
      if (!opts?.trackId) {
        return { type: "error", message: "trackId is required" };
      }
      controller.deleteTrack(opts.trackId);
      return { type: "ok" };
    }
    case MessageType.TrackReorder: {
      const opts = p as TrackReorderPayload;
      if (!opts?.trackId || opts.newIndex == null) {
        return { type: "error", message: "trackId and newIndex are required" };
      }
      controller.reorderTrack(opts.trackId, opts.newIndex);
      return { type: "ok" };
    }
    case MessageType.TrackSetName: {
      const opts = p as TrackNamePayload;
      if (!opts?.trackId || opts.name == null) {
        return { type: "error", message: "trackId and name are required" };
      }
      controller.setTrackName(opts.trackId, opts.name);
      return { type: "ok" };
    }
    case MessageType.TrackSetColor: {
      const opts = p as TrackColorPayload;
      if (!opts?.trackId || opts.color == null) {
        return { type: "error", message: "trackId and color are required" };
      }
      controller.setTrackColor(opts.trackId, opts.color);

export interface TransportLoopPayload {
  enabled: boolean;
  start?: number;
  end?: number;
}

export interface TransportTempoPayload {
  bpm: number;
}

export interface TransportTimeSignaturePayload {
  numerator: number;
  denominator: number;
}

export interface TrackCreatePayload {
  type: TrackType;
  name?: string;
  index?: number;
  color?: string;
}

export interface TrackIdPayload {
  trackId: string;
}

export interface TrackReorderPayload {
  trackId: string;
  newIndex: number;
}

exec
/bin/zsh -lc "grep -R \"showMixer\\|showPiano\\|showTimeline\\|showBrowser\\|showGraph\" -n src/extension | head -200" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
src/extension/commands.ts:48:  register("vsdaw.showTimeline", async () => {
src/extension/commands.ts:63:  register("vsdaw.showMixer", () => {
src/extension/commands.ts:69:  register("vsdaw.showPianoRoll", () => {
src/extension/commands.ts:75:  register("vsdaw.showBrowser", () => {
src/extension/commands.ts:81:  register("vsdaw.showGraph", () => {

exec
/bin/zsh -lc "sed -n '1,120p' src/extension/commands.ts" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { MessageType } from "../shared/protocol.js";
import type { PlaywrightEngineManager } from "./playwrightEngine.js";
import type { ProjectManager } from "./projectManager.js";
import type {
  BrowserWebviewProvider,
  GraphWebviewProvider,
  MixerWebviewProvider,
  PianoRollWebviewProvider,
} from "./views/index.js";

export interface CommandDependencies {
  context: vscode.ExtensionContext;
  projectManager: ProjectManager;
  engineManager: PlaywrightEngineManager;
  mixerProvider: MixerWebviewProvider;
  pianoRollProvider: PianoRollWebviewProvider;
  browserProvider: BrowserWebviewProvider;
  graphProvider: GraphWebviewProvider;
}

export function registerCommands(deps: CommandDependencies): vscode.Disposable[] {
  const { projectManager } = deps;
  const outputChannel = projectManager.outputChannel;
  const disposables: vscode.Disposable[] = [];

  const register = (command: string, handler: () => Promise<void> | void) => {
    disposables.push(
      vscode.commands.registerCommand(command, async () => {
        try {
          await handler();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outputChannel.appendLine(`[command:${command}] error: ${message}`);
          if (!(error instanceof vscode.CancellationError)) {
            vscode.window.showErrorMessage(`VSDAW: ${message}`);
          }
        }
      }),
    );
  };

  register("vsdaw.newProject", () => projectManager.newProject());
  register("vsdaw.openProject", () => projectManager.openProject());

  register("vsdaw.showTimeline", async () => {
    const projectId = getActiveProjectId(projectManager);
    if (!projectId) return;
    const session = projectManager.getSession(projectId);
    if (!session) return;
    const timeline = session.views.get("vsdaw.editor");
    if (timeline) {
      timeline.reveal(vscode.ViewColumn.One);
    } else {
      await vscode.commands.executeCommand("vscode.openWith", session.uri, "vsdaw.editor", {
        preview: false,
      });
    }
  });

  register("vsdaw.showMixer", () => {
    const projectId = getActiveProjectId(projectManager);
    if (!projectId) return;
    deps.mixerProvider.show(projectId);
  });

  register("vsdaw.showPianoRoll", () => {
    const projectId = getActiveProjectId(projectManager);
    if (!projectId) return;
    deps.pianoRollProvider.show(projectId);
  });

  register("vsdaw.showBrowser", () => {
    const projectId = getActiveProjectId(projectManager);
    if (!projectId) return;
    deps.browserProvider.show(projectId);
  });

  register("vsdaw.showGraph", () => {
    const projectId = getActiveProjectId(projectManager);
    if (!projectId) return;
    deps.graphProvider.show(projectId);
  });

  register("vsdaw.export", async () => {
    const projectId = getActiveProjectId(projectManager);
    if (!projectId) return;

    const format = await vscode.window.showQuickPick(["wav", "flac", "ogg"], {
      placeHolder: "Select export format",
    });
    if (!format) return;

    const config = vscode.workspace.getConfiguration("vsdaw");
    const defaultDir = config.get<string>("export.defaultDirectory", "${workspaceFolder}/exports");
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    let dir = defaultDir;
    if (workspacePath) {
      dir = dir.replace("${workspaceFolder}", workspacePath);
    } else if (dir.includes("${workspaceFolder}")) {
      dir = path.join(os.homedir(), "exports");
    }
    if (!path.isAbsolute(dir)) {
      dir = path.join(workspacePath ?? os.homedir(), dir);
    }

    const destination = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(dir, `export.${format}`)),
      filters: { [format.toUpperCase()]: [format] },
      saveLabel: "Export",
    });
    if (!destination) return;

    await projectManager.router.requestEngine(
      projectId,
      MessageType.ExportRender,
      {

exec
/bin/zsh -lc "grep -R \"vsdaw-button-hover\\|vsdaw-hover-bg\" -n src public | head -50" in /Users/user/Projects/vsdaw
 succeeded in 0ms:
src/components/transport/TransportControls.tsx:120:        if (!accent) e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)";
src/components/shared/ViewSwitcher.tsx:44:              if (!isActive) e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)";
src/components/shared/Toolbar.tsx:198:            e.currentTarget.style.backgroundColor = "var(--vsdaw-button-hover)";
src/components/shared/Toolbar.tsx:221:            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
src/components/shared/Toolbar.tsx:230:            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
src/components/shared/Toolbar.tsx:239:            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
src/components/shared/Toolbar.tsx:261:    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
src/components/shared/ThemeProvider.tsx:22:          --vsdaw-button-hover: ${theme["--vscode-button-hoverBackground"]};
src/components/shared/ThemeProvider.tsx:30:          --vsdaw-hover-bg: ${theme["--vscode-list-hoverBackground"]};
src/components/browser/BrowserTree.tsx:106:        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
src/components/browser/BrowserTree.tsx:108:        onFocus={(e) => (e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)")}
src/components/timeline/TrackColumnHeader.tsx:51:              e.currentTarget.style.backgroundColor = "var(--vsdaw-button-hover)";
src/components/timeline/TrackHeader.tsx:203:      if (!active) e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)";
src/components/timeline/TrackHeader.tsx:281:            e.currentTarget.style.backgroundColor = "var(--vsdaw-hover-bg)";

