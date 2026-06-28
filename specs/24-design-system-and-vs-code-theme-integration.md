# Spec 24: Design System and VS Code Theme Integration

## Objective

Establish a single, theme-aware design system for Singularity v1.0 by parsing standard VS Code color theme JSON files, mapping VS Code tokens to app-wide CSS custom properties and a Tailwind theme preset, and driving Monaco Editor styling from the same theme source.

## Motivation

Singularity v1.0 replaces the previous VS Code extension shell with a standalone Tauri + web app that must still feel native to users who already use VS Code themes. A unified design system prevents the "unstyled elements thrown into the DOM" problem, guarantees that every panel (Channel Rack, Piano Roll, Playlist, Mixer, Browser, Graph, IDE) shares one visual language, and lets users import any VS Code theme without writing custom CSS.

## Scope

### In scope

- Zod schemas for standard VS Code color theme JSON files.
- A semantic app token model mapped from VS Code color identifiers to CSS custom properties.
- A Tailwind CSS preset that consumes those CSS custom properties plus static spacing, sizing, radius, shadow, and typography tokens.
- Theme provider component that applies the active theme to `:root` and to Monaco Editor at runtime.
- Built-in curated themes: Dark+, Light+, Dracula, and One Dark Pro.
- User theme import via file picker and backend persistence.
- UI scaling at 75%, 100%, 125%, 150%, and 200%.
- Foundational primitive components (`Button`, `IconButton`, `ToggleButton`, `TextInput`, `Select`, `Slider`) that consume the token system.
- Backend REST endpoints and WebSocket events for theme settings and user theme storage.

### Out of scope

- Dockable panel behavior and detachable multi-monitor windows (covered by the panel system spec).
- Custom layout save/load (covered by the workspace layout spec).
- Toolbar customization (covered by the toolbar spec).
- Hint panel / status bar implementation (covered by the shell chrome spec).
- VS Code extension embedder (dropped from v1.0 per `docs/decisions.md`); the theme system targets the Tauri desktop app and the web app only.

## Related decisions

- 2026-06-25 — Theme system based on VS Code themes (`docs/decisions.md`): use VS Code color theme JSON files as the base for the entire app theme system, including Monaco styling.
- 2026-06-25 — Theme system: CSS custom properties + Tailwind CSS (`docs/decisions.md`).
- 2026-06-25 — App and project rename to Singularity (`docs/decisions.md`): package names use `@singularity/*`.
- 2026-06-25 — VS Code extension target (`docs/decisions.md`): VS Code extension dropped from v1.0.
- 2026-06-25 — Monaco IDE integration (`docs/decisions.md`): Monaco is the in-app code editor and must share the active theme.

## Detailed design

### Subsystem overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UI Layer (React)                             │
│  ThemeProvider ──► :root CSS variables ──► Tailwind + components    │
│        │                                                             │
│        └───────────────────► Monaco defineTheme/setTheme             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼──────────────────────────────────────────┐
│                      Backend (Bun + Fastify)                         │
│  ThemeStore (user data dir)  │  /api/v1/themes  │  /settings/theme   │
└─────────────────────────────────────────────────────────────────────┘
```

The active theme is a global runtime setting. Built-in themes ship as static JSON in `packages/ui/src/themes/built-in`. User-imported themes are persisted by the backend in the user data directory and exposed through REST endpoints. All connected UI clients receive WebSocket events when the active theme or UI scale changes so detachable windows stay synchronized.

### Data model

`packages/shared/src/theme.ts`:

```ts
import { z } from 'zod';

export const vsCodeThemeTypeSchema = z.enum(['dark', 'light', 'hcDark', 'hcLight']);
export type VsCodeThemeType = z.infer<typeof vsCodeThemeTypeSchema>;

export const vsCodeTokenColorSchema = z.object({
  name: z.string().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  settings: z.record(z.unknown()),
});

export const vsCodeThemeSchema = z.object({
  name: z.string(),
  type: vsCodeThemeTypeSchema,
  colors: z.record(z.string()),
  tokenColors: z.array(vsCodeTokenColorSchema).optional(),
});
export type VsCodeTheme = z.infer<typeof vsCodeThemeSchema>;

