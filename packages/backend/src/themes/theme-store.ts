import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ThemeRecord,
  type ThemeSettings,
  type VsCodeTheme,
  themeSettingsSchema,
  vsCodeThemeSchema,
} from "@singularity/shared";

export interface ThemeStoreOptions {
  dataDir: string;
}

const BUILT_IN_THEMES: ThemeRecord[] = [
  { id: "dark-plus", name: "Dark+", type: "dark", source: "built-in" },
  { id: "light-plus", name: "Light+", type: "light", source: "built-in" },
  { id: "dracula", name: "Dracula", type: "dark", source: "built-in" },
  { id: "one-dark-pro", name: "One Dark Pro", type: "dark", source: "built-in" },
];

const DEFAULT_SETTINGS: ThemeSettings = {
  activeThemeId: "dark-plus",
  uiScale: "100",
  themes: BUILT_IN_THEMES,
};

export class ThemeStore {
  private readonly dataDir: string;
  private readonly themesDir: string;
  private readonly settingsPath: string;
  private settings: ThemeSettings = DEFAULT_SETTINGS;

  constructor(options: ThemeStoreOptions) {
    this.dataDir = options.dataDir;
    this.themesDir = join(this.dataDir, "themes");
    this.settingsPath = join(this.dataDir, "settings.json");
  }

  async init(): Promise<void> {
    await mkdir(this.themesDir, { recursive: true });
    await this.loadSettings();
  }

  async loadSettings(): Promise<ThemeSettings> {
    try {
      const text = await readFile(this.settingsPath, "utf-8");
      const parsed = JSON.parse(text) as unknown;
      this.settings = themeSettingsSchema.parse(parsed);
    } catch {
      this.settings = DEFAULT_SETTINGS;
      await this.saveSettings();
    }
    return this.settings;
  }

  async saveSettings(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }

  async getSettings(): Promise<ThemeSettings> {
    return this.settings;
  }

  async updateSettings(patch: {
    activeThemeId?: string;
    uiScale?: string;
  }): Promise<ThemeSettings> {
    if (patch.activeThemeId !== undefined) {
      this.settings = { ...this.settings, activeThemeId: patch.activeThemeId };
    }
    if (patch.uiScale !== undefined) {
      this.settings = { ...this.settings, uiScale: patch.uiScale as ThemeSettings["uiScale"] };
    }
    await this.saveSettings();
    return this.settings;
  }

  async listThemes(): Promise<ThemeRecord[]> {
    return this.settings.themes;
  }

  async getTheme(id: string): Promise<VsCodeTheme | null> {
    const record = this.settings.themes.find((t) => t.id === id);
    if (!record) return null;
    if (record.source === "built-in") {
      return null;
    }
    try {
      const text = await readFile(join(this.themesDir, `${id}.json`), "utf-8");
      return vsCodeThemeSchema.parse(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async importTheme(id: string, theme: VsCodeTheme): Promise<ThemeRecord> {
    const record: ThemeRecord = { id, name: theme.name, type: theme.type, source: "user" };
    await writeFile(join(this.themesDir, `${id}.json`), JSON.stringify(theme, null, 2));
    const themes = [...this.settings.themes.filter((t) => t.id !== id), record];
    this.settings = { ...this.settings, themes };
    await this.saveSettings();
    return record;
  }

  async deleteTheme(id: string): Promise<boolean> {
    const record = this.settings.themes.find((t) => t.id === id);
    if (!record || record.source === "built-in") return false;
    try {
      await rm(join(this.themesDir, `${id}.json`));
    } catch {
      // Ignore if file already gone.
    }
    const themes = this.settings.themes.filter((t) => t.id !== id);
    let activeThemeId = this.settings.activeThemeId;
    if (activeThemeId === id) {
      activeThemeId = "dark-plus";
    }
    this.settings = { ...this.settings, themes, activeThemeId };
    await this.saveSettings();
    return true;
  }
}
