import { vsCodeThemeSchema } from "@singularity/shared";
import { useRef, useState } from "react";
import { Button } from "./primitives/button.js";
import { useTheme } from "./theme-provider.js";

export function ThemeImporter(): React.ReactElement {
  const { importTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      vsCodeThemeSchema.parse(parsed);
      await importTheme(file);
      event.target.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import theme");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleChange}
        className="sr-only"
        data-testid="theme-file-input"
      />
      <Button onClick={handleClick} variant="ghost">
        Import theme…
      </Button>
      {error && <span className="text-sg-danger text-sg-font-xs">{error}</span>}
    </div>
  );
}
