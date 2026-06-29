import type { StaticTokens } from "@singularity/shared";

export const STATIC_TOKENS: StaticTokens = {
  space: {
    "0": "0",
    px: "1px",
    "0.5": "0.125rem",
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "8": "2rem",
    "10": "2.5rem",
    "12": "3rem",
  },
  size: {
    toolbarHeight: "2.75rem",
    panelHeaderHeight: "2rem",
    channelRackStripHeight: "5rem",
    mixerStripWidth: "5rem",
    faderWidth: "1.5rem",
    buttonHeight: "1.75rem",
    buttonSmallHeight: "1.375rem",
    inputHeight: "1.75rem",
    rulerHeight: "1.5rem",
  },
  radius: {
    sm: "0.1875rem",
    md: "0.25rem",
    lg: "0.375rem",
    full: "9999px",
  },
  shadow: {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.25)",
    md: "0 4px 12px 0 rgba(0, 0, 0, 0.25)",
  },
  font: {
    xs: "0.625rem",
    sm: "0.6875rem",
    base: "0.75rem",
    md: "0.8125rem",
    lg: "0.875rem",
    xl: "1rem",
  },
};

export const UI_SCALE_TO_ROOT_PX: Record<"75" | "100" | "125" | "150" | "200", number> = {
  "75": 12,
  "100": 16,
  "125": 20,
  "150": 24,
  "200": 32,
};

export function staticTokensToCssVariables(staticTokens: StaticTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [category, values] of Object.entries(staticTokens)) {
    for (const [key, value] of Object.entries(values)) {
      const cssKey = key
        .replace(/\./g, "-")
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase();
      vars[`--sg-${category}-${cssKey}`] = value;
    }
  }
  return vars;
}
