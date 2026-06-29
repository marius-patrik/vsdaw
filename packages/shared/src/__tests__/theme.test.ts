import { describe, expect, it } from "bun:test";
import {
  appColorTokenSchema,
  appTokensSchema,
  staticTokenSchema,
  themeRecordSchema,
  themeSettingsSchema,
  uiScaleSchema,
  vsCodeThemeSchema,
} from "../theme.js";

const validVsCodeTheme = {
  name: "Dark+",
  type: "dark",
  colors: { "editor.background": "#1e1e1e" },
};

const validColorTokens = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  panelBackground: "#252526",
  panelForeground: "#cccccc",
  panelBorder: "#3c3c3c",
  surface1: "#37373d",
  surface2: "#3c3c3c",
  surface3: "#3c3c3c",
  border: "#3c3c3c",
  borderSubtle: "#2a2d2e",
  borderFocus: "#007fd4",
  accent: "#0e639c",
  accentForeground: "#ffffff",
  accentHover: "#1177bb",
  danger: "#f48771",
  warning: "#cca700",
  success: "#89d185",
  info: "#75beff",
  textPrimary: "#cccccc",
  textSecondary: "#9cdcfe",
  textDisabled: "#808080",
  meterGreen: "#89d185",
  meterYellow: "#cca700",
  meterRed: "#f48771",
  playhead: "#007fd4",
  selection: "#264f78",
  loopRegion: "#514f38",
  gridLine: "#2a2d2e",
  gridLineSub: "#2a2d2e",
  gridLineBar: "#3c3c3c",
};

describe("theme schemas", () => {
  it("vsCodeThemeSchema accepts valid theme", () => {
    const result = vsCodeThemeSchema.safeParse(validVsCodeTheme);
    expect(result.success).toBe(true);
  });

  it("vsCodeThemeSchema rejects missing name", () => {
    const result = vsCodeThemeSchema.safeParse({ type: "dark", colors: {} });
    expect(result.success).toBe(false);
  });

  it("validates a VS Code theme with tokenColors", () => {
    const theme = {
      name: "Dark+",
      type: "dark",
      colors: { "editor.background": "#1e1e1e" },
      tokenColors: [{ scope: ["comment"], settings: { foreground: "#6a9955" } }],
    };
    expect(() => vsCodeThemeSchema.parse(theme)).not.toThrow();
  });

  it("rejects an invalid VS Code theme type", () => {
    expect(() => vsCodeThemeSchema.parse({ name: "Bad", type: "blue", colors: {} })).toThrow();
  });

  it("uiScaleSchema accepts valid scales", () => {
    expect(uiScaleSchema.safeParse("100").success).toBe(true);
  });

  it("uiScaleSchema rejects invalid scale", () => {
    expect(uiScaleSchema.safeParse("110").success).toBe(false);
    expect(() => uiScaleSchema.parse("99")).toThrow();
  });

  it("appColorTokenSchema accepts valid tokens", () => {
    expect(appColorTokenSchema.safeParse(validColorTokens).success).toBe(true);
    expect(() => appColorTokenSchema.parse(validColorTokens)).not.toThrow();
  });

  it("appColorTokenSchema rejects missing token", () => {
    const { background, ...rest } = validColorTokens;
    expect(appColorTokenSchema.safeParse(rest).success).toBe(false);
  });

  it("staticTokenSchema accepts valid static tokens", () => {
    expect(
      staticTokenSchema.safeParse({ space: {}, size: {}, radius: {}, shadow: {}, font: {} })
        .success,
    ).toBe(true);
    expect(() =>
      staticTokenSchema.parse({
        space: { "0": "0", "1": "0.25rem" },
        size: { toolbarHeight: "2.75rem" },
        radius: { sm: "0.25rem" },
        shadow: { sm: "none" },
        font: { base: "1rem" },
      }),
    ).not.toThrow();
  });

  it("appTokensSchema accepts valid tokens", () => {
    expect(
      appTokensSchema.safeParse({
        colors: validColorTokens,
        static: { space: {}, size: {}, radius: {}, shadow: {}, font: {} },
      }).success,
    ).toBe(true);
  });

  it("validates theme record", () => {
    expect(() =>
      themeRecordSchema.parse({ id: "dark-plus", name: "Dark+", type: "dark", source: "built-in" }),
    ).not.toThrow();
  });

  it("validates theme settings", () => {
    expect(() =>
      themeSettingsSchema.parse({
        activeThemeId: "dark-plus",
        uiScale: "100",
        themes: [{ id: "dark-plus", name: "Dark+", type: "dark", source: "built-in" }],
      }),
    ).not.toThrow();
  });
});
