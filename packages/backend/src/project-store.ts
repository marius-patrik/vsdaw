import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  PROTOCOL_VERSION,
  type Project,
  type ProjectMetadataPatch,
  ProjectSchema,
} from "@singularity/shared";
import JSZip from "jszip";

export interface ProjectStoreOptions {
  dataDir: string;
}

export interface HistoryResult {
  project: Project;
  mutation: string;
}

export interface Mutation {
  type: string;
  payload: unknown;
  inverse: Mutation;
}

interface ProjectEntry {
  project: Project;
  bundlePath: string | undefined;
  undoStack: Mutation[];
  redoStack: Mutation[];
  recovered: boolean;
}

export const SINGULARITY_BUNDLE_VERSION = "1.0";

export class ProjectStore {
  private readonly projects = new Map<string, ProjectEntry>();
  private readonly dataDir: string;
  private readonly walDir: string;

  constructor(options: ProjectStoreOptions) {
    this.dataDir = options.dataDir;
    this.walDir = join(this.dataDir, "wal");
  }

  async init(): Promise<void> {
    await mkdir(this.walDir, { recursive: true });
    await this.recoverFromWal();
  }

  create(name: string): Project {
    const now = new Date().toISOString();
    const project: Project = {
      version: PROTOCOL_VERSION,
      id: randomUUID(),
      name,
      createdAt: now,
      modifiedAt: now,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      sampleRate: 48000,
      settings: { audioBufferSize: 512 },
      channelRack: { channels: [] },
      patterns: [],
      playlist: { tracks: [] },
      mixer: { inserts: [] },
      routing: { nodes: [], edges: [] },
      automationClips: [],
      assets: [],
    };
    this.projects.set(project.id, {
      project,
      bundlePath: undefined,
      undoStack: [],
      redoStack: [],
      recovered: false,
    });
    return project;
  }

  get(projectId: string): Project | undefined {
    return this.projects.get(projectId)?.project;
  }

  getEntry(projectId: string): ProjectEntry | undefined {
    return this.projects.get(projectId);
  }

  list(): { project: Project; recovered: boolean }[] {
    return Array.from(this.projects.values()).map((entry) => ({
      project: entry.project,
      recovered: entry.recovered,
    }));
  }

  updateMetadata(projectId: string, patch: ProjectMetadataPatch): Project {
    const entry = this.projects.get(projectId);
    if (!entry) {
      throw Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" });
    }
    const updated: Project = {
      ...entry.project,
      ...patch,
      modifiedAt: new Date().toISOString(),
    };
    entry.project = ProjectSchema.parse(updated);
    return entry.project;
  }

  close(projectId: string, save = false): Promise<void> {
    const entry = this.projects.get(projectId);
    if (!entry) {
      return Promise.reject(
        Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" }),
      );
    }
    if (save && entry.bundlePath) {
      return this.save(projectId, entry.bundlePath).then(() => {
        this.projects.delete(projectId);
      });
    }
    this.projects.delete(projectId);
    return Promise.resolve();
  }

  async open(bundlePath: string): Promise<Project> {
    const data = await readFile(bundlePath);
    const zip = await JSZip.loadAsync(data);
    const metaText = await zip.file("meta.json")?.async("string");
    if (!metaText) {
      throw Object.assign(new Error("Bundle missing meta.json"), { code: "ERR_BUNDLE_INVALID" });
    }
    const meta = JSON.parse(metaText) as { bundleVersion?: string };
    const major = (meta.bundleVersion ?? "1.0").split(".")[0];
    if (major !== SINGULARITY_BUNDLE_VERSION.split(".")[0]) {
      throw Object.assign(new Error("Bundle version mismatch"), {
        code: "ERR_BUNDLE_VERSION_MISMATCH",
      });
    }
    const projectText = await zip.file("project.json")?.async("string");
    if (!projectText) {
      throw Object.assign(new Error("Bundle missing project.json"), { code: "ERR_BUNDLE_INVALID" });
    }
    const parsed = JSON.parse(projectText) as unknown;
    const project = ProjectSchema.parse(parsed);
    this.projects.set(project.id, {
      project,
      bundlePath: resolve(bundlePath),
      undoStack: [],
      redoStack: [],
      recovered: false,
    });
    return project;
  }

