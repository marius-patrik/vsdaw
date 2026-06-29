import type { ThemeSettings } from "@singularity/shared";
import { Select } from "./primitives/select.js";

export interface ThemeSelectorProps {
  settings: ThemeSettings;
  onSelect: (themeId: string) => void;
}

export function ThemeSelector({ settings, onSelect }: ThemeSelectorProps): React.ReactElement {
  return (
    <Select
      aria-label="Active theme"
      value={settings.activeThemeId}
      onChange={(event) => onSelect(event.target.value)}
      options={settings.themes.map((theme) => ({ value: theme.id, label: theme.name }))}
    />
  );
}
