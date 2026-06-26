import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reviewDir = path.join(root, "reviews");
const stateFile = path.join(reviewDir, ".reviewed-shas.json");

function readReviewed() {
  try {
    return new Set(JSON.parse(fs.readFileSync(stateFile, "utf8")));
  } catch {
    return new Set();
  }
}

function writeReviewed(set) {
  fs.writeFileSync(stateFile, JSON.stringify([...set], null, 2));
}

function getBranches() {
  const out = execSync("git branch --format='%(refname:short)'", { cwd: root, encoding: "utf8" });
  return out.split("\n").filter((b) => b.startsWith("issue/") && b.endsWith("-feature"));
}

function getNewCommits(branch, reviewed) {
  const out = execSync(`git rev-list --reverse main..${branch}`, { cwd: root, encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((sha) => !reviewed.has(sha));
}

function reviewCommit(sha, branch) {
  const short = sha.slice(0, 7);
  const outFile = path.join(reviewDir, `${branch.replace(/\//g, "-")}-${short}.md`);
  console.log(`[review] ${branch} ${short} -> ${outFile}`);
  try {
    const output = execSync(`codex review --commit ${sha}`, {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
    });
    fs.writeFileSync(outFile, output);
  } catch (error) {
    fs.writeFileSync(
      outFile,
      `Review failed for ${short}:\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function loop() {
  const reviewed = readReviewed();
  for (const branch of getBranches()) {
    for (const sha of getNewCommits(branch, reviewed)) {
      reviewCommit(sha, branch);
      reviewed.add(sha);
    }
  }
  writeReviewed(reviewed);
}

console.log("[review-watcher] starting");
fs.mkdirSync(reviewDir, { recursive: true });
loop();
setInterval(loop, 30000);