export const uiScaleSchema = z.enum(['75', '100', '125', '150', '200']);
export type UiScale = z.infer<typeof uiScaleSchema>;

export const appColorTokenSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  panelBackground: z.string(),
  panelForeground: z.string(),
  panelBorder: z.string(),
  surface1: z.string(),
  surface2: z.string(),
  surface3: z.string(),
  border: z.string(),
  borderSubtle: z.string(),
  borderFocus: z.string(),
  accent: z.string(),
  accentForeground: z.string(),
  accentHover: z.string(),
  danger: z.string(),
  warning: z.string(),
  success: z.string(),
  info: z.string(),
  textPrimary: z.string(),
  textSecondary: z.string(),
  textDisabled: z.string(),
  meterGreen: z.string(),
  meterYellow: z.string(),
  meterRed: z.string(),
  playhead: z.string(),
  selection: z.string(),
  loopRegion: z.string(),
  gridLine: z.string(),
  gridLineSub: z.string(),
  gridLineBar: z.string(),
});
export type AppColorTokens = z.infer<typeof appColorTokenSchema>;

export const staticTokenSchema = z.object({
  space: z.record(z.string()),
  size: z.record(z.string()),
  radius: z.record(z.string()),
  shadow: z.record(z.string()),
  font: z.record(z.string()),
});
export type StaticTokens = z.infer<typeof staticTokenSchema>;

export const appTokensSchema = z.object({
  colors: appColorTokenSchema,
  static: staticTokenSchema,
});
export type AppTokens = z.infer<typeof appTokensSchema>;

export const themeRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: vsCodeThemeTypeSchema,
  source: z.enum(['built-in', 'user']),
});
export type ThemeRecord = z.infer<typeof themeRecordSchema>;

export const themeSettingsSchema = z.object({
  activeThemeId: z.string(),
  uiScale: uiScaleSchema,
  themes: z.array(themeRecordSchema),
});
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
```

`packages/shared/src/messages/theme.ts`:

```ts
import { z } from 'zod';
import { themeSettingsSchema, vsCodeThemeSchema } from '../theme.js';

export const themeChangedMessageSchema = z.object({
  type: z.literal('theme.changed'),
  payload: vsCodeThemeSchema,
});

export const themeScaleChangedMessageSchema = z.object({
  type: z.literal('theme.scaleChanged'),
  payload: z.object({ uiScale: z.enum(['75', '100', '125', '150', '200']) }),
});
```

### API / interface

`packages/ui/src/themes/resolve-tokens.ts`:

```ts
import type { AppColorTokens, VsCodeTheme } from '@singularity/shared';

export const VS_CODE_TO_APP_TOKEN_MAP: Record<keyof AppColorTokens, string[]> = {
  background: ['editor.background'],
  foreground: ['editor.foreground'],
  panelBackground: ['sideBar.background', 'activityBar.background'],
  panelForeground: ['sideBar.foreground', 'activityBar.foreground'],
  panelBorder: ['sideBar.border', 'activityBar.border'],
  surface1: ['list.inactiveSelectionBackground', 'editor.selectionHighlightBackground'],
  surface2: ['input.background'],
  surface3: ['dropdown.background'],
  border: ['panel.border', 'editorGroup.border'],
  borderSubtle: ['tree.indentGuidesStroke', 'editor.lineHighlightBackground'],
  borderFocus: ['focusBorder'],
  accent: ['button.background', 'focusBorder'],
  accentForeground: ['button.foreground'],
  accentHover: ['button.hoverBackground', 'button.background'],
  danger: ['errorForeground', 'gitDecoration.deletedResourceForeground'],
  warning: ['editorWarning.foreground', 'terminal.ansiYellow'],
  success: ['terminal.ansiGreen', 'gitDecoration.addedResourceForeground'],
  info: ['terminal.ansiCyan', 'editorInfo.foreground'],
  textPrimary: ['foreground'],
  textSecondary: ['descriptionForeground', 'foreground'],
  textDisabled: ['disabledForeground'],
  meterGreen: ['terminal.ansiGreen'],
  meterYellow: ['terminal.ansiYellow'],
  meterRed: ['terminal.ansiRed'],
  playhead: ['focusBorder'],
  selection: ['editor.selectionBackground'],
  loopRegion: ['editor.findMatchHighlightBackground'],
  gridLine: ['editor.lineHighlightBackground'],
  gridLineSub: ['tree.indentGuidesStroke'],
  gridLineBar: ['editor.lineHighlightBorder'],
};

