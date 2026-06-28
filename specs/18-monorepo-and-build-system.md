# Spec 18: Monorepo and Build System

## Objective

Define the monorepo workspace structure, build orchestration, continuous integration, code-quality automation, versioning, and release pipeline for Singularity v1.0.

## Motivation

Singularity v1.0 is a multi-layer product: shared TypeScript libraries, Rsbuild+React UI packages, a Bun/Fastify backend, a CLI, an MCP server, a Tauri v2 desktop shell, and a JUCE C++ audio engine. Without a single, deterministic build system that can compile, lint, test, package, and release every layer on every supported platform, no downstream feature spec can be considered shippable. This spec turns the architecture from Spec 17 into an executable toolchain.

## Scope

### In scope

- Bun workspace layout, root manifest, and per-package manifests.
- Build scripts for all TypeScript packages, the web app, the engine, and the desktop app.
- Type checking (`tsc --noEmit`) in strict mode for all TypeScript packages.
- Lint/format automation with Biome for TypeScript and `clang-format`/`clang-tidy` for C++.
- Test runner wiring: Jest for TypeScript unit/integration tests, CTest for C++ engine tests, Playwright for E2E tests.
- Engine sidecar discovery, build, and bundling into the Tauri desktop app.
- Cross-platform CI pipeline for macOS Intel, macOS Apple Silicon, Linux x64, and opportunistic Windows x64.
- Release pipeline using `standard-version`, Git tags, changelogs, and Tauri auto-updater metadata.
- Caching strategy for dependencies, engine objects, and Tauri targets.

### Out of scope

- DAW feature implementation in any package (covered by Specs 19–35).
- JUCE engine DSP internals (covered by Spec 20).
- Panel UI designs and canvas rendering behavior (covered by Specs 26–30).
- AI agent skill definitions and runtime (covered by Spec 35).
- VS Code extension (dropped from v1.0; see `docs/decisions.md`).
- Distribution service integration (out of scope for v1.0).

## Related decisions

All `docs/decisions.md` entries from 2026-06-25, especially:

- Pivot to standalone FL Studio parity.
- Bun workspaces as the monorepo/package manager.
- Rsbuild + `@rsbuild/plugin-react` for frontend builds.
- React 19, Zustand, Tailwind CSS, TypeScript 5.x strict mode.
- Tauri v2 desktop shell.
- JUCE 8 C++ audio engine built with CMake.
- Fastify + `@fastify/websocket` backend.
- `.singularity` native project format.
- macOS (Intel + Apple Silicon), Linux x64, and web as hard targets; Windows 10/11 opportunistic.
- No stubs/MVPs/placeholders merged into `integration/fl-studio-rewrite`.
- `standard-version` for versioning.
- VS Code extension dropped from v1.0.

## Detailed design

### Monorepo layout

The repo root is `/Users/user/Projects/vsdaw` (to be renamed to `singularity` when implementation begins). All paths below are relative to the repo root.

```
singularity/
├── bun.lockb
├── package.json
├── biome.json
├── .clang-format
├── .clang-tidy
├── tsconfig.json
├── scripts/
│   ├── build.ts
│   ├── test.ts
│   ├── check.ts
│   └── ci/
│       ├── build-engine.sh
│       └── bundle-sidecar.sh
├── packages/
│   ├── shared/          # Zod schemas, types, constants, pure utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── jest.config.js
│   │   └── src/index.ts
│   ├── ui/              # React components, Dockview panels, design system
│   │   ├── package.json
│   │   ├── rsbuild.config.ts
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── web/             # Web app entry (Rsbuild)
│   │   ├── package.json
│   │   ├── rsbuild.config.ts
│   │   ├── tsconfig.json
│   │   └── src/index.tsx
│   ├── backend/         # Bun/Fastify backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── jest.config.js
│   │   └── src/index.ts
│   ├── cli/             # Agent CLI tool
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── mcp/             # MCP server (stdio + SSE)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── desktop/         # Tauri v2 desktop shell
│       ├── package.json
│       ├── tsconfig.json
│       ├── tauri.conf.json
│       └── src-tauri/
│           ├── Cargo.toml
│           ├── tauri.conf.json
│           └── sidecars/
├── engine/              # JUCE C++ audio engine (CMake)
│   ├── CMakeLists.txt
│   ├── CMakePresets.json
│   ├── .clang-format
│   ├── .clang-tidy
│   └── src/
│       ├── main.cpp
│       └── tests/
└── docs/
    ├── parity-spec.md
    ├── architecture.md
    ├── decisions.md
    └── specs/
```

