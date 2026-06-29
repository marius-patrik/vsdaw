import type { AppColorTokens, VsCodeTheme } from "@singularity/shared";
import type * as monaco from "monaco-editor";

export function toMonacoBase(theme: VsCodeTheme): "vs" | "vs-dark" | "hc-black" | "hc-light" {
  switch (theme.type) {
    case "light":
      return "vs";
    case "hcDark":
      return "hc-black";
    case "hcLight":
      return "hc-light";
    case "dark":
      return "vs-dark";
  }
}

export function toMonacoThemeData(theme: VsCodeTheme): monaco.editor.IStandaloneThemeData {
  return {
    base: toMonacoBase(theme),
    inherit: true,
    rules: (theme.tokenColors ?? []).flatMap((tc) => {
      const settings = tc.settings ?? {};
      const foreground = typeof settings.foreground === "string" ? settings.foreground : undefined;
      const scopes = Array.isArray(tc.scope) ? tc.scope : tc.scope ? [tc.scope] : [];
      if (scopes.length === 0) return [];
      return scopes.map((scope) => ({ token: scope, foreground }));
    }),
    colors: theme.colors,
  };
}

export function slugifyThemeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function appTokensToCssVariables(tokens: AppColorTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    vars[`--sg-${cssKey}`] = value;
  }
  return vars;
}
