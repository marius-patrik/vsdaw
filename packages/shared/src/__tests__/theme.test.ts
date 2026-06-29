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

describe("theme schemas", () => {
  it("validates a VS Code theme", () => {
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

  it("validates app color tokens", () => {
    const tokens = {
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
    expect(() => appColorTokenSchema.parse(tokens)).not.toThrow();
  });

  it("validates static tokens", () => {
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

  it("validates app tokens", () => {
    expect(() =>
      appTokensSchema.parse({
        colors: {
          background: "#000000",
          foreground: "#ffffff",
          panelBackground: "#111111",
          panelForeground: "#cccccc",
          panelBorder: "#222222",
          surface1: "#333333",
          surface2: "#444444",
          surface3: "#555555",
          border: "#666666",
          borderSubtle: "#777777",
          borderFocus: "#888888",
          accent: "#999999",
          accentForeground: "#aaaaaa",
          accentHover: "#bbbbbb",
          danger: "#cc0000",
          warning: "#ffcc00",
          success: "#00cc00",
          info: "#00ccff",
          textPrimary: "#dddddd",
          textSecondary: "#eeeeee",
          textDisabled: "#999999",
          meterGreen: "#00ff00",
          meterYellow: "#ffff00",
          meterRed: "#ff0000",
          playhead: "#ffffff",
          selection: "#444444",
          loopRegion: "#555555",
          gridLine: "#666666",
          gridLineSub: "#777777",
          gridLineBar: "#888888",
        },
        static: {
          space: { "0": "0" },
          size: { toolbarHeight: "2.75rem" },
          radius: { sm: "0.25rem" },
          shadow: { sm: "none" },
          font: { base: "1rem" },
        },
      }),
    ).not.toThrow();
  });

  it("validates UI scale", () => {
    expect(uiScaleSchema.parse("100")).toBe("100");
    expect(() => uiScaleSchema.parse("99")).toThrow();
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
