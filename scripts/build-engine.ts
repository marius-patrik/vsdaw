import * as fs from "node:fs";
import * as path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "..");
const engineDir = path.join(root, "engine");
const sidecarBase = "singularity-engine";

function getHostPreset(): string {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "macos-arm64-release" : "macos-x64-release";
  }
  if (process.platform === "linux") {
    return "linux-x64-release";
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function parseArgs(argv: string[]): { target: string; clean: boolean } {
  let target = getHostPreset();
  let clean = false;
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if ((arg === "--target" || arg === "-t") && i + 1 < argv.length) {
      target = argv[++i];
    } else if (arg === "--clean") {
      clean = true;
    }
  }
  return { target, clean };
}

async function main() {
  const { target, clean } = parseArgs(process.argv.slice(2));
  const buildDir = path.join(engineDir, "build", target);

  if (clean && fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  console.log(`Configuring engine preset: ${target}`);
  await $`cmake --preset ${target}`.cwd(engineDir);

  console.log(`Building engine preset: ${target}`);
  await $`cmake --build --preset ${target}`.cwd(engineDir);

  const binaryName = process.platform === "win32" ? "singularity-engine.exe" : "singularity-engine";

  // JUCE places console-app binaries inside a target-specific artefacts folder.
  const artefactsDir = path.join(buildDir, `${sidecarBase}_artefacts`);
  const findBinary = (dir: string): string | null => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findBinary(full);
        if (found) return found;
      } else if (entry.name === binaryName) {
        return full;
      }
    }
    return null;
  };

  if (!fs.existsSync(artefactsDir)) {
    throw new Error(`Engine artefacts directory not found: ${artefactsDir}`);
  }

  const binaryPath = findBinary(artefactsDir);
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    throw new Error(`Engine binary not found in artefacts directory: ${artefactsDir}`);
  }

  // Normalise to a predictable top-level path for packaging/sidecars.
  const canonicalPath = path.join(buildDir, binaryName);
  fs.rmSync(canonicalPath, { force: true });
  fs.copyFileSync(binaryPath, canonicalPath);
  fs.chmodSync(canonicalPath, 0o755);

  console.log(`Engine built successfully: ${canonicalPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