  async save(projectId: string, bundlePath?: string): Promise<{ path: string; sizeBytes: number }> {
    const entry = this.projects.get(projectId);
    if (!entry) {
      throw Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" });
    }
    const path = bundlePath ?? entry.bundlePath;
    if (!path) {
      throw Object.assign(new Error("No bundle path provided"), {
        code: "ERR_BUNDLE_PATH_REQUIRED",
      });
    }
    const resolved = resolve(path);
    await mkdir(dirname(resolved), { recursive: true });
    const zip = new JSZip();
    zip.file(
      "meta.json",
      JSON.stringify(
        { bundleVersion: SINGULARITY_BUNDLE_VERSION, savedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    zip.file("project.json", JSON.stringify(entry.project, null, 2));
    const assets = zip.folder("assets");
    const pluginStates = zip.folder("plugin-states");
    const sessions = zip.folder("sessions");
    if (assets) {
      for (const asset of entry.project.assets) {
        // Assets are placeholders in this minimal implementation.
        const assetId = (asset as { id?: string })?.id ?? randomUUID();
        assets.file(`${assetId}.json`, JSON.stringify(asset));
      }
    }
    if (pluginStates) {
      // Plugin states are stored externally; bundle contains empty stubs.
      pluginStates.file(".gitkeep", "");
    }
    if (sessions) {
      sessions.file(".gitkeep", "");
    }
    const tmpPath = `${resolved}.tmp`;
    const content = await zip.generateAsync({ type: "uint8array" });
    await writeFile(tmpPath, content);
    await rename(tmpPath, resolved);
    entry.bundlePath = resolved;
    await this.truncateWal(projectId);
    const { size } = await stat(resolved);
    return { path: resolved, sizeBytes: size };
  }

  applyMutation(projectId: string, mutation: Mutation): Project {
    const entry = this.projects.get(projectId);
    if (!entry) {
      throw Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" });
    }
    entry.project = this.reduceMutation(entry.project, mutation);
    entry.undoStack.push(mutation);
    entry.redoStack = [];
    this.appendWal(projectId, mutation);
    return entry.project;
  }

  undo(projectId: string): HistoryResult {
    const entry = this.projects.get(projectId);
    if (!entry) {
      throw Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" });
    }
    const mutation = entry.undoStack.pop();
    if (!mutation) {
      throw Object.assign(new Error("Nothing to undo"), { code: "ERR_HISTORY_EMPTY" });
    }
    const inverse = mutation.inverse;
    entry.project = this.reduceMutation(entry.project, inverse);
    entry.redoStack.push(mutation);
    this.appendWal(projectId, { type: "undo", payload: mutation.type, inverse });
    return { project: entry.project, mutation: mutation.type };
  }

  redo(projectId: string): HistoryResult {
    const entry = this.projects.get(projectId);
    if (!entry) {
      throw Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" });
    }
    const mutation = entry.redoStack.pop();
    if (!mutation) {
      throw Object.assign(new Error("Nothing to redo"), { code: "ERR_HISTORY_EMPTY" });
    }
    entry.project = this.reduceMutation(entry.project, mutation);
    entry.undoStack.push(mutation);
    entry.redoStack = [];
    this.appendWal(projectId, { type: "redo", payload: mutation.type, inverse: mutation.inverse });
    return { project: entry.project, mutation: mutation.type };
  }

  history(projectId: string): { undoCount: number; redoCount: number } {
    const entry = this.projects.get(projectId);
    if (!entry) {
      throw Object.assign(new Error("Project not found"), { code: "ERR_PROJECT_NOT_FOUND" });
    }
    return { undoCount: entry.undoStack.length, redoCount: entry.redoStack.length };
  }

  private reduceMutation(project: Project, mutation: Mutation): Project {
    switch (mutation.type) {
      case "channel.create": {
        const payload = mutation.payload as { channelId: string; name: string; type: string };
        return {
          ...project,
          channelRack: {
            channels: [
              ...project.channelRack.channels,
              { id: payload.channelId, name: payload.name, type: payload.type, steps: [] },
            ],
          },
          modifiedAt: new Date().toISOString(),
        };
      }
      case "channel.delete": {
        const payload = mutation.payload as { channelId: string };
        return {
          ...project,
          channelRack: {
            channels: project.channelRack.channels.filter(
              (c) => (c as { id: string }).id !== payload.channelId,
            ),
          },
          modifiedAt: new Date().toISOString(),
        };
      }
      case "channel.update": {
        const payload = mutation.payload as { channelId: string; patch: Record<string, unknown> };
        return {
          ...project,
          channelRack: {
            channels: project.channelRack.channels.map((c) =>
              (c as { id: string }).id === payload.channelId
                ? { ...(c as Record<string, unknown>), ...payload.patch }
                : c,
            ),
          },
          modifiedAt: new Date().toISOString(),
        };
      }
      case "project.patch": {
        const patch = mutation.payload as ProjectMetadataPatch;
        return ProjectSchema.parse({ ...project, ...patch, modifiedAt: new Date().toISOString() });
      }
      default:
        return { ...project, modifiedAt: new Date().toISOString() };
    }
  }

  private walPath(projectId: string): string {
    return join(this.walDir, `${projectId}.log`);
  }

  private async appendWal(projectId: string, mutation: Mutation): Promise<void> {
    const line = `${JSON.stringify(mutation)}\n`;
    await writeFile(this.walPath(projectId), line, { flag: "a" });
  }

  private async truncateWal(projectId: string): Promise<void> {
    try {
      await rm(this.walPath(projectId));
    } catch {
      // Ignore if WAL does not exist.
    }
  }

  private async recoverFromWal(): Promise<void> {
    let files: string[];
    try {
      files = await readdir(this.walDir);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".log")) continue;
      const projectId = file.slice(0, -4);
      const lines = await readFile(join(this.walDir, file), "utf-8");
      const mutations: Mutation[] = [];
      for (const line of lines.split("\n")) {
        if (!line.trim()) continue;
        try {
          mutations.push(JSON.parse(line) as Mutation);
        } catch {
          // Skip corrupted WAL entries.
        }
      }
      if (mutations.length === 0) continue;
      const project = this.createRecoveredProject(projectId, mutations);
      this.projects.set(projectId, {
        project,
        bundlePath: undefined,
        undoStack: mutations.filter((m) => m.type !== "undo" && m.type !== "redo"),
        redoStack: [],
        recovered: true,
      });
    }
  }

  private createRecoveredProject(projectId: string, mutations: Mutation[]): Project {
    const now = new Date().toISOString();
    let project: Project = {
      version: PROTOCOL_VERSION,
      id: projectId,
      name: "Recovered Project",
      createdAt: now,
      modifiedAt: now,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      sampleRate: 48000,
      settings: { audioBufferSize: 512 },
      channelRack: { channels: [] },
      patterns: [],
      playlist: { tracks: [] },
      mixer: { inserts: [] },
      routing: { nodes: [], edges: [] },
      automationClips: [],
      assets: [],
    };
    for (const mutation of mutations) {
      if (mutation.type === "undo" || mutation.type === "redo") continue;
      project = this.reduceMutation(project, mutation);
    }
    return project;
  }
}
