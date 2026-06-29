import * as fs from "node:fs";
import * as path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "..");
const engineDir = path.join(root, "engine");
const engineBuildDir = path.join(engineDir, "build");
const desktopTauriDir = path.join(root, "packages", "desktop", "src-tauri");
const sidecarDir = path.join(desktopTauriDir, "sidecars");
const sidecarBase = "singularity-engine";

function getTargetTriple(): string {
  const platform = process.platform;
  const arch = process.arch;

  const triples: Record<string, Record<string, string>> = {
    darwin: {
      x64: "x86_64-apple-darwin",
      arm64: "aarch64-apple-darwin",
    },
    linux: {
      x64: "x86_64-unknown-linux-gnu",
      arm64: "aarch64-unknown-linux-gnu",
    },
    win32: {
      x64: "x86_64-pc-windows-msvc",
      arm64: "aarch64-pc-windows-msvc",
    },
  };

  const platformMap = triples[platform];
  if (!platformMap) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const triple = platformMap[arch];
  if (!triple) {
    throw new Error(`Unsupported architecture: ${arch} on ${platform}`);
  }

  return triple;
}

async function buildEngine() {
  console.log("Building engine sidecar...");
  await $`cmake -S ${engineDir} -B ${engineBuildDir}`.cwd(root);
  await $`cmake --build ${engineBuildDir}`.cwd(root);
}

async function copySidecar() {
  console.log("Copying engine sidecar into Tauri sidecars directory...");
  fs.mkdirSync(sidecarDir, { recursive: true });

  const source = path.join(engineBuildDir, sidecarBase);
  if (!fs.existsSync(source)) {
    throw new Error(`Engine binary not found: ${source}`);
  }

  const baseDest = path.join(sidecarDir, sidecarBase);
  fs.copyFileSync(source, baseDest);
  fs.chmodSync(baseDest, 0o755);
  console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, baseDest)}`);

  const targetTriple = getTargetTriple();
  const targetDest = path.join(sidecarDir, `${sidecarBase}-${targetTriple}`);
  fs.copyFileSync(source, targetDest);
  fs.chmodSync(targetDest, 0o755);
  console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, targetDest)}`);
}

async function buildDesktop() {
  await buildEngine();
  await copySidecar();
  console.log("Building desktop with Tauri...");
  await $`bun run --filter @singularity/desktop tauri build --bundles app`.cwd(root);
}

const target = process.argv[2];
if (target === "desktop") {
  await buildDesktop();
} else {
  console.error("Usage: bun run scripts/build.ts desktop");
  process.exit(1);
}
