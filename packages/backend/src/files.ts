import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, resolve } from "node:path";
import type { FileEntry, FileRoot } from "@singularity/shared";

export interface FileServiceOptions {
  dataDir: string;
  projectDir?: string;
}

export class FileService {
  private readonly dataDir: string;
  private projectDir: string | undefined;

  constructor(options: FileServiceOptions) {
    this.dataDir = resolve(options.dataDir);
    this.projectDir = options.projectDir ? resolve(options.projectDir) : undefined;
  }

  roots(): FileRoot[] {
    return [
      { id: "project", path: this.projectDir ?? this.dataDir, writable: true },
      { id: "userData", path: this.dataDir, writable: true },
      { id: "downloads", path: join(this.dataDir, "downloads"), writable: true },
    ];
  }

  private rootPath(rootId: string): string {
    const root = this.roots().find((r) => r.id === rootId);
    if (!root) {
      throw Object.assign(new Error("Unknown file root"), { code: "ERR_FILE_ACCESS_DENIED" });
    }
    return root.path;
  }

  private resolvePath(rootId: string, relativePath: string): string {
    if (
      relativePath.includes("..") ||
      relativePath.startsWith("/") ||
      relativePath.startsWith("\\")
    ) {
      throw Object.assign(new Error("Invalid file path"), { code: "ERR_FILE_ACCESS_DENIED" });
    }
    const root = this.rootPath(rootId);
    const target = resolve(root, normalize(relativePath));
    if (!target.startsWith(`${root}/`) && target !== root) {
      throw Object.assign(new Error("Path escapes root"), { code: "ERR_FILE_ACCESS_DENIED" });
    }
    return target;
  }

  async list(rootId: string, relativePath: string): Promise<FileEntry[]> {
    const dir = this.resolvePath(rootId, relativePath);
    const entries = await readdir(dir, { withFileTypes: true });
    const result: FileEntry[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relative = join(relativePath, entry.name);
      let size: number | undefined;
      let modifiedAt: string | undefined;
      try {
        const info = await stat(fullPath);
        size = info.isFile() ? info.size : undefined;
        modifiedAt = info.mtime.toISOString();
      } catch {
        // Use defaults if stat fails.
      }
      result.push({
        name: entry.name,
        path: relative,
        type: entry.isDirectory() ? "directory" : "file",
        size,
        modifiedAt,
      });
    }
    return result;
  }

  async read(
    rootId: string,
    relativePath: string,
    encoding: "utf8" | "base64" = "utf8",
  ): Promise<string> {
    const target = this.resolvePath(rootId, relativePath);
    const data = await readFile(target);
    if (encoding === "base64") {
      return data.toString("base64");
    }
    return data.toString("utf-8");
  }

  async write(
    rootId: string,
    relativePath: string,
    content: string,
    encoding: "utf8" | "base64" = "utf8",
  ): Promise<void> {
    const target = this.resolvePath(rootId, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const buffer =
      encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8");
    await writeFile(target, buffer);
  }

  async rename(rootId: string, relativePath: string, newName: string): Promise<void> {
    const source = this.resolvePath(rootId, relativePath);
    const dir = dirname(source);
    const dest = join(dir, newName);
    if (!dest.startsWith(`${this.rootPath(rootId)}/`)) {
      throw Object.assign(new Error("Rename escapes root"), { code: "ERR_FILE_ACCESS_DENIED" });
    }
    await rename(source, dest);
  }

  async delete(rootId: string, relativePath: string): Promise<void> {
    const target = this.resolvePath(rootId, relativePath);
    await rm(target, { recursive: true, force: true });
  }

  async mkdir(rootId: string, relativePath: string): Promise<void> {
    const target = this.resolvePath(rootId, relativePath);
    await mkdir(target, { recursive: true });
  }

  setProjectDir(projectDir: string | undefined): void {
    this.projectDir = projectDir ? resolve(projectDir) : undefined;
  }

  getProjectDir(): string | undefined {
    return this.projectDir;
  }
}
