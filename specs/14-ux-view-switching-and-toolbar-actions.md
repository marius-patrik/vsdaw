# Spec 14: UX — View Switching and Toolbar Actions

## Problem Statement

User feedback: only the Timeline tab is visible and most toolbar buttons do nothing (except buttons that surface errors). A code audit found that the toolbar sends `command/*` view messages which are dropped as unsupported by the extension host.

## Audit Findings

1. **Toolbar ViewSwitcher sends `command/show`.** The host does not handle this message, so clicking Mixer / Piano Roll / Browser / Graph tabs in the toolbar has no effect. The Timeline itself is a VS Code custom editor; the other views are separate webview panels created by `MixerWebviewProvider`, `PianoRollWebviewProvider`, `BrowserWebviewProvider`, and `GraphWebviewProvider`.
2. **Toolbar action buttons send unhandled `command/*` messages.**
   - `command/delete` — not handled.
   - `command/duplicate` — not handled.
   - `command/export` — not handled.
   - `command/importAudio` and `command/importMidi` — already handled correctly by executing `vsdaw.importAudio` / `vsdaw.importMidi`.
   - `command/undo` and `command/redo` — already forwarded to `ProjectManager.onViewMessage`.
3. **Settings button works by side-effect.** It calls `state.commands.showView("browser")`, which will work once `command/show` is implemented.
4. **Transport buttons work.** Play/pause/stop/record/loop/metronome send engine-routed messages and are functional.
5. **Add Track works.** It sends `track/create` which is adapted to `MessageType.TrackCreate`.
6. **No unified tab container.** Each view is an independent VS Code webview panel. The ViewSwitcher is expected to open or focus the matching panel.

## Goals

1. Clicking a view tab in any toolbar opens or focuses the corresponding VS Code panel.
2. Toolbar Delete and Duplicate perform the intended editing action on the current selection.
3. Toolbar Export opens the export flow.
4. All changes are covered by unit tests.
5. The fixes are validated end-to-end in VS Code.

## Messages

### From view to host (existing, currently dropped)

- `command/show` — `{ view: "timeline" | "mixer" | "pianoRoll" | "browser" | "graph" }`
- `command/delete` — no payload
- `command/duplicate` — no payload
- `command/export` — no payload

## Implementation Plan

### 1. Handle `command/show` in `src/extension/messageRouter.ts`

In `handleViewMessage`, before the `adaptViewMessage` fallback, add:

```ts
if (viewMessage.type === "command/show") {
  const commandMap: Record<ViewName, string> = {
    timeline: "vsdaw.showTimeline",
    mixer: "vsdaw.showMixer",
    pianoRoll: "vsdaw.showPianoRoll",
    browser: "vsdaw.showBrowser",
    graph: "vsdaw.showGraph",
  };
  const command = commandMap[viewMessage.view];
  if (command) {
    void vscode.commands.executeCommand(command);
  }
  return;
}
```

### 2. Handle `command/export` in `src/extension/messageRouter.ts`

```ts
if (viewMessage.type === "command/export") {
  void vscode.commands.executeCommand("vsdaw.export");
  return;
}
```

### 3. Handle `command/delete` and `command/duplicate`

These need selection-aware behavior. Route them to `ProjectManager.onViewMessage` and implement handlers there.

In `messageRouter.ts`:

```ts
if (viewMessage.type === "command/delete" || viewMessage.type === "command/duplicate") {
  this.callbacks.onViewMessage(projectId, {
    projectId,
    direction: "view-to-host",
    type: viewMessage.type,
  });
  return;
}
```

In `ProjectManager.onViewMessage`:

```ts
if (message.type === "command/delete") {
  void this.deleteSelection(projectId);
  return;
}
if (message.type === "command/duplicate") {
  void this.duplicateSelection(projectId);
  return;
}
```

Implement `deleteSelection` and `duplicateSelection`:

- If a region is selected (`session.selection.regionId`), delete/duplicate the region.
- If a track is selected (`session.selection.trackId`), delete/duplicate the track.
- If a note selection exists (`session.selection.noteIds`), delete/duplicate notes.
- Duplication should offset the cloned object by a small amount (e.g. +1 bar for regions/notes).

Add helper methods on `ProjectManager`:

- `deleteRegion(projectId, regionId)` — request engine `RegionDelete`.
- `duplicateRegion(projectId, regionId)` — get region state, create a copy at `position + 1 bar`.
- `deleteTrack(projectId, trackId)` — request engine `TrackDelete`.
- `duplicateTrack(projectId, trackId)` — create a track with the same type and name + " Copy".
- `deleteNotes(projectId, noteIds)` — request engine `NoteDelete` for each.
- `duplicateNotes(projectId, noteIds)` — get notes, create copies at `start + 1 bar`.

### 4. Wire selection state in `ProjectManager`

`ProjectManager` already receives `onViewSelection(projectId, regionId)`. Extend `ProjectSession` to store a `selection` object `{ trackId?, regionId?, noteIds?[] }` and update it from view messages. The view currently only sends region selection; note/track selection will be added later if needed.

Add `setSelection(projectId, selection)` method and use it in `onViewSelection`.

### 5. Update unit tests

- Add tests in `tests/unit/messageRouter.test.ts` for `command/show`, `command/export`, `command/delete`, `command/duplicate`.
- Add tests in `tests/unit/projectManager.test.ts` for `deleteSelection` / `duplicateSelection`.

### 6. Validate in VS Code

- Build and package the extension.
- Install the VSIX.
- Open a `.vsdaw` project.
- Click each view tab and confirm the correct panel opens/focuses.
- Select a region and press the Delete / Duplicate toolbar buttons.
- Click Export and verify the export flow opens.

## Acceptance Criteria

- [ ] Clicking Timeline / Mixer / Piano Roll / Browser / Graph in the toolbar opens or focuses the matching panel.
- [ ] Command palette commands `VSDAW: Show Mixer`, `VSDAW: Show Piano Roll`, etc. still work.
- [ ] Toolbar Delete removes the selected region/track.
- [ ] Toolbar Duplicate creates a copy of the selected region/track.
- [ ] Toolbar Export opens the export format picker.
- [ ] All unit tests pass (`bun run test`).
- [ ] VSIX installs and the above behaviors are verified in VS Code.

## Notes

- The ViewSwitcher does not replace the current panel; it opens a separate VS Code webview panel. This matches the current architecture and is acceptable for this fix.
- Native plugin hosting and audio input device routing are out of scope for this spec.
