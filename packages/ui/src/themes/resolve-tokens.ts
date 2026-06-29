import { type AppColorTokens, type VsCodeTheme, appColorTokenSchema } from "@singularity/shared";
import { APP_TOKEN_FALLBACKS, VS_CODE_TO_APP_TOKEN_MAP } from "./vs-code-map.js";

export { APP_TOKEN_FALLBACKS, VS_CODE_TO_APP_TOKEN_MAP } from "./vs-code-map.js";

export interface ResolveOptions {
  onFallback?: (token: keyof AppColorTokens, fallback: string) => void;
}

export function resolveAppTokens(theme: VsCodeTheme, options?: ResolveOptions): AppColorTokens {
  const colors = theme.colors;
  const onFallback =
    options?.onFallback ??
    ((token: keyof AppColorTokens, fallback: string) => {
      console.warn(`[theme] Falling back for "${token}" to "${fallback}"`);
    });
  const pick = (keys: string[], fallback: string, token: keyof AppColorTokens): string => {
    for (const key of keys) {
      const value = colors[key];
      if (typeof value === "string" && value.startsWith("#")) return value;
    }
    onFallback(token, fallback);
    return fallback;
  };
  const result = {} as AppColorTokens;
  for (const key of Object.keys(VS_CODE_TO_APP_TOKEN_MAP) as Array<keyof AppColorTokens>) {
    result[key] = pick(VS_CODE_TO_APP_TOKEN_MAP[key], APP_TOKEN_FALLBACKS[key], key);
  }
  return appColorTokenSchema.parse(result);
}
