import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppColorTokens, VsCodeTheme } from "../themes/vscode.js";
import { convertVsCodeTheme } from "../themes/vscode.js";
import "../styles/index.css";

export interface ThemeContextValue {
  theme: VsCodeTheme;
  tokens: AppColorTokens;
  setTheme: (theme: VsCodeTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme: VsCodeTheme;
}

function applyTokensToRoot(tokens: AppColorTokens): void {
  const root = document.documentElement;
  root.style.setProperty("--sg-background", tokens.background);
  root.style.setProperty("--sg-foreground", tokens.foreground);
  root.style.setProperty("--sg-sidebar-background", tokens.sidebarBackground);
  root.style.setProperty("--sg-panel-background", tokens.panelBackground);
  root.style.setProperty("--sg-accent", tokens.accent);
  root.style.setProperty("--sg-accent-foreground", tokens.accentForeground);
  root.style.setProperty("--sg-border", tokens.border);
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<VsCodeTheme>(initialTheme);

  const setTheme = useCallback((next: VsCodeTheme) => {
    setThemeState(next);
  }, []);

  const tokens = useMemo(() => convertVsCodeTheme(theme), [theme]);

  useEffect(() => {
    applyTokensToRoot(tokens);
    document.documentElement.classList.toggle("sg-light", theme.type === "light");
  }, [tokens, theme.type]);

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