export const APP_TOKEN_FALLBACKS: Record<keyof AppColorTokens, string> = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  panelBackground: '#252526',
  panelForeground: '#cccccc',
  panelBorder: '#3c3c3c',
  surface1: '#37373d',
  surface2: '#3c3c3c',
  surface3: '#3c3c3c',
  border: '#3c3c3c',
  borderSubtle: '#2a2d2e',
  borderFocus: '#007fd4',
  accent: '#0e639c',
  accentForeground: '#ffffff',
  accentHover: '#1177bb',
  danger: '#f48771',
  warning: '#cca700',
  success: '#89d185',
  info: '#75beff',
  textPrimary: '#cccccc',
  textSecondary: '#9cdcfe',
  textDisabled: '#808080',
  meterGreen: '#89d185',
  meterYellow: '#cca700',
  meterRed: '#f48771',
  playhead: '#007fd4',
  selection: '#264f78',
  loopRegion: '#514f38',
  gridLine: '#2a2d2e',
  gridLineSub: '#2a2d2e',
  gridLineBar: '#3c3c3c',
};

export function resolveAppTokens(theme: VsCodeTheme): AppColorTokens {
  const colors = theme.colors;
  const pick = (keys: string[], fallback: string): string => {
    for (const key of keys) {
      const value = colors[key];
      if (typeof value === 'string' && value.startsWith('#')) return value;
    }
    return fallback;
  };
  const result = {} as AppColorTokens;
  for (const key of Object.keys(VS_CODE_TO_APP_TOKEN_MAP) as Array<keyof AppColorTokens>) {
    result[key] = pick(VS_CODE_TO_APP_TOKEN_MAP[key], APP_TOKEN_FALLBACKS[key]);
  }
  return appColorTokenSchema.parse(result);
}
```

`packages/ui/src/themes/monaco-theme.ts`:

```ts
import type { VsCodeTheme } from '@singularity/shared';
import type * as monaco from 'monaco-editor';

export function toMonacoBase(theme: VsCodeTheme): 'vs' | 'vs-dark' | 'hc-black' | 'hc-light' {
  switch (theme.type) {
    case 'light':
      return 'vs';
    case 'hcDark':
      return 'hc-black';
    case 'hcLight':
      return 'hc-light';
    case 'dark':
    default:
      return 'vs-dark';
  }
}

export function toMonacoThemeData(theme: VsCodeTheme): monaco.editor.IStandaloneThemeData {
  return {
    base: toMonacoBase(theme),
    inherit: true,
    rules: (theme.tokenColors ?? []).flatMap((tc) => {
      const settings = tc.settings ?? {};
      const foreground = typeof settings.foreground === 'string' ? settings.foreground : undefined;
      const scopes = Array.isArray(tc.scope) ? tc.scope : tc.scope ? [tc.scope] : [];
      if (scopes.length === 0) return [];
      return scopes.map((scope) => ({ token: scope, foreground }));
    }),
    colors: theme.colors,
  };
}

export function slugifyThemeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
```

`packages/ui/src/themes/static-tokens.ts`:

```ts
import type { StaticTokens } from '@singularity/shared';

export const STATIC_TOKENS: StaticTokens = {
  space: {
    '0': '0',
    'px': '1px',
    '0.5': '0.125rem',
    '1': '0.25rem',
    '2': '0.5rem',
    '3': '0.75rem',
    '4': '1rem',
    '5': '1.25rem',
    '6': '1.5rem',
    '8': '2rem',
    '10': '2.5rem',
    '12': '3rem',
  },
  size: {
    toolbarHeight: '2.75rem',
    panelHeaderHeight: '2rem',
    channelRackStripHeight: '5rem',
    mixerStripWidth: '5rem',
    faderWidth: '1.5rem',
    buttonHeight: '1.75rem',
    buttonSmallHeight: '1.375rem',
    inputHeight: '1.75rem',
    rulerHeight: '1.5rem',
  },
  radius: {
    sm: '0.1875rem',
    md: '0.25rem',
    lg: '0.375rem',
    full: '9999px',
  },
  shadow: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.25)',
    md: '0 4px 12px 0 rgba(0, 0, 0, 0.25)',
  },
  font: {
    xs: '0.625rem',
    sm: '0.6875rem',
    base: '0.75rem',
    md: '0.8125rem',
    lg: '0.875rem',
    xl: '1rem',
  },
};

