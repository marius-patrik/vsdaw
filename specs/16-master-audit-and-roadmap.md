# Spec 16: Master Audit & Roadmap

## Executive Summary

A full-code review of VSDAW v0.3.0 found the extension is **not production-ready**. While the architecture is sound, several critical bugs prevent basic workflows from working, many features are stubbed, and the UI lacks coherence. The most urgent issues are:

1. **Transport/playback state updates are broken** due to an observer that terminates immediately after subscribing.
2. **The extension requires Bun at runtime**, which is not shipped or declared.
3. **Toolbar view tabs and many toolbar actions do nothing** because their messages are dropped by the host.
4. **Export, undo, save/load, and timeline interaction** have concrete data-loss or no-op bugs.
5. **Resource leaks** (subscriptions, panels, Chrome processes) will degrade the host over time.

This document is the master roadmap. It consolidates findings from five focused audits and orders work by impact.

---

## Severity Legend

- **P0 — Broken / data loss / cannot ship.** Fix immediately.
- **P1 — Major feature missing or unreliable.** Fix before public beta.
- **P2 — Polishing, performance, architectural debt.** Fix before v1.0.

---

## P0 — Fix Before Anything Else

| # | Issue | Files | Why | Work |
|---|---|---|---|---|
| P0.1 | Transport observers terminate immediately | `src/engine/projectAdapter.ts:1395-1409` | Playhead position and transport state never update in the UI during playback. | Store subscription references and terminate only on close. |
| P0.2 | Runtime dependency on Bun | `src/extension/audioServer.ts`, `src/extension/server.ts` | The VSIX will not work on machines without Bun. | Rewrite the static/audio server using Node built-ins (`node:http`, `fs`). |
| P0.3 | Toolbar view switcher does nothing | `src/extension/messageRouter.ts:344-412`, `src/extension/projectManager.ts:489-499` | `command/show` is dropped as unsupported; tabs cannot open Mixer/Piano Roll/Browser/Graph. | Handle `command/show` and execute `vsdaw.show*`. |
| P0.4 | Export command renders empty range | `src/extension/commands.ts:219-220`, `src/extension/projectManager.ts:354-358` | `start: 0, end: 0` is passed, producing no audio. | Default to full project or prompt for range. |
| P0.5 | Timeline canvas ignores vertical scroll in hit-testing | `src/components/timeline/TimelineCanvas.tsx:322-414` | After scrolling, clicks/selects/drags hit the wrong track/region/automation lane. | Add `scrollTop` to mouse Y coordinates. |
| P0.6 | Mutable message whitelist misses note/automation/routing edits | `src/extension/projectManager.ts:1264-1302` | Piano-roll notes, automation, output/send/input-device changes bypass undo snapshots. | Add all mutation types to `MUTABLE_MESSAGE_TYPES`. |
| P0.7 | Save/load drops automation and mis-serializes fades | `src/extension/projectManager.ts:942-953`, `src/shared/schemas.ts` | Automation lanes/points are not persisted; fade objects are flattened to defaults. | Serialize full `ProjectState` into `ProjectJson` and back. |
| P0.8 | Load never re-imports audio samples | `src/extension/projectManager.ts:714-740` | Audio regions reference samples the engine cannot find after load. | Re-import `session.audioFiles` into engine after load. |
| P0.9 | Request/response mismatch hangs forever | `src/extension/messageRouter.ts:328-333` | If `responseType` does not match, the pending promise is never resolved or rejected. | Reject with a `ProtocolError`. |
| P0.10 | Engine message payloads are not validated | `src/engine/messageHandlers.ts` | Handlers cast with `as`; malformed messages crash or corrupt state. | Add per-message Zod schemas and validate before casting. |
| P0.11 | Resource leaks in session lifecycle | `src/extension/projectManager.ts:154-225` | Listeners are dropped into a temporary array that is cleared; never disposed. | Use a per-session `DisposableStore`. |
| P0.12 | Project dirty on transport-only messages | `src/extension/projectManager.ts:489-499` | Play/seek/etc. schedule auto-save and show the save dot. | Move dirty marking out of `onViewMessage` or whitelist only mutations. |

## P1 — Major Missing / Broken Functionality

