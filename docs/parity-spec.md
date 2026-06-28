# Singularity v1.0 FL Studio / OpenDAW Parity Spec — APPROVED

This document defines what "full 1:1 FL Studio parity" means for Singularity v1.0. All items below have been approved by the user. Anything not listed here is out of scope for v1.0 unless a new decision is recorded.

## Approved foundational stack

- Build target: standalone DAW with desktop (Tauri) + web + VS Code embedder.
- Frontend build: Rsbuild, React, TypeScript, Zustand, Tailwind + CSS custom properties.
- Audio engine: JUCE C++ native backend packaged as a Tauri sidecar.
- Project format: native `.singularity` ZIP bundle; FLP import as a secondary migration feature.
- AI agent integration: generic skill format, CLI, MCP server (stdio + SSE), plugin wrapper, integrated xterm.js terminal.
- Plugin hosting: in-process JUCE hosting.
- Supported plugin formats: VST3, AU, CLAP, LV2, AAX at launch.
- Plugin editor UI: embedded in app by default, optional pop-out floating window.
- Audio thread: single realtime callback with lock-free queues.
- Project model: FL Studio-style Channel Rack + Patterns + Playlist.
- Time representation: ticks (PPQN), seconds, and bars/beats/ticks with sample-accurate offsets.
- Canvas rendering: HTML5 Canvas for timeline, piano roll, mixer, routing graph.
- Stock plugins: full open-source equivalents (sampler, synth, drum machine, SoundFont player, 8+ effects).
- Creative AI tools: stem separation, chord progression tool, loop starter in v1.0.
- Audio recording: full Edison-style recording and editing.
- Routing: full Patcher-style modular graph + mixer sends/buses/sidechain.
- AI agent: full project context and ability to drive any feature.
- MIDI: full support (device selection, typing keyboard, MIDI learn, remote control, import/export).
- Export: WAV/FLAC/OGG/MP3 + split mixer tracks/stem export + AI mastering via agent.
- UI: dockable panels and detachable multi-monitor windows.
- Browser: file browser, plugin database/scanner/picker, preset browser.
- Testing: unit + integration + E2E tests, separate reviewer agent per PR.
- Platforms: macOS (Intel + Apple Silicon), Linux x64, web app, VS Code embedder. Windows included if low-effort.
- Embedded browser tab: full navigation, tabs, and agent control via headless browser + webview.
- Cloud content: generic connector for sample libraries (Splice, Loopcloud, etc.).
- Distribution: not in v1.0.
- Video playback with audio sync.
- Auto-updater for desktop builds.
- No ReWire, no 32-bit plugin bridge, no distribution integration.

---

## 1. Channel Rack / Step Sequencer

- [x] 64/128/256-channel rack with vertical channel strips.
- [x] Step sequencer grid (16/32/64 steps per pattern) with velocity-sensitive steps.
- [x] Per-channel: mute, solo, pan, volume, pitch, channel settings button.
- [x] Channel groups / colors / zip-unzip compact view.
- [x] Clone, delete, reorder channels (drag up/down).
- [x] Channel types: Sampler, VST instrument, Audio clip, Layer, MIDI Out.
- [x] Load samples by drag-and-drop from Browser onto channel.
- [x] Channel settings window: envelope, filter, pitch/time stretching, polyphony.

## 2. Piano Roll

- [x] Note grid with piano keyboard sidebar and octave labels.
- [x] Tools: draw (pencil), paint, brush, delete, mute, slip, slice, select, zoom, playback.
- [x] Note operations: add, move, resize, duplicate, quantize, quick quantize, legato, strum.
- [x] Velocity lane, per-note velocity editing.
- [x] CC lanes (mod wheel, pitch bend, expression, custom CCs) with freehand/line drawing.
- [x] Scale highlighting and chord stamp tools.
- [x] Note grouping, color, and naming.
- [x] Ghost notes (show other channels/patterns faintly).
- [x] Piano roll scripting / tool extensions (load custom scripts).
- [x] Riff machine / arpeggiator / chord progression helpers.

## 3. Playlist (Arrangement)

- [x] Track lanes for audio clips, MIDI/pattern clips, automation clips.
- [x] Tools: draw, paint, delete, mute, slip, slice, select, zoom, playback.
- [x] Snap modes: off, 1/4 beat, 1/2 beat, beat, bar, and sample-accurate.
- [x] Clip operations: copy/paste/duplicate, make unique, group, color, rename, loop, stretch.
- [x] Non-destructive clip fades (drag top corners).
- [x] Audio waveform thumbnails on clips.
- [x] MIDI note preview on clips.
- [x] Automation clips with editable breakpoints and curves.
- [x] Track headers with mute/solo/record arm, volume/pan, input/output routing.
- [x] Time ruler with bar/beat markers, zoom, playhead scrub.
- [x] Video track with frame-accurate audio sync.