export const UI_SCALE_TO_ROOT_PX: Record<'75' | '100' | '125' | '150' | '200', number> = {
  '75': 12,
  '100': 16,
  '125': 20,
  '150': 24,
  '200': 32,
};
```

`packages/ui/src/components/theme-provider.tsx`:

```ts
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppColorTokens, AppTokens, ThemeRecord, ThemeSettings, UiScale, VsCodeTheme } from '@singularity/shared';

export interface ThemeContextValue {
  settings: ThemeSettings;
  tokens: AppTokens;
  activeTheme: VsCodeTheme;
  setTheme: (themeId: string) => Promise<void>;
  setUiScale: (scale: UiScale) => Promise<void>;
  importTheme: (file: File) => Promise<ThemeRecord>;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
```

Backend REST endpoints:

```
GET    /api/v1/settings/theme
PATCH  /api/v1/settings/theme
GET    /api/v1/themes
POST   /api/v1/themes/import
GET    /api/v1/themes/:id
DELETE /api/v1/themes/:id
```

`packages/backend/src/routes/themes.ts` request/response schemas:

```ts
import { z } from 'zod';
import { themeRecordSchema, vsCodeThemeSchema } from '@singularity/shared';

export const listThemesResponseSchema = z.object({
  themes: z.array(themeRecordSchema),
});

export const importThemeResponseSchema = themeRecordSchema;

export const getThemeResponseSchema = vsCodeThemeSchema;
```

`packages/backend/src/routes/settings.ts` request/response schemas:

```ts
import { z } from 'zod';
import { themeSettingsSchema, uiScaleSchema } from '@singularity/shared';

export const getThemeSettingsResponseSchema = themeSettingsSchema;

export const patchThemeSettingsRequestSchema = z.object({
  activeThemeId: z.string().optional(),
  uiScale: uiScaleSchema.optional(),
});
```

WebSocket events:

```
theme.changed     { vsCodeThemeSchema }
theme.scaleChanged { uiScale: UiScale }
```

### UI/UX

#### Token naming convention

All app color tokens are exposed as CSS custom properties on `:root` prefixed with `--sg-` and camel-cased keys converted to kebab-case:

```css
:root {
  --sg-background: #1e1e1e;
  --sg-foreground: #d4d4d4;
  --sg-panel-background: #252526;
  --sg-accent: #0e639c;
  --sg-meter-green: #89d185;
  /* ... */
}
```

Static tokens follow the same convention:

```css
:root {
  --sg-space-2: 0.5rem;
  --sg-size-toolbar-height: 2.75rem;
  --sg-radius-md: 0.25rem;
  --sg-shadow-md: 0 4px 12px 0 rgba(0, 0, 0, 0.25);
  --sg-font-base: 0.75rem;
}
```

#### Tailwind preset

`packages/ui/tailwind.preset.ts` exports a Tailwind preset consumed by `packages/web` and `packages/desktop`:

```ts
import type { Config } from 'tailwindcss';

export const tailwindPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        sg: {
          bg: 'var(--sg-background)',
          fg: 'var(--sg-foreground)',
          panel: {
            bg: 'var(--sg-panel-background)',
            fg: 'var(--sg-panel-foreground)',
            border: 'var(--sg-panel-border)',
          },
          surface: {
            1: 'var(--sg-surface-1)',
            2: 'var(--sg-surface-2)',
            3: 'var(--sg-surface-3)',
          },
          border: {
            DEFAULT: 'var(--sg-border)',
            subtle: 'var(--sg-border-subtle)',
            focus: 'var(--sg-border-focus)',
          },
          accent: {
            DEFAULT: 'var(--sg-accent)',
            fg: 'var(--sg-accent-foreground)',
            hover: 'var(--sg-accent-hover)',
          },
          danger: 'var(--sg-danger)',
          warning: 'var(--sg-warning)',
          success: 'var(--sg-success)',
          info: 'var(--sg-info)',
          text: {
            primary: 'var(--sg-text-primary)',
            secondary: 'var(--sg-text-secondary)',
            disabled: 'var(--sg-text-disabled)',
          },
          meter: {
            green: 'var(--sg-meter-green)',
            yellow: 'var(--sg-meter-yellow)',
            red: 'var(--sg-meter-red)',
          },
          playhead: 'var(--sg-playhead)',
          selection: 'var(--sg-selection)',
          loop: 'var(--sg-loop-region)',
          grid: {
            DEFAULT: 'var(--sg-grid-line)',
            sub: 'var(--sg-grid-line-sub)',
            bar: 'var(--sg-grid-line-bar)',
          },
        },
      },
      spacing: {
        px: 'var(--sg-space-px)',
        0.5: 'var(--sg-space-0-5)',
        1: 'var(--sg-space-1)',
        2: 'var(--sg-space-2)',
        3: 'var(--sg-space-3)',
        4: 'var(--sg-space-4)',
        5: 'var(--sg-space-5)',
        6: 'var(--sg-space-6)',
        8: 'var(--sg-space-8)',
        10: 'var(--sg-space-10)',
        12: 'var(--sg-space-12)',
      },
      borderRadius: {
        sm: 'var(--sg-radius-sm)',
        md: 'var(--sg-radius-md)',
        lg: 'var(--sg-radius-lg)',
        full: 'var(--sg-radius-full)',
      },
      fontSize: {
        xs: 'var(--sg-font-xs)',
        sm: 'var(--sg-font-sm)',
        base: 'var(--sg-font-base)',
        md: 'var(--sg-font-md)',
        lg: 'var(--sg-font-lg)',
        xl: 'var(--sg-font-xl)',
      },
      boxShadow: {
        sm: 'var(--sg-shadow-sm)',
        md: 'var(--sg-shadow-md)',
      },
    },
  },
};
```

#### Primitive components

`packages/ui/src/components/primitives/button.tsx`:

```ts
export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'toggle';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(...);
```

Required behavior:

- Height is `1.75rem` for `md` and `1.375rem` for `sm`.
- Padding is `0 0.625rem`.
- Border radius is `var(--sg-radius-md)`.
- `variant="toggle"` renders `aria-pressed` and uses the accent color when pressed.
- Disabled state sets `opacity: 0.5` and removes pointer events.

`packages/ui/src/components/primitives/text-input.tsx`:

```ts
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}
```

Required behavior:

- Height is `var(--sg-size-input-height)`.
- Background is `bg-sg-surface-2`.
- Border is `1px solid border-sg-border`.
- Focus ring uses `border-sg-border-focus`.

`packages/ui/src/components/primitives/select.tsx`:

```ts
export interface SelectOption { value: string; label: string; }

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
}
```

`packages/ui/src/components/primitives/slider.tsx`:

```ts
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  orientation?: 'horizontal' | 'vertical';
  valueLabel?: React.ReactNode;
}
```

`packages/ui/src/components/theme-selector.tsx`:

```ts
export interface ThemeSelectorProps {
  settings: ThemeSettings;
  onSelect: (themeId: string) => void;
}
```

`packages/ui/src/components/theme-importer.tsx`:

```ts
export interface ThemeImporterProps {
  onImported: (record: ThemeRecord) => void;
}
```

### Algorithms / behavior

#### Theme activation flow

1. `ThemeProvider` fetches `/api/v1/settings/theme` on mount.
2. It resolves the active `VsCodeTheme` from the built-in bundle or the backend theme store.
3. `resolveAppTokens(theme)` produces `AppColorTokens`.
4. The provider writes every token to `:root` as a CSS custom property.
5. The provider calls `monaco.editor.defineTheme(slug, toMonacoThemeData(theme))` and `monaco.editor.setTheme(slug)`.
6. If the user chooses a different theme, the provider sends `PATCH /api/v1/settings/theme` and the backend broadcasts `theme.changed` to all connected clients.

#### Fallback chain

`resolveAppTokens` walks each mapped VS Code token key in order. If a key is missing, malformed, or not a hex color, it tries the next key in the chain. If the entire chain is exhausted, it uses the hardcoded `APP_TOKEN_FALLBACKS` value. The output is validated with `appColorTokenSchema.parse` so the app never receives `undefined` tokens.

#### UI scaling

Changing the UI scale sets `document.documentElement.style.fontSize = `${UI_SCALE_TO_ROOT_PX[scale]}px`;`. Because Tailwind spacing, sizing, and font tokens use rem units, the entire UI scales proportionally without per-component logic. Canvas editors read computed CSS variables when they need pixel values.

#### Monaco synchronization

Monaco themes are registered once per theme slug. If the active theme changes, only `setTheme` is called; `defineTheme` is only called again if the theme content has not been registered. This avoids re-registering built-in themes on every panel mount.

#### User theme import

1. User selects a `.json` file through the native file dialog or `<input type="file">`.
2. The UI reads the file as text and validates it with `vsCodeThemeSchema.safeParse`.
3. If valid, the file is uploaded as `multipart/form-data` to `POST /api/v1/themes/import`.
4. The backend stores the JSON in the user data directory under `themes/` and returns a `ThemeRecord`.
5. The backend appends the new theme to `themeSettings.themes` and broadcasts `theme.changed` if the user opts to activate it immediately.

## Implementation plan

1. Add `packages/shared/src/theme.ts` and `packages/shared/src/messages/theme.ts` with the Zod schemas and types above.
2. Add built-in theme JSON files under `packages/ui/src/themes/built-in/` for Dark+, Light+, Dracula, and One Dark Pro.
3. Implement `resolveAppTokens`, `toMonacoThemeData`, `static-tokens`, and the Tailwind preset in `packages/ui/src/themes/`.
4. Implement `ThemeProvider`, `useTheme`, `ThemeSelector`, and `ThemeImporter` in `packages/ui/src/components/`.
5. Implement the five primitive components (`Button`, `TextInput`, `Select`, `Slider`, `ToggleButton`) in `packages/ui/src/components/primitives/`.
6. Implement backend theme store and Fastify routes in `packages/backend/src/routes/themes.ts` and `packages/backend/src/routes/settings.ts`.
7. Wire WebSocket broadcast for `theme.changed` and `theme.scaleChanged` in the backend connection manager.
8. Configure `packages/web/tailwind.config.ts` and `packages/desktop/tailwind.config.ts` to import the preset from `packages/ui`.
9. Write unit tests for token resolution, Monaco conversion, and schema validation.
10. Write E2E test that switches themes and scales and asserts DOM/Monaco updates.

## Testing strategy

- **Unit tests** in `packages/ui/src/themes/__tests__/`:
  - `resolveAppTokens` returns valid tokens for every built-in theme without missing-token warnings.
  - `toMonacoThemeData` returns the correct `base` for each `VsCodeThemeType`.
  - `vsCodeThemeSchema` rejects invalid/malformed theme JSON.
- **Unit tests** in `packages/shared/src/__tests__/`:
  - All theme Zod schemas compile and round-trip sample data.
- **Integration tests** in `packages/backend/src/routes/__tests__/`:
  - `GET /api/v1/themes` returns built-in themes.
  - `POST /api/v1/themes/import` accepts a valid VS Code theme and rejects an invalid one with HTTP 400.
  - `PATCH /api/v1/settings/theme` persists the active theme and UI scale.
- **E2E tests** in `packages/web/e2e/` or `packages/desktop/e2e/`:
  - Open the theme selector, switch from Dark+ to Light+, and assert the computed `background-color` of the app root and the Monaco editor surface both change from dark to light.
  - Change UI scale from 100% to 150% and assert `document.documentElement.style.fontSize` becomes `24px`.
  - Import a community VS Code theme file and assert it appears in the theme selector and applies correctly.

## Acceptance criteria

- [ ] `packages/shared/src/theme.ts` exports `vsCodeThemeSchema`, `appColorTokenSchema`, `staticTokenSchema`, `appTokensSchema`, `themeSettingsSchema`, `uiScaleSchema`, and `themeRecordSchema` with 100% field coverage.
- [ ] `packages/ui/src/themes/vs-code-map.ts` defines `VS_CODE_TO_APP_TOKEN_MAP` with a fallback chain and `APP_TOKEN_FALLBACKS` for every key of `AppColorTokens`.
- [ ] `packages/ui/src/themes/built-in/` contains valid VS Code theme JSON files named `dark-plus.json`, `light-plus.json`, `dracula.json`, and `one-dark-pro.json`.
- [ ] `resolveAppTokens(theme)` returns a value that passes `appColorTokenSchema.parse` for all built-in themes and logs a warning for every token that required a fallback.
- [ ] `toMonacoThemeData(theme)` returns `base: 'vs'` for `light`, `'vs-dark'` for `dark`, `'hc-black'` for `hcDark`, and `'hc-light'` for `hcLight` themes.
- [ ] `ThemeProvider` writes every app color token to `:root` as a CSS custom property and calls `monaco.editor.setTheme(slugifyThemeId(theme.name))` within one animation frame of the active theme changing.
- [ ] `packages/ui/tailwind.preset.ts` maps every app color token to a `colors.sg.*` key and every static token to `spacing`, `borderRadius`, `fontSize`, or `boxShadow`.
- [ ] Setting the UI scale to `75`, `100`, `125`, `150`, or `200` sets the document root font-size to `12px`, `16px`, `20px`, `24px`, or `32px` respectively.
- [ ] Backend exposes `GET /api/v1/themes`, `POST /api/v1/themes/import`, `GET /api/v1/themes/:id`, `DELETE /api/v1/themes/:id`, `GET /api/v1/settings/theme`, and `PATCH /api/v1/settings/theme` with request/response shapes validated by the shared Zod schemas.
- [ ] `POST /api/v1/themes/import` returns HTTP 400 with a Zod error message when the uploaded file is not a valid VS Code theme.
- [ ] `theme.changed` and `theme.scaleChanged` WebSocket events are broadcast to every connected UI client when the active theme or UI scale changes.
- [ ] All primitive components (`Button`, `TextInput`, `Select`, `Slider`, `ToggleButton`) are implemented in `packages/ui/src/components/primitives/` and consume only Tailwind classes that reference design tokens.
- [ ] No new arbitrary Tailwind values (e.g. `w-[123px]`) or inline styles are introduced in components that consume the design system.
- [ ] E2E test passes: switching from Dark+ to Light+ updates both the app root background color and the Monaco editor background color from dark to light.

## Dependencies

- Spec 17: Singularity v1.0 Standalone App Architecture — provides the monorepo layout, the Rsbuild + React + Tailwind stack, and the backend/UI communication paths.
- Spec 18: Monorepo and Build System — the Tailwind preset and shared package imports require the workspace build wiring to be functional.
- Spec 19: Shared Protocol and Schemas — this spec extends the shared schema package with theme-specific Zod types.

## Blocks

- Spec 26: Core DAW Panels — Channel Rack, Piano Roll, Playlist, Mixer, Browser, and Graph panels depend on the design tokens and primitive components defined here.
- Spec 35: AI Agent System — Monaco IDE theming and editor chrome depend on the theme provider and `toMonacoThemeData` conversion defined here.

## Notes / open questions

- The exact community themes to ship were not listed in the parity spec. This spec selects Dracula and One Dark Pro because they are popular, freely licensed, and exercise both dark and light variants; the list can be expanded before release.
- VS Code themes sometimes use non-hex color values (e.g. `rgba()`, `hsl()`). `resolveAppTokens` currently accepts any string returned by VS Code and passes it to the CSS custom property; canvas editors that read computed values will receive the browser-computed hex. If a theme uses a non-color value, the fallback is used.
- High-contrast themes (`hcDark`, `hcLight`) are supported for Monaco and app tokens, but canvas editor grid styling may need additional hard-coded contrast adjustments in the panel specs.
