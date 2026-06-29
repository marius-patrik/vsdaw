import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VsCodeTheme } from "@singularity/shared";
import { buildServer } from "../../index.js";
import type { BuildServerResult } from "../../index.js";

describe("/api/v1/themes", () => {
  let server: BuildServerResult;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "sg-theme-test-"));
    server = await buildServer({ dataDir });
  });

  afterEach(async () => {
    await server.app.close();
  });

  it("lists built-in themes", async () => {
    const response = await server.app.inject({ method: "GET", url: "/api/v1/themes" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.themes.length).toBeGreaterThanOrEqual(4);
    expect(body.themes.some((t: { id: string }) => t.id === "dark-plus")).toBe(true);
  });

  it("imports a valid VS Code theme", async () => {
    const theme = {
      name: "Test Theme",
      type: "dark",
      colors: { "editor.background": "#123456" },
    };
    const path = join(dataDir, "upload.json");
    writeFileSync(path, JSON.stringify(theme));

    const response = await server.app.inject({
      method: "POST",
      url: "/api/v1/themes/import",
      payload: `--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="theme.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(theme)}\r\n--BOUNDARY--\r\n`,
      headers: { "content-type": "multipart/form-data; boundary=BOUNDARY" },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBe("test-theme");
    expect(body.source).toBe("user");
  });

  it("rejects an invalid theme with 400", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/v1/themes/import",
      payload: `--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="bad.json"\r\nContent-Type: application/json\r\n\r\n{"name": 123}\r\n--BOUNDARY--\r\n`,
      headers: { "content-type": "multipart/form-data; boundary=BOUNDARY" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("deletes a user theme", async () => {
    const theme = { name: "Delete Me", type: "dark", colors: {} };
    await server.store.importTheme("delete-me", theme as VsCodeTheme);
    const response = await server.app.inject({
      method: "DELETE",
      url: "/api/v1/themes/delete-me",
    });
    expect(response.statusCode).toBe(204);
  });

  it("refuses to delete a built-in theme", async () => {
    const response = await server.app.inject({
      method: "DELETE",
      url: "/api/v1/themes/dark-plus",
    });
    expect(response.statusCode).toBe(404);
  });
});