## 4. Mixer

- [x] Vertical channel strips (inserts) with fader, pan, mute, solo, record arm.
- [x] Real-time level meters (peak + RMS, green/yellow/red).
- [x] Per-insert effect slots (10 slots) with drag-and-drop plugin loading.
- [x] Send/return tracks and buses.
- [x] Sidechain input routing per effect.
- [x] Master insert on the far right.
- [x] Reorder mixer inserts by dragging strips.
- [x] Insert grouping and coloring.
- [x] Quick link to plugin parameter automation.

## 5. Browser

- [x] File browser for samples, MIDI, projects, presets.
- [x] Plugin database with searchable VST/VST3/AU/CLAP/LV2/AAX instruments and effects.
- [x] Plugin picker view (grid of plugin icons).
- [x] Favorites, recent files, quick-jump locations.
- [x] Preset browser for plugins and stock devices.
- [x] Drag-and-drop from browser to Channel Rack, Mixer, Playlist.
- [x] Cloud content / sample library connector (Splice, Loopcloud, etc.).

## 6. Plugin Hosting & Database

- [x] Plugin scanner with custom scan paths and blacklist.
- [x] Plugin state save/load within project.
- [x] Preset save/load for each plugin.
- [x] Plugin delay compensation (PDC).
- [x] Freeze/render tracks with plugins.
- [x] Bypass and remove plugins from effect chain.
- [x] 64-bit plugins only (no 32-bit bridge).

## 7. Stock Instruments & Effects

- [x] Sampler channel with envelope, filter, loop points, time stretch, pitch shift.
- [x] Subtractive synthesizer (open-source equivalent to 3xOsc/FLEX-lite).
- [x] Drum sampler / drum machine (FPC-like).
- [x] SoundFont player.
- [x] Built-in effects: reverb, delay, EQ, compressor, chorus, phaser, limiter, filter, distortion.
- [x] Modular patcher / rack for chaining instruments/effects visually.
- [ ] Proprietary FL plugins (Sytrus, Harmor, FLEX full, Gross Beat) — cannot ship; users load as third-party VSTs if owned.

## 8. Audio Recording & Editing

- [x] Audio input selection and record arm per mixer insert.
- [x] Recording with metronome precount and start-on-input.
- [x] Loop recording and multiple takes.
- [x] Waveform editor (Edison-like): cut, copy, paste, fade, normalize, reverse, pitch/time stretch, noise removal.
- [x] Non-destructive clip editing in Playlist.
- [x] Sample-accurate audio clip splitting.

## 9. Automation

- [x] Automation clips in Playlist (independent lanes).
- [x] Per-parameter event editor (event automation inside patterns).
- [x] Breakpoint editing: add, move, delete, curve shapes (linear, smooth, hold).
- [x] Freehand drawing of automation curves.
- [x] Link to controller / MIDI learn for any automatable parameter.
- [x] LFO tool for automation generation.
- [x] Tempo automation and time signature changes.

## 10. Routing & Graph

- [x] Per-channel output routing (to master, bus, or another insert).
- [x] Send/return buses with configurable send levels.
- [x] Sidechain routing for compressors/gates.
- [x] Visual routing graph (node-based) with cables and drag connections.
- [x] Patcher-like modular environment for advanced chains.

## 11. Transport & Playback

- [x] Play, stop, pause, record, loop, song/pattern mode.
- [x] Metronome with accent on bar, precount, and customizable click sound.
- [x] BPM and time signature display/controls.
- [x] Start-on-input, blend recorded notes, step edit.
- [x] Punch-in / punch-out recording.
- [x] Playhead scrub via ruler.
- [x] Video playback with audio sync.

## 12. MIDI

- [x] MIDI input/output device enumeration and selection.
- [x] Typing keyboard to piano (Ctrl+T toggle).
- [x] MIDI learn for parameters and transport controls.
- [x] Multi-link to controllers.
- [x] MIDI scripting / remote control surface support.
- [x] MIDI file import/export.
- [x] Score logger: buffer last few minutes of MIDI input and dump to pattern.

## 13. Export & Rendering

- [x] Export formats: WAV (16/24/32-bit float), FLAC (16/24), OGG Vorbis (quality 0-10), MP3.
- [x] Sample rates: 44.1, 48, 88.2, 96 kHz.
- [x] Export range: project, selection, loop region.
- [x] Split mixer tracks / stem export.
- [x] Normalize and dither options.
- [x] Real-time export option for plugins that require it.
- [x] Progress bar with cancel.
- [x] AI mastering via agent using full project context and skills.
- [ ] Distribution service integration (out of scope).