### Package manifest conventions

Root `package.json`:

```json
{
  "name": "singularity",
  "private": true,
  "version": "1.0.0",
  "workspaces": ["packages/*"],
  "packageManager": "bun@1.1.0",
  "scripts": {
    "build": "bun run scripts/build.ts",
    "build:web": "bun run scripts/build.ts --package web",
    "build:desktop": "bun run scripts/build.ts --package desktop",
    "build:engine": "bun run scripts/build.ts --package engine",
    "typecheck": "bun run scripts/check.ts --typecheck",
    "lint": "bun run scripts/check.ts --lint",
    "format:check": "bun run scripts/check.ts --format-check",
    "format": "biome format --write",
    "test": "bun run scripts/test.ts",
    "test:unit": "bun run scripts/test.ts --unit",
    "test:integration": "bun run scripts/test.ts --integration",
    "test:e2e": "bun run scripts/test.ts --e2e",
    "version": "standard-version",
    "postversion": "bun run scripts/sync-versions.ts"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.8.0",
    "@types/bun": "^1.1.0",
    "standard-version": "^9.5.0",
    "typescript": "^5.5.0"
  }
}
```

Every package under `packages/*` uses the scoped name `@singularity/<dir>` (e.g. `@singularity/shared`, `@singularity/backend`). All package `version` fields are kept in sync with the root `version` by `scripts/sync-versions.ts`.

### Build orchestration

`scripts/build.ts` is the single entry point for all builds.

```ts
// scripts/build.ts
export interface BuildOptions {
  package?: string;                // e.g. "web", "desktop", "engine", "backend"
  mode: 'development' | 'production';
  watch?: boolean;
}

export interface EngineTarget {
  os: 'macos' | 'linux' | 'windows';
  arch: 'x86_64' | 'aarch64';
  buildType: 'Debug' | 'Release';
}

export interface DesktopBuildOptions {
  mode: 'development' | 'production';
  targetTriple?: string;           // e.g. "aarch64-apple-darwin"
}

export async function buildAll(options: Pick<BuildOptions, 'mode'>): Promise<void>;
export async function buildPackage(name: string, options: BuildOptions): Promise<void>;
export async function buildEngine(target: EngineTarget): Promise<string>; // returns path to built binary
export async function copyEngineSidecar(
  engineBinaryPath: string,
  desktopSidecarDir: string,
  targetTriple: string
): Promise<string>;
export async function buildDesktop(options: DesktopBuildOptions): Promise<string>; // returns installer path
```

Behavior:

1. `buildPackage` reads the package manifest, runs `tsc --noEmit` (for libraries) or the configured build tool (Rsbuild for `web`/`ui`, Tauri CLI for `desktop`, `bun build`/`tsc` for `backend`/`cli`/`mcp`).
2. `buildEngine` invokes CMake with the preset matching `target.os-target.arch` and builds the `singularity-engine` executable to `engine/build/<os>-<arch>/<buildType>/singularity-engine[.exe]`.
3. `copyEngineSidecar` renames the engine binary to `singularity-engine-<target-triple>[.exe]` and copies it into `packages/desktop/src-tauri/sidecars/` so Tauri bundles it as a sidecar.
4. `buildDesktop` runs `copyEngineSidecar` for the current host triple, then invokes `tauri build` (or `tauri dev` in development mode).

### TypeScript packages build

| Package | Tool | Output | Consumer |
|---|---|---|---|
| `packages/shared` | `tsc` | `packages/shared/dist/` | All TS packages |
| `packages/ui` | `tsc` (library) + Rsbuild (dev server) | `packages/ui/dist/` | `packages/web`, `packages/desktop` |
| `packages/web` | Rsbuild | `packages/web/dist/` | Served by backend/CDN |
| `packages/backend` | `tsc` + `bun run src/index.ts` | `packages/backend/dist/` | Desktop sidecar, web server |
| `packages/cli` | `tsc` + shebang bin | `packages/cli/dist/index.js` | CLI users |
| `packages/mcp` | `tsc` | `packages/mcp/dist/index.js` | MCP clients |

