import { useMonaco } from "@monaco-editor/react";
import type {
  AppTokens,
  ThemeRecord,
  ThemeSettings,
  UiScale,
  VsCodeTheme,
} from "@singularity/shared";
import { appTokensSchema, themeSettingsSchema, vsCodeThemeSchema } from "@singularity/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BUILT_IN_THEMES, BUILT_IN_THEME_LIST } from "../themes/built-in/index.js";
import {
  appTokensToCssVariables,
  slugifyThemeId,
  toMonacoThemeData,
} from "../themes/monaco-theme.js";
import { resolveAppTokens } from "../themes/resolve-tokens.js";
import {
  STATIC_TOKENS,
  UI_SCALE_TO_ROOT_PX,
  staticTokensToCssVariables,
} from "../themes/static-tokens.js";
import "../styles/index.css";

export interface ThemeContextValue {
  settings: ThemeSettings;
  tokens: AppTokens;
  activeTheme: VsCodeTheme;
  setTheme: (themeId: string) => Promise<void>;
  setUiScale: (scale: UiScale) => Promise<void>;
  importTheme: (file: File) => Promise<ThemeRecord>;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  baseUrl?: string;
}

const DEFAULT_SETTINGS: ThemeSettings = {
  activeThemeId: "dark-plus",
  uiScale: "100",
  themes: BUILT_IN_THEME_LIST.map((theme) => ({
    id: slugifyThemeId(theme.name),
    name: theme.name,
    type: theme.type as VsCodeTheme["type"],
    source: "built-in" as const,
  })),
};

function applyTokensToRoot(tokens: AppTokens): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(appTokensToCssVariables(tokens.colors))) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(staticTokensToCssVariables(tokens.static))) {
    root.style.setProperty(key, value);
  }
}

function applyUiScale(scale: UiScale): void {
  document.documentElement.style.fontSize = `${UI_SCALE_TO_ROOT_PX[scale]}px`;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

export function ThemeProvider({ children, baseUrl = "" }: ThemeProviderProps): React.ReactElement {
  const monaco = useMonaco();
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [activeTheme, setActiveTheme] = useState<VsCodeTheme>(
    BUILT_IN_THEMES.darkPlus as VsCodeTheme,
  );
  const definedThemesRef = useRef<Set<string>>(new Set());

  const applyMonacoTheme = useCallback(
    (theme: VsCodeTheme) => {
      if (!monaco) return;
      const slug = slugifyThemeId(theme.name);
      if (!definedThemesRef.current.has(slug)) {
        monaco.editor.defineTheme(slug, toMonacoThemeData(theme));
        definedThemesRef.current.add(slug);
      }
      monaco.editor.setTheme(slug);
    },
    [monaco],
  );

  const tokens = useMemo<AppTokens>(
    () => appTokensSchema.parse({ colors: resolveAppTokens(activeTheme), static: STATIC_TOKENS }),
    [activeTheme],
  );

  useEffect(() => {
    applyTokensToRoot(tokens);
    document.documentElement.classList.toggle("sg-light", activeTheme.type === "light");
  }, [tokens, activeTheme.type]);

  useEffect(() => {
    applyUiScale(settings.uiScale);
  }, [settings.uiScale]);

  useEffect(() => {
    applyMonacoTheme(activeTheme);
  }, [activeTheme, applyMonacoTheme]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await fetchJson<unknown>(`${baseUrl}/api/v1/settings/theme`);
      const nextSettings = themeSettingsSchema.parse(data);
      setSettings(nextSettings);
      const record = nextSettings.themes.find((t) => t.id === nextSettings.activeThemeId);
      if (record) {
        const theme = await resolveTheme(record, baseUrl);
        setActiveTheme(theme);
      }
    } catch {
      // Keep defaults if backend is unavailable.
    }
  }, [baseUrl]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const setTheme = useCallback(
    async (themeId: string) => {
      await fetchJson(`${baseUrl}/api/v1/settings/theme`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeThemeId: themeId }),
      });
      const record = settings.themes.find((t) => t.id === themeId);
      if (record) {
        const theme = await resolveTheme(record, baseUrl);
        setActiveTheme(theme);
        setSettings((prev) => ({ ...prev, activeThemeId: themeId }));
      }
    },
    [baseUrl, settings.themes],
  );

  const setUiScale = useCallback(
    async (scale: UiScale) => {
      await fetchJson(`${baseUrl}/api/v1/settings/theme`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uiScale: scale }),
      });
      setSettings((prev) => ({ ...prev, uiScale: scale }));
    },
    [baseUrl],
  );

  const importTheme = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const theme = vsCodeThemeSchema.parse(parsed);
      const body = new FormData();
      body.append("file", new Blob([text], { type: "application/json" }), file.name);
      const record = await fetchJson<ThemeRecord>(`${baseUrl}/api/v1/themes/import`, {
        method: "POST",
        body,
      });
      setSettings((prev) => ({
        ...prev,
        themes: [...prev.themes, record],
        activeThemeId: record.id,
      }));
      setActiveTheme(theme);
      return record;
    },
    [baseUrl],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ settings, tokens, activeTheme, setTheme, setUiScale, importTheme }),
    [settings, tokens, activeTheme, setTheme, setUiScale, importTheme],
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

async function resolveTheme(record: ThemeRecord, baseUrl: string): Promise<VsCodeTheme> {
  if (record.source === "built-in") {
    const builtIn = BUILT_IN_THEME_LIST.find((t) => slugifyThemeId(t.name) === record.id);
    if (builtIn) return builtIn as VsCodeTheme;
  }
  const data = await fetchJson<unknown>(`${baseUrl}/api/v1/themes/${record.id}`);
  return vsCodeThemeSchema.parse(data);
}