| # | Issue | Files | Work |
|---|---|---|---|
| P1.1 | Toolbar Delete / Duplicate / Export unimplemented | `src/extension/messageRouter.ts`, `src/extension/projectManager.ts` | Implement `command/delete`, `command/duplicate`, `command/export` mappings and selection-aware actions. |
| P1.2 | Track routing/sends/input-device are UI-only stubs | `src/engine/projectAdapter.ts:411-464` | Either wire to OpenDAW SDK graph or disable the controls. |
| P1.3 | Plugin hosting is a stub | `src/engine/projectAdapter.ts:435-464`, `src/components/browser/BrowserTree.tsx` | Implement real scanning or hide Plugins folder. |
| P1.4 | Piano Roll active tab highlight broken | `src/components/shared/Toolbar.tsx:129` | Pass actual `ViewName` instead of lower-cased label. |
| P1.5 | Piano Roll note/velocity drag floods host | `src/components/pianoRoll/PianoRollGrid.tsx`, `VelocityLane.tsx` | Use optimistic local drag state; flush final value on mouseup. |
| P1.6 | Timeline loop markers hard-coded | `src/views/timeline/main.tsx:183-184` | Read loop bounds from `state.transport`. |
| P1.7 | Master mixer strip non-functional | `src/views/mixer/main.tsx:128-137` | Wire to primary bus or hide controls. |
| P1.8 | Graph view disconnected | `src/views/graph/main.tsx` | Project routing state or mark placeholder. |
| P1.9 | Browser drag-and-drop does nothing | `src/components/browser/BrowserTree.tsx` | Implement `dataTransfer` and host drop handler. |
| P1.10 | `@ffmpeg/ffmpeg` is a devDependency | `package.json` | Move to dependencies or disable non-WAV export. |
| P1.11 | Chrome launched with insecure sandbox flags and `killAll()` | `src/extension/playwrightEngine.ts` | Use safer defaults, isolate process, kill only our PID. |
| P1.12 | MessageRouter request IDs collide | `src/extension/messageRouter.ts:209` | Use `crypto.randomUUID()`. |
| P1.13 | Concurrent mutable messages race on undo snapshot | `src/extension/messageRouter.ts:433-439`, `projectManager.ts:501-533` | Serialize per-session command processing. |
| P1.14 | Audio server crash not detected | `src/extension/audioServer.ts` | Add process exit listener and reset state. |

## P2 — Architecture, Performance, UI Coherence

| # | Issue | Work |
|---|---|---|
| P2.1 | Full state broadcast on every update | Implement incremental/delta state projection or batching. |
| P2.2 | No design system / inline styles everywhere | Create token file + primitive components (`Button`, `Input`, `Slider`, `Select`). |
| P2.3 | Views duplicated vendor bundles | Use esbuild code splitting / shared chunk. |
| P2.4 | View providers are copy-paste classes | Introduce base `VsdawWebviewProvider`. |
| P2.5 | `resolveRegion`/`resolveNote`/`resolveDevice` linear scans | Maintain UUID indices. |
| P2.6 | Engine uses wildcard `postMessage` target origin | Restrict to `serverOrigin`. |
| P2.7 | Custom editor backup incomplete | Write full bundle to backup location. |
| P2.8 | Missing runtime validation of view messages | Add `ViewMessageSchema`. |
| P2.9 | `deviceParametersById` grows unbounded | Prune on device removal. |
| P2.10 | Error state in views never cleared | Auto-clear or add dismiss. |
| P2.11 | Hardcoded 960 PPQN in multiple places | Use `DEFAULT_PPQN` everywhere. |
| P2.12 | Console logs and debug statements in production code | Replace with output-channel logging or remove. |

---

## Proposed Implementation Order

### Sprint A — “It Actually Runs”
1. Fix transport observers (P0.1).
2. Replace Bun server with Node server (P0.2).
3. Fix export empty range (P0.4).
4. Fix view tab switching (P0.3).
5. Fix timeline vertical-scroll hit-testing (P0.5).
6. Fix request hang on type mismatch (P0.9).
7. Add runtime payload validation for engine handlers (P0.10).
8. Fix session disposable leaks (P0.11).
9. Stop marking transport messages dirty (P0.12).

### Sprint B — “Edit Without Losing Work”
1. Complete mutable-message whitelist (P0.6).
2. Persist automation, fades, routing, sends, input devices in save/load (P0.7).
3. Re-import audio on load (P0.8).
4. Implement toolbar Delete / Duplicate / Export (P1.1).
5. Fix Piano Roll active tab (P1.4) and drag flooding (P1.5).

### Sprint C — “Features That Aren’t Lies”
1. Either implement or disable routing/sends/input-device controls (P1.2).
2. Either implement or disable plugin hosting (P1.3).
3. Wire master mixer strip or hide it (P1.7).
4. Wire graph view or mark placeholder (P1.8).
5. Implement browser drag-and-drop (P1.9).
6. Fix non-WAV export or disable it (P1.10, P1.11).

### Sprint D — “Polish”
1. Design system + primitive components (P2.2).
2. Incremental state projection (P2.1).
3. Shared view bundle chunk (P2.3).
4. UI redesign pass for TrackHeader, MixerStrip, TimelineCanvas (Spec 15).

---

## Acceptance Criteria for Roadmap Completion

- [ ] A fresh VSIX installs in VS Code and opens a project without Bun installed.
- [ ] Playhead moves during playback and transport state updates in all open views.
- [ ] Toolbar tabs open Mixer, Piano Roll, Browser, and Graph.
- [ ] Export produces a non-empty audio file.
- [ ] Undo/redo covers note editing, automation, track routing, region moves.
- [ ] Save/load preserves automation, fades, routing, sends, and audio regions.
- [ ] Timeline canvas hit-tests correctly after vertical scrolling.
- [ ] No known resource leaks after opening/closing multiple projects.
- [ ] All unit tests pass.