Each `rsbuild.config.ts` must include `@rsbuild/plugin-react`, source maps in development, and production asset hashing. Each `tsconfig.json` must extend the root `tsconfig.json` and enable `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `esModuleInterop: true`, `moduleResolution: "bundler"`, and `target: "ES2022"`.

### Engine build

`engine/CMakeLists.txt` defines the `singularity-engine` target and links JUCE 8. `engine/CMakePresets.json` provides presets:

- `macos-x86_64-release`
- `macos-arm64-release`
- `linux-x64-release`
- `windows-x64-release`
- `macos-arm64-debug`
- `linux-x64-debug`

The build script selects a preset by combining `os`, `arch`, and `buildType`. JUCE is expected as a Git submodule at `engine/third_party/JUCE` or resolved by the `JUCE_ROOT` environment variable.

Engine binary naming convention for sidecars:

```
singularity-engine-aarch64-apple-darwin
singularity-engine-x86_64-apple-darwin
singularity-engine-x86_64-unknown-linux-gnu
singularity-engine-x86_64-pc-windows-msvc.exe
```

### Desktop build and sidecar bundling

`packages/desktop/src-tauri/tauri.conf.json` registers the engine as a sidecar:

```json
{
  "bundle": {
    "externalBin": ["sidecars/singularity-engine"]
  }
}
```

Before `tauri build`, `scripts/build.ts` copies the engine binary for the host target into `packages/desktop/src-tauri/sidecars/singularity-engine-<target-triple>` (with `.exe` on Windows). Tauri bundles it automatically.

### Quality gates

`scripts/check.ts` runs the following in sequence and exits non-zero on the first failure:

```ts
// scripts/check.ts
export interface CheckOptions {
  typecheck?: boolean;
  lint?: boolean;
  formatCheck?: boolean;
  cpp?: boolean;
}

export async function runChecks(options: CheckOptions): Promise<CheckReport>;

export interface CheckReport {
  typecheck: CheckResult;
  lint: CheckResult;
  format: CheckResult;
  cpp: CheckResult;
}

