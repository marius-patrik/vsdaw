import { type VsCodeTheme, appColorTokenSchema, vsCodeThemeSchema } from "@singularity/shared";
import darkPlus from "../themes/built-in/dark-plus.json";
import dracula from "../themes/built-in/dracula.json";
import lightPlus from "../themes/built-in/light-plus.json";
import oneDarkPro from "../themes/built-in/one-dark-pro.json";
import {
  appTokensToCssVariables,
  slugifyThemeId,
  toMonacoBase,
  toMonacoThemeData,
} from "../themes/monaco-theme.js";
import {
  APP_TOKEN_FALLBACKS,
  VS_CODE_TO_APP_TOKEN_MAP,
  resolveAppTokens,
} from "../themes/resolve-tokens.js";

describe("VS Code theme schema", () => {
  it("parses a valid dark theme", () => {
    const result = vsCodeThemeSchema.parse(darkPlus);
    expect(result.name).toBe("Dark+");
    expect(result.type).toBe("dark");
  });

  it("rejects an invalid theme", () => {
    expect(() => vsCodeThemeSchema.parse({})).toThrow();
    expect(() =>
      vsCodeThemeSchema.parse({
        name: "Broken",
        type: "dark",
        colors: { invalid: 123 },
      }),
    ).toThrow();
  });

  it("parses all built-in themes", () => {
    for (const theme of [darkPlus, lightPlus, dracula, oneDarkPro]) {
      expect(() => vsCodeThemeSchema.parse(theme)).not.toThrow();
    }
  });
});

describe("resolveAppTokens", () => {
  it("resolves every token for Dark+", () => {
    const tokens = resolveAppTokens(darkPlus as VsCodeTheme);
    expect(() => appColorTokenSchema.parse(tokens)).not.toThrow();
    expect(tokens.background).toBe("#1E1E1E");
  });

  it("resolves every token for Light+", () => {
    const tokens = resolveAppTokens(lightPlus as VsCodeTheme);
    expect(() => appColorTokenSchema.parse(tokens)).not.toThrow();
    expect(tokens.background).toBe("#FFFFFF");
  });

  it("resolves every token for Dracula", () => {
    const tokens = resolveAppTokens(dracula as VsCodeTheme);
    expect(() => appColorTokenSchema.parse(tokens)).not.toThrow();
    expect(tokens.background).toBe("#282A36");
  });

  it("resolves every token for One Dark Pro", () => {
    const tokens = resolveAppTokens(oneDarkPro as VsCodeTheme);
    expect(() => appColorTokenSchema.parse(tokens)).not.toThrow();
    expect(tokens.background).toBe("#282C34");
  });

  it("falls back when a VS Code token is missing", () => {
    const theme: VsCodeTheme = {
      name: "Empty",
      type: "dark",
      colors: {},
    };
    const tokens = resolveAppTokens(theme);
    expect(tokens.background).toBe(APP_TOKEN_FALLBACKS.background);
    expect(tokens.accent).toBe(APP_TOKEN_FALLBACKS.accent);
  });

  it("uses the next key in the fallback chain", () => {
    const theme: VsCodeTheme = {
      name: "Partial",
      type: "dark",
      colors: {
        "activityBar.background": "#123456",
      },
    };
    const tokens = resolveAppTokens(theme);
    expect(tokens.panelBackground).toBe("#123456");
  });

  it("logs fallback warnings when onFallback is provided", () => {
    const warnings: Array<{ token: keyof typeof APP_TOKEN_FALLBACKS; fallback: string }> = [];
    const theme: VsCodeTheme = {
      name: "Empty",
      type: "dark",
      colors: {},
    };
    resolveAppTokens(theme, {
      onFallback: (token, fallback) => warnings.push({ token, fallback }),
    });
    expect(warnings.length).toBe(Object.keys(VS_CODE_TO_APP_TOKEN_MAP).length);
  });
});

describe("Monaco theme conversion", () => {
  it("returns vs-dark for dark themes", () => {
    expect(toMonacoBase(darkPlus as VsCodeTheme)).toBe("vs-dark");
  });

  it("returns vs for light themes", () => {
    expect(toMonacoBase(lightPlus as VsCodeTheme)).toBe("vs");
  });

  it("returns hc-black for hcDark themes", () => {
    expect(toMonacoBase({ ...darkPlus, type: "hcDark" } as VsCodeTheme)).toBe("hc-black");
  });

  it("returns hc-light for hcLight themes", () => {
    expect(toMonacoBase({ ...lightPlus, type: "hcLight" } as VsCodeTheme)).toBe("hc-light");
  });

  it("converts token colors to Monaco rules", () => {
    const data = toMonacoThemeData(darkPlus as VsCodeTheme);
    expect(data.base).toBe("vs-dark");
    expect(data.inherit).toBe(true);
    expect(data.rules.length).toBeGreaterThan(0);
    expect(data.colors["editor.background"]).toBe("#1E1E1E");
  });

  it("slugifies theme names", () => {
    expect(slugifyThemeId("Dark+")).toBe("dark");
    expect(slugifyThemeId("One Dark Pro")).toBe("one-dark-pro");
    expect(slugifyThemeId("  Hello World!! ")).toBe("hello-world");
  });

  it("converts app tokens to CSS variables", () => {
    const css = appTokensToCssVariables({
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
    });
    expect(css["--sg-background"]).toBe("#000000");
    expect(css["--sg-panel-background"]).toBe("#111111");
    expect(css["--sg-accent-hover"]).toBe("#bbbbbb");
  });
});
