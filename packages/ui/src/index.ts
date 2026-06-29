export { ThemeProvider, useTheme } from "./components/theme-provider.js";
export {
  resolveAppTokens,
  VS_CODE_TO_APP_TOKEN_MAP,
  APP_TOKEN_FALLBACKS,
  type ResolveOptions,
} from "./themes/resolve-tokens.js";
export {
  toMonacoBase,
  toMonacoThemeData,
  slugifyThemeId,
  appTokensToCssVariables,
} from "./themes/monaco-theme.js";
export {
  STATIC_TOKENS,
  UI_SCALE_TO_ROOT_PX,
  staticTokensToCssVariables,
} from "./themes/static-tokens.js";
export { vsCodeThemeSchema, vsCodeThemeTypeSchema, parseVsCodeThemeJson } from "./themes/vscode.js";
export type { VsCodeTheme, VsCodeThemeType } from "./themes/vscode.js";
export { tailwindPreset } from "../tailwind.preset.js";