export interface CheckResult {
  passed: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

Commands:

- TypeScript type check: `tsc --noEmit -p packages/<name>/tsconfig.json` for every TS package.
- Lint: `biome lint packages/*/src scripts/*`.
- Format check: `biome format --check packages/*/src scripts/*`.
- C++ format check: `clang-format --dry-run --Werror engine/src/**/*.cpp engine/src/**/*.h`.
- C++ lint: `clang-tidy -p engine/build/<preset> engine/src/**/*.cpp`.

`biome.json`, `.clang-format`, and `.clang-tidy` live at the repo root and apply to all relevant files.

### Testing

`scripts/test.ts` dispatches to the correct runner per package:

```ts
// scripts/test.ts
export interface TestOptions {
  unit?: boolean;
  integration?: boolean;
  e2e?: boolean;
  package?: string;
}

export async function runTests(options: TestOptions): Promise<TestReport>;
export async function runUnitTests(packages?: string[]): Promise<void>;
export async function runIntegrationTests(packages?: string[]): Promise<void>;
export async function runEngineTests(buildDir: string): Promise<void>;
export async function runE2ETests(): Promise<void>;
```

- Unit tests: Jest + `ts-jest` in every TS package with a `jest.config.js`.
- Integration tests: Jest suites in `packages/backend/__tests__/integration/` that start the Fastify server and exercise HTTP/WebSocket endpoints.
- Engine tests: CTest invoked from the CMake build directory.
- E2E tests: Playwright tests in `e2e/` covering: launch desktop app, create project, add channel, export audio.

### CI/CD

Two GitHub Actions workflows live in `.github/workflows/`:

1. `ci.yml` — runs on every PR and push to `integration/fl-studio-rewrite`.

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [integration/fl-studio-rewrite]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.0
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run format:check
  test-ts:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.0
      - run: bun install --frozen-lockfile
      - run: bun run test:unit
      - run: bun run test:integration
  build-engine:
    strategy:
      matrix:
        include:
          - os: macos-14
            target: macos-arm64-release
          - os: macos-13
            target: macos-x86_64-release
          - os: ubuntu-22.04
            target: linux-x64-release
          - os: windows-latest
            target: windows-x64-release
    runs-on: ${{ matrix.os }}
    continue-on-error: ${{ matrix.os == 'windows-latest' }}
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.0
      - run: bun run build:engine --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: singularity-engine-${{ matrix.target }}
          path: engine/build/*/Release/singularity-engine*
  build-desktop:
    needs: build-engine
    strategy:
      matrix:
        include:
          - os: macos-14
            triple: aarch64-apple-darwin
          - os: macos-13
            triple: x86_64-apple-darwin
          - os: ubuntu-22.04
            triple: x86_64-unknown-linux-gnu
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.0
      - run: bun install --frozen-lockfile
      - uses: actions/download-artifact@v4
        with:
          name: singularity-engine-macos-arm64-release
          path: packages/desktop/src-tauri/sidecars/
        if: matrix.triple == 'aarch64-apple-darwin'
      - uses: actions/download-artifact@v4
        with:
          name: singularity-engine-macos-x86_64-release
          path: packages/desktop/src-tauri/sidecars/
        if: matrix.triple == 'x86_64-apple-darwin'
      - uses: actions/download-artifact@v4
        with:
          name: singularity-engine-linux-x64-release
          path: packages/desktop/src-tauri/sidecars/
        if: matrix.triple == 'x86_64-unknown-linux-gnu'
      - run: bun run build:desktop
      - uses: actions/upload-artifact@v4
        with:
          name: singularity-desktop-${{ matrix.triple }}
          path: packages/desktop/src-tauri/target/release/bundle/*
```

2. `release.yml` — runs on Git tags matching `v*`.

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.0
      - run: bun install --frozen-lockfile
      - run: bun run build:web
      - run: bun run version -- --sign
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          projectPath: packages/desktop
          args: --target ${{ matrix.triple }}
      - run: bun run scripts/generate-updater-json.ts
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            packages/desktop/src-tauri/target/release/bundle/**/*
            latest.json
```

### Versioning and releases

- `standard-version` bumps the root `package.json` version, updates `CHANGELOG.md`, and creates a version tag.
- `scripts/sync-versions.ts` copies the new root version into every `packages/*/package.json` and commits the result as part of the release commit.
- The desktop auto-updater metadata file `latest.json` is generated by `scripts/generate-updater-json.ts` and attached to the GitHub Release. It follows the Tauri updater JSON schema with `version`, `notes`, `pub_date`, and `platforms` entries for each desktop target.

### Environment and tooling versions

| Tool | Minimum version | Source |
|---|---|---|
| Bun | 1.1.0 | `packageManager` field |
| TypeScript | 5.5.0 | root dev dependency |
| Node compatibility | 20.x | Bun target |
| CMake | 3.28.0 | `engine/CMakeLists.txt` |
| JUCE | 8.0.0 | `engine/third_party/JUCE` submodule |
| Rust / Tauri CLI | 1.75+ / 2.0+ | `packages/desktop/src-tauri/Cargo.toml` |
| clang-format | 18 | CI image / local dev env |
| clang-tidy | 18 | CI image / local dev env |
| GCC / Clang / Xcode | platform default that supports C++20 | CMake toolchain |

## Implementation plan

1. Initialize root `package.json` with Bun workspaces, root scripts, and shared dev dependencies.
2. Create `packages/shared`, `packages/ui`, `packages/web`, `packages/backend`, `packages/cli`, `packages/mcp`, and `packages/desktop` with their manifests, `tsconfig.json` files, and empty but valid entry points.
3. Create `engine/CMakeLists.txt`, `engine/CMakePresets.json`, and a minimal `engine/src/main.cpp` that builds and exits 0.
4. Write `scripts/build.ts`, `scripts/test.ts`, `scripts/check.ts`, and `scripts/sync-versions.ts` with the function signatures above.
5. Add root config files: `biome.json`, `.clang-format`, `.clang-tidy`, `tsconfig.json`.
6. Wire the engine sidecar into `packages/desktop/src-tauri/tauri.conf.json`.
7. Add GitHub Actions workflows `ci.yml` and `release.yml`.
8. Run the full local check sequence (`bun install`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`, `bun run build`) and fix all failures before merging.
9. Cut the first `standard-version` pre-release tag to validate the release pipeline.

## Testing strategy

- **Unit tests**: every shared utility, Zod schema round-trip, and pure function in `packages/shared` has Jest coverage; backend route handlers are unit-tested with injected mocks.
- **Integration tests**: the backend is started on a random port, a WebSocket client connects, and the health endpoint returns HTTP 200; the engine binary responds to a `ping` command over the local TCP socket.
- **Build system tests**: CI itself validates that the full `bun run build` sequence succeeds on macOS Intel, macOS Apple Silicon, and Linux x64.
- **E2E tests**: Playwright launches the Tauri desktop build and asserts the app window renders the Dockview shell and the VS Code theme tokens are applied.
- **Reviewer agent gate**: every PR triggers a separate reviewer agent that checks for stubs, TODOs without issue links, and missing test coverage.

## Acceptance criteria

- [ ] `bun install --frozen-lockfile` at the repo root installs all workspace dependencies and produces a committed `bun.lockb`; no `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` exists in the repo.
- [ ] `bun run typecheck` exits 0 with no TypeScript diagnostics in strict mode across `packages/shared`, `packages/ui`, `packages/web`, `packages/backend`, `packages/cli`, and `packages/mcp`.
- [ ] `bun run lint` exits 0 with no Biome lint diagnostics across all TypeScript source files and `scripts/`.
- [ ] `bun run format:check` exits 0 with no unformatted TypeScript files.
- [ ] `clang-format --dry-run --Werror` exits 0 for every `.cpp` and `.h` file under `engine/src/`.
- [ ] `clang-tidy` exits 0 for every `.cpp` file under `engine/src/` using the compile commands database from a successful CMake build.
- [ ] `bun run test:unit` exits 0 and runs at least one Jest test in `packages/shared`, `packages/backend`, and `packages/ui`.
- [ ] `bun run test:integration` exits 0 and includes a backend health-endpoint test and a WebSocket connection test.
- [ ] `bun run test:e2e` exits 0 and runs at least one Playwright test that launches the desktop app.
- [ ] `bun run build:engine --target macos-arm64-release` produces `engine/build/macos-arm64/Release/singularity-engine`.
- [ ] `bun run build:engine --target linux-x64-release` produces `engine/build/linux-x64/Release/singularity-engine`.
- [ ] `bun run build:engine --target windows-x64-release` produces `engine/build/windows-x64/Release/singularity-engine.exe` (optional job allowed to fail in CI).
- [ ] `bun run build:web` produces `packages/web/dist/index.html` and at least one hashed `.js` and `.css` asset.
- [ ] `bun run build:desktop` produces a native installer/disk image in `packages/desktop/src-tauri/target/release/bundle/` and bundles the engine sidecar by verifying the sidecar file exists in the final bundle.
- [ ] `bun run build` executes the full production build for all packages, engine, and desktop without manual intervention and exits 0.
- [ ] `bun run version` bumps the root version, updates `CHANGELOG.md`, syncs all `packages/*/package.json` versions, and creates a Git tag with no manual file edits required.
- [ ] The `release.yml` workflow runs on version tags and publishes `latest.json` alongside desktop installer artifacts.
- [ ] The `ci.yml` workflow runs on every PR and fails the PR if any check, test, or build job fails (Windows build jobs may pass but are not blockers).
- [ ] No stub files, `TODO` comments without linked issue URLs, or intentionally skipped tests are merged into `integration/fl-studio-rewrite`.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture

## Blocks

- Spec 19: Shared Protocol and Schemas
- Spec 20: JUCE Audio Engine Foundation
- Spec 23: Backend API Server (Fastify + WebSocket + Engine Bridge)
- Spec 26–30: Core DAW Panels (Channel Rack, Piano Roll, Playlist, Mixer, Browser, Graph)
- Spec 35: AI Agent System
- Spec 25: Dockview Layout and Shell Panels

## Notes / open questions

- **Decision made:** macOS desktop releases are produced as separate Intel (`x86_64-apple-darwin`) and Apple Silicon (`aarch64-apple-darwin`) bundles. A universal binary may be added later if the CI build time is acceptable.
- **Decision made:** Windows x64 desktop builds are produced unsigned and are allowed to fail in CI because Windows is an opportunistic v1.0 target.
- **Decision made:** E2E tests use Playwright with the Tauri driver so the same browser-automation stack used by the agent feature can be reused for app-level E2E tests.
- **Decision made:** GitHub Actions is the CI/CD platform. If the repo moves to another host, the workflow files must be ported but the underlying shell commands remain the acceptance criteria.
