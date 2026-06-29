import type { AppColorTokens, AppTokens, VsCodeTheme } from "@singularity/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { resolveAppTokens } from "../themes/resolve-tokens.js";
import { STATIC_TOKENS } from "../themes/static-tokens.js";
import "../styles/index.css";

export interface ThemeContextValue {
  theme: VsCodeTheme;
  tokens: AppTokens;
  setTheme: (theme: VsCodeTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme: VsCodeTheme;
}

function applyColorTokensToRoot(tokens: AppColorTokens): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    root.style.setProperty(`--sg-${cssKey}`, value);
  }
}

function applyStaticTokensToRoot(staticTokens: AppTokens["static"]): void {
  const root = document.documentElement;
  for (const [category, values] of Object.entries(staticTokens)) {
    for (const [key, value] of Object.entries(values)) {
      const cssKey = key
        .replace(/\./g, "-")
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase();
      root.style.setProperty(`--sg-${category}-${cssKey}`, value);
    }
  }
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<VsCodeTheme>(initialTheme);

  const setTheme = useCallback((next: VsCodeTheme) => {
    setThemeState(next);
  }, []);

  const colorTokens = useMemo(() => resolveAppTokens(theme), [theme]);

  const tokens = useMemo<AppTokens>(
    () => ({ colors: colorTokens, static: STATIC_TOKENS }),
    [colorTokens],
  );

  useEffect(() => {
    applyColorTokensToRoot(colorTokens);
    applyStaticTokensToRoot(STATIC_TOKENS);
    document.documentElement.classList.toggle("sg-light", theme.type === "light");
  }, [colorTokens, theme.type]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, tokens, setTheme }),
    [theme, tokens, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return value;
}
