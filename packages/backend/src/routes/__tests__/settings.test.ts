import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../../index.js";
import type { BuildServerResult } from "../../index.js";

describe("/api/v1/settings/theme", () => {
  let server: BuildServerResult;

  beforeEach(async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "sg-settings-test-"));
    server = await buildServer({ dataDir });
  });

  afterEach(async () => {
    await server.app.close();
  });

  it("returns default settings", async () => {
    const response = await server.app.inject({ method: "GET", url: "/api/v1/settings/theme" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.activeThemeId).toBe("dark-plus");
    expect(body.uiScale).toBe("100");
    expect(body.themes.length).toBeGreaterThanOrEqual(4);
  });

  it("updates active theme", async () => {
    const response = await server.app.inject({
      method: "PATCH",
      url: "/api/v1/settings/theme",
      payload: { activeThemeId: "light-plus" },
      headers: { "content-type": "application/json" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.activeThemeId).toBe("light-plus");
  });

  it("updates UI scale", async () => {
    const response = await server.app.inject({
      method: "PATCH",
      url: "/api/v1/settings/theme",
      payload: { uiScale: "150" },
      headers: { "content-type": "application/json" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.uiScale).toBe("150");
  });

  it("rejects invalid scale", async () => {
    const response = await server.app.inject({
      method: "PATCH",
      url: "/api/v1/settings/theme",
      payload: { uiScale: "99" },
      headers: { "content-type": "application/json" },
    });
    expect(response.statusCode).toBe(400);
  });
});
