# Singularity

A full-featured digital audio workstation and creative IDE.

> **License:** AGPL-3.0-or-later

Singularity is a standalone DAW built for FL Studio / OpenDAW Studio parity, with integrated AI agents, a code editor, terminal, and browser tabs.

## Features

- Standalone desktop app (Tauri) and web app sharing the same React UI.
- JUCE-based native audio engine hosting VST3, AU, CLAP, LV2, and AAX plugins.
- FL Studio-style workflow: Channel Rack, Piano Roll, Playlist, Mixer, Browser, and Patcher-style routing graph.
- Stock open-source instruments and effects: sampler, subtractive synth, drum machine, SoundFont player, and built-in effects.
- Edison-style audio recording and editing.
- Full MIDI support, MIDI learn, and typing keyboard to piano.
- `.singularity` project bundles containing audio, video, images, code, plugin states, and agent sessions.
- AI agent integration with generic skill format, CLI, MCP server, terminal, browser, and Monaco IDE tabs.
- VS Code theme-based app theming.
- macOS, Linux, and web app hard targets; Windows opportunistic.

## Development

Singularity is developed with [Bun](https://bun.sh/). Make sure Bun is installed, then run:

```bash
bun install
bun run build
bun run test
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
