import { type VsCodeTheme, vsCodeThemeSchema } from "@singularity/shared";

export { vsCodeThemeSchema, vsCodeThemeTypeSchema } from "@singularity/shared";
export type { VsCodeTheme, VsCodeThemeType } from "@singularity/shared";

export function parseVsCodeThemeJson(json: unknown): VsCodeTheme {
  return vsCodeThemeSchema.parse(json);
}
