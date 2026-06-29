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

export const uiScaleSchema = z.enum(["75", "100", "125", "150", "200"]);
export type UiScale = z.infer<typeof uiScaleSchema>;

export const appColorTokenSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  panelBackground: z.string(),
  panelForeground: z.string(),
  panelBorder: z.string(),
  surface1: z.string(),
  surface2: z.string(),
  surface3: z.string(),
  border: z.string(),
  borderSubtle: z.string(),
  borderFocus: z.string(),
  accent: z.string(),
  accentForeground: z.string(),
  accentHover: z.string(),
  danger: z.string(),
  warning: z.string(),
  success: z.string(),
  info: z.string(),
  textPrimary: z.string(),
  textSecondary: z.string(),
  textDisabled: z.string(),
  meterGreen: z.string(),
  meterYellow: z.string(),
  meterRed: z.string(),
  playhead: z.string(),
  selection: z.string(),
  loopRegion: z.string(),
  gridLine: z.string(),
  gridLineSub: z.string(),
  gridLineBar: z.string(),
});
export type AppColorTokens = z.infer<typeof appColorTokenSchema>;

export const staticTokenSchema = z.object({
  space: z.record(z.string()),
  size: z.record(z.string()),
  radius: z.record(z.string()),
  shadow: z.record(z.string()),
  font: z.record(z.string()),
});
export type StaticTokens = z.infer<typeof staticTokenSchema>;

export const appTokensSchema = z.object({
  colors: appColorTokenSchema,
  static: staticTokenSchema,
});
export type AppTokens = z.infer<typeof appTokensSchema>;

export const themeRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: vsCodeThemeTypeSchema,
  source: z.enum(["built-in", "user"]),
});
export type ThemeRecord = z.infer<typeof themeRecordSchema>;

export const themeSettingsSchema = z.object({
  activeThemeId: z.string(),
  uiScale: uiScaleSchema,
  themes: z.array(themeRecordSchema),
});
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
