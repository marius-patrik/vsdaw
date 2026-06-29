import { type AppColorTokens, type VsCodeTheme, appColorTokenSchema } from "@singularity/shared";

export const VS_CODE_TO_APP_TOKEN_MAP: Record<keyof AppColorTokens, string[]> = {
  background: ["editor.background"],
  foreground: ["editor.foreground"],
  panelBackground: ["sideBar.background", "activityBar.background"],
  panelForeground: ["sideBar.foreground", "activityBar.foreground"],
  panelBorder: ["sideBar.border", "activityBar.border"],
  surface1: ["list.inactiveSelectionBackground", "editor.selectionHighlightBackground"],
  surface2: ["input.background"],
  surface3: ["dropdown.background"],
  border: ["panel.border", "editorGroup.border"],
  borderSubtle: ["tree.indentGuidesStroke", "editor.lineHighlightBackground"],
  borderFocus: ["focusBorder"],
  accent: ["button.background", "focusBorder"],
  accentForeground: ["button.foreground"],
  accentHover: ["button.hoverBackground", "button.background"],
  danger: ["errorForeground", "gitDecoration.deletedResourceForeground"],
  warning: ["editorWarning.foreground", "terminal.ansiYellow"],
  success: ["terminal.ansiGreen", "gitDecoration.addedResourceForeground"],
  info: ["terminal.ansiCyan", "editorInfo.foreground"],
  textPrimary: ["foreground"],
  textSecondary: ["descriptionForeground", "foreground"],
  textDisabled: ["disabledForeground"],
  meterGreen: ["terminal.ansiGreen"],
  meterYellow: ["terminal.ansiYellow"],
  meterRed: ["terminal.ansiRed"],
  playhead: ["focusBorder"],
  selection: ["editor.selectionBackground"],
  loopRegion: ["editor.findMatchHighlightBackground"],
  gridLine: ["editor.lineHighlightBackground"],
  gridLineSub: ["tree.indentGuidesStroke"],
  gridLineBar: ["editor.lineHighlightBorder"],
};

export const APP_TOKEN_FALLBACKS: Record<keyof AppColorTokens, string> = {
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

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export interface ResolveOptions {
  onFallback?: (token: keyof AppColorTokens, fallback: string) => void;
}

export function resolveAppTokens(theme: VsCodeTheme, options?: ResolveOptions): AppColorTokens {
  const colors = theme.colors;
  const pick = (keys: string[], fallback: string, token: keyof AppColorTokens): string => {
    for (const key of keys) {
      const value = colors[key];
      if (typeof value === "string" && HEX_COLOR_REGEX.test(value)) return value;
    }
    options?.onFallback?.(token, fallback);
    return fallback;
  };
  const result = {} as AppColorTokens;
  for (const key of Object.keys(VS_CODE_TO_APP_TOKEN_MAP) as Array<keyof AppColorTokens>) {
    result[key] = pick(VS_CODE_TO_APP_TOKEN_MAP[key], APP_TOKEN_FALLBACKS[key], key);
  }
  return appColorTokenSchema.parse(result);
}
