import { ThemeImporter, ThemeProvider, ThemeSelector, useTheme } from "@singularity/ui";
import { useId, useState } from "react";

function ThemeControls() {
  const { settings, setTheme, setUiScale } = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const themeId = useId();
  const scaleId = useId();

  const handleScaleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    await setUiScale(event.target.value as typeof settings.uiScale);
    setMessage(`Scale set to ${event.target.value}%`);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sg-font-lg font-semibold text-sg-text-primary">Singularity Theme Test</h1>
      <div className="flex items-center gap-2">
        <label htmlFor={themeId} className="text-sg-text-secondary">
          Theme
        </label>
        <ThemeSelector id={themeId} settings={settings} onSelect={setTheme} />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={scaleId} className="text-sg-text-secondary">
          UI Scale
        </label>
        <select
          id={scaleId}
          value={settings.uiScale}
          onChange={handleScaleChange}
          className="h-sg-size-input-height rounded-md border border-sg-border bg-sg-surface-2 px-2 text-sg-text-primary"
          data-testid="ui-scale-select"
        >
          <option value="75">75%</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
          <option value="200">200%</option>
        </select>
      </div>
      <ThemeImporter />
      {message && <p className="text-sg-font-sm text-sg-info">{message}</p>}
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ThemeControls />
    </ThemeProvider>
  );
}
