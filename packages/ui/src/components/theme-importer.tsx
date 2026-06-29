import type { ThemeRecord } from "@singularity/shared";
import { useRef, useState } from "react";
import { Button } from "./primitives/button.js";

export interface ThemeImporterProps {
  onImported: (record: ThemeRecord) => void;
}

export function ThemeImporter({ onImported }: ThemeImporterProps): React.ReactElement {
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
      const json = JSON.parse(text) as unknown;
      // Basic validation: must have name, type, colors.
      if (
        typeof json !== "object" ||
        json === null ||
        !("name" in json) ||
        !("type" in json) ||
        !("colors" in json)
      ) {
        throw new Error("Invalid VS Code theme file");
      }
      const themeJson = json as { name: string; type: ThemeRecord["type"] };
      const slug = themeJson.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const record: ThemeRecord = {
        id: slug,
        name: themeJson.name,
        type: json.type as ThemeRecord["type"],
        source: "user",
      };
      onImported(record);
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
        className="hidden"
      />
      <Button onClick={handleClick} variant="ghost">
        Import theme…
      </Button>
      {error && <span className="text-sg-danger text-sg-font-xs">{error}</span>}
    </div>
  );
}