## 14. Project Format & Persistence

- [x] Native `.singularity` ZIP bundle containing project JSON, audio assets, plugin states, thumbnails.
- [x] Autosave and crash recovery.
- [x] Recent projects, templates, and startup screen.
- [x] FLP import (best-effort, secondary priority).
- [x] MIDI file export of patterns / full project.
- [x] Stem export / track bouncing.

## 15. Settings & Audio Configuration

- [x] Audio device/driver selection (ASIO on Windows, CoreAudio on macOS, ALSA/JACK on Linux, WASAPI fallback).
- [x] Sample rate and buffer size with reported latency.
- [x] MIDI device settings.
- [x] File paths, plugin scan paths, default template.
- [x] General settings: undo history size, autosave interval, UI scaling, language.

## 16. UI Customization

- [x] Theme system based on VS Code theme JSON files.
- [x] Map VS Code theme tokens to app design tokens and Monaco styling.
- [x] Ship with curated VS Code themes (Dark+, Light+, popular community themes).
- [x] Allow users to import any VS Code theme file.
- [x] Dockable panels and detachable multi-monitor windows.
- [x] Custom layouts save/load.
- [x] UI scaling (75%, 100%, 125%, 150%, 200%).
- [x] Toolbar customization.
- [x] Hint panel / status bar.

## 17. Keyboard Shortcuts

- [x] FL Studio-compatible default shortcuts (F5 Playlist, F6 Channel Rack, F7 Piano Roll, F8 Browser, F9 Mixer, etc.).
- [x] Rebindable shortcuts with conflict detection.
- [x] Single-key tool switching in editors (P/B/D/T/C/E/Z/Y).

## 18. AI Agent Integration

- [x] Integrated terminal/chat panel with xterm.js.
- [x] Multiple terminal sessions openable as tabs.
- [x] Generic skill format compatible with Claude/Codex tool definitions.
- [x] CLI tool for agent interaction.
- [x] MCP server exposing project/audio context (stdio + SSE).
- [x] Plugin wrapper so agents can be packaged and reused.
- [x] Embedded browser tab with navigation, tabs, and full agent control.
- [x] Agent can open URLs, read page content, click/type/fill forms, download files, and import into project.
- [x] Monaco code editor tab with file explorer sidebar (IDE functionality).
- [x] Agent can read/write files through Monaco.
- [x] Built-in agent skills: add tracks, load plugins, create patterns, quantize, export, analyze mix.
- [x] Persistent chat sessions saved alongside project.
- [x] Agent permission model: full permissions with user confirmation for destructive actions.

## 19. Advanced FL Studio Features

- [x] Stem separation (AI-powered split into vocals/drums/bass/other).
- [x] Chord progression tool (AI or rule-based).
- [x] Loop starter / idea generator.
- [x] Cloud content / sample library connector (third-party, not FL Cloud).
- [x] AI mastering via agent.
- [ ] Distribution service integration (out of scope).
- [x] Video playback / scoring.
- [ ] ReWire support (out of scope, deprecated).

## 20. Platforms & Distribution

- [ ] Windows 10/11 native build (opportunistic, not a blocker).
- [x] macOS Intel + Apple Silicon native build.
- [x] Linux x64 build.
- [x] Web app build (limited to web audio when native backend unavailable).
- [x] VS Code extension embeds the web UI in a single webview tab.
- [x] Auto-updater for desktop builds.

## 21. Quality & Testing

- [x] TypeScript strict mode across all packages.
- [x] Biome lint/format for TypeScript.
- [x] C++ formatting/lint (clang-format, clang-tidy).
- [x] Unit tests for shared logic, engine model, message schemas.
- [x] Integration tests for backend API.
- [x] E2E tests for critical user flows (create project, add channel, export).
- [x] Separate reviewer agent for every PR.
- [x] No stubs/MVPs/placeholders merged into the integration branch.

---

## Out of scope for v1.0

- Proprietary FL Studio plugins (Sytrus, Harmor, FLEX full, Gross Beat) — users load as third-party VSTs if owned.
- Distribution service integration (DistroKid-style).
- ReWire support.
- 32-bit plugin bridge.
- Windows 10/11 as a hard release blocker (builds are opportunistic).

## Next step

Implementation specs and GitHub issues. Every feature area above becomes one or more specs; every spec becomes one or more issues. The integration branch is `integration/fl-studio-rewrite`.
