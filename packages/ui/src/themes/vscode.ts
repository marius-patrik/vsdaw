import { z } from "zod";

export const vsCodeThemeTypeSchema = z.enum(["dark", "light", "hcDark", "hcLight"]);
export type VsCodeThemeType = z.infer<typeof vsCodeThemeTypeSchema>;

export const vsCodeTokenColorSchema = z.object({
  name: z.string().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  settings: z.record(z.unknown()),
});

export const vsCodeThemeSchema = z.object({
  name: z.string(),
  type: vsCodeThemeTypeSchema,
  colors: z.record(z.string()),
  tokenColors: z.array(vsCodeTokenColorSchema).optional(),
});

export type VsCodeTheme = z.infer<typeof vsCodeThemeSchema>;

export interface AppColorTokens {
  background: string;
  foreground: string;
  sidebarBackground: string;
  panelBackground: string;
  accent: string;
  accentForeground: string;
  border: string;
}

export function convertVsCodeTheme(theme: VsCodeTheme): AppColorTokens {
  const colors = theme.colors;
  return {
    background: colors["editor.background"] ?? "#1e1e1e",
    foreground: colors["editor.foreground"] ?? "#d4d4d4",
    sidebarBackground: colors["sideBar.background"] ?? "#252526",
    panelBackground: colors["panel.background"] ?? colors["editor.background"] ?? "#1e1e1e",
    accent: colors["button.background"] ?? colors.focusBorder ?? "#0e639c",
    accentForeground: colors["button.foreground"] ?? "#ffffff",
    border: colors["panel.border"] ?? colors["sideBar.border"] ?? "#3c3c3c",
  };
}
