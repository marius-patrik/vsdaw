# Spec 15: UI Design System and Visual Coherence

## Problem Statement

User feedback: the UI looks like "a bunch of unstyled elements just thrown into the DOM" with no coherence or intelligence. A code audit confirms the problem:

- Inline styles are used everywhere with arbitrary values.
- Tailwind utility classes are mixed inconsistently with inline styles.
- No shared spacing, sizing, border-radius, or shadow tokens.
- No layout grid or rhythm; components fight each other for space.
- Track headers, mixer strips, and canvas controls each use different visual languages.
- Form controls (selects, inputs, sliders, buttons) are unstyled native elements.
- No empty-state hierarchy; placeholder text blends into the chrome.

## Goals

1. Establish a single design-system file that owns spacing, typography, color, border, shadow, and radius tokens.
2. Refactor core components to use those tokens and a consistent layout grid.
3. Unify the visual language of buttons, inputs, sliders, toggles, and menus.
4. Redesign TrackHeader, MixerStrip, TimelineCanvas, and BrowserTree to look deliberate and coherent.
5. Ensure the UI honors the active VS Code theme without fighting it.
6. Keep the implementation incremental and testable.

## Design Tokens

Add a CSS-in-JS theme layer in `src/components/shared/DesignTokens.tsx` (or extend `ThemeProvider`) with:

```ts
const tokens = {
  space: {
    0: 0,
    px: 1,
    0.5: 2,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
  },
  size: {
    toolbarHeight: 44,
    trackHeaderWidth: 200,
    trackHeaderMinHeight: 64,
    mixerStripWidth: 80,
    faderWidth: 24,
    buttonHeight: 28,
    buttonSmallHeight: 22,
    inputHeight: 28,
  },
  radius: {
    sm: 3,
    md: 4,
    lg: 6,
    full: 9999,
  },
  border: {
    width: 1,
    focusWidth: 2,
  },
  font: {
    xs: 10,
    sm: 11,
    base: 12,
    md: 13,
    lg: 14,
    xl: 16,
  },
  shadow: {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.25)",
    md: "0 4px 12px rgba(0,0,0,0.25)",
  },
};
```

Expose these as CSS custom properties plus a React `useTokens()` hook so components can reference `tokens.size.toolbarHeight` or `var(--vsdaw-space-2)`.

## Color Tokens (extend ThemeProvider)

Add semantic color roles:

```css
--vsdaw-surface-0:     /* deepest background */
--vsdaw-surface-1:     /* panel background */
--vsdaw-surface-2:     /* elevated elements */
--vsdaw-surface-3:     /* inputs / hover */
--vsdaw-border-subtle: /* separators */
--vsdaw-border-default:/* interactive borders */
--vsdaw-border-focus:  /* focus rings */
--vsdaw-text-primary:  /* primary labels */
--vsdaw-text-secondary:/* muted labels */
--vsdaw-text-disabled: /* disabled state */
--vsdaw-accent:        /* primary accent */
--vsdaw-accent-hover:  /* accent hover */
--vsdaw-danger:        /* record / delete */
--vsdaw-warning:       /* mute */
--vsdaw-success:       /* armed / active */
```

Map these from VS Code theme variables so the UI stays theme-aware.

## Layout Grid

Adopt a strict layout system:

- **Toolbar**: fixed `44px` height, horizontal flex with three zones (left, center, right), gap `8px`, padding `8px 12px`.
- **Track header column**: fixed `200px` width, matches the timeline canvas row heights.
- **Mixer strip**: fixed `80px` width, full panel height, shared channel-strip chrome.
- **Canvas / content areas**: fill remaining space, single-pixel grid lines, consistent ruler height (`24px`).
- **Gutters**: `4px` minimum, `8px` standard, `12px` section separators.

## Component Standards

### Buttons

Create a single `Button` component with variants:

- `default` — secondary, subtle background.
- `primary` — accent background.
- `ghost` — transparent, only hover background.
- `toggle` — same shape as default, active state uses accent color.
- `danger` — for record/arm/delete.

All buttons have:

- height `28px` (or `22px` for `size="sm"`).
- padding `0 10px`.
- border-radius `4px`.
- `aria-pressed` when toggled.
- disabled state with reduced opacity.

### Inputs / Selects

Create `TextInput`, `Select`, `NativeSelect` components:

- height `28px`.
- background `surface-3`.
- border `1px solid border-default`.
- border-radius `4px`.
- focus ring `1px solid border-focus`.
- placeholder / secondary text color.

### Sliders

Create a styled range input (`Slider`) with:

- consistent track height and thumb size.
- vertical orientation support for mixer faders.
- value label slot.

### Toggle buttons (M/S/R)

Use the `Button` toggle variant. Keep letters/icons centered. Active state uses semantic color.

## Track Header Redesign

Current issues: stacked inline blocks, mismatched select boxes, floating buttons.

Proposed structure (top-to-bottom):

1. **Name row** (28px): color swatch, name input, menu button (right-aligned).
2. **I/O row** (24px): output select + input select (audio tracks only) on one line.
3. **MSR row** (28px): Mute / Solo / Record toggle buttons.
4. **Slider row** (28px): VOL slider + value label.
5. **Slider row** (28px): PAN slider + value label.
6. **Insert row** (optional): collapsed insert slots or "+" button.

Use the design tokens for every dimension. Remove the floating menus; use the menu button for insert/automation actions.

## Mixer Strip Redesign

Current issues: tiny targets, vertical text, fader looks like a system slider, no visual grouping.

Proposed structure (top-to-bottom, inside an `80px` strip):

1. **Track color dot** (8px) + name label (horizontal, truncated, not vertical).
2. **MSR row** (24px): M/S/R toggles.
3. **Insert slots** (4 x 16px): small clickable slots with device initials.
4. **Meter + Fader** (fill): styled vertical fader beside a level meter.
5. **dB readout** (14px).
6. **Pan slider** (24px).

Add a subtle left border and alternating surface tint so strips read as a single channel bank.

## Timeline Canvas Improvements

- Draw a consistent grid: bar lines, beat lines, sub-division lines with opacity levels.
- Region blocks: rounded corners `4px`, slight shadow, track color tint, name label.
- Playhead: bright accent line with a triangle handle at the ruler.
- Loop range: highlighted region in the ruler.
- Automation lanes: clear lane separators, points as small circles with hover/selected state.

## Browser Tree Improvements

- Indent guide lines.
- Consistent row height `24px`.
- Folder chevron icon aligned with text.
- Device/plugin icons with category color.
- Hover and active states from semantic tokens.

## Empty States

Replace generic centered text with a structured empty state:

- Larger icon.
- Primary action button (e.g. "Add track").
- Secondary hint text.

## Implementation Phases

### Phase 1 — Design tokens

- Create `DesignTokens.tsx` / extend `ThemeProvider`.
- Add `useTokens()` hook.
- Add CSS custom properties to global style.

### Phase 2 — Primitive components

- `Button`, `IconButton`, `ToggleButton`, `TextInput`, `Select`, `Slider`.
- Replace ad-hoc inline buttons in Toolbar, TrackHeader, MixerStrip.

### Phase 3 — Layout shells

- Refactor `PanelShell`, `Toolbar`, `TrackColumnHeader` to use tokens.
- Fix track/canvas row height synchronization.

### Phase 4 — Component redesigns

- `TrackHeader` new layout.
- `MixerStrip` new layout.
- `TimelineCanvas` grid and region styling.
- `BrowserTree` row styling.

### Phase 5 — Polish

- Empty states.
- Focus rings.
- Disabled states.
- Loading placeholders.

## Acceptance Criteria

- [ ] No new arbitrary inline style values; all dimensions come from tokens.
- [ ] Buttons, inputs, selects, and sliders share a single component set.
- [ ] Track headers, mixer strips, and timeline canvas use the same visual language.
- [ ] The UI is readable at 13px base font and honors the VS Code theme.
- [ ] All existing tests still pass.
- [ ] Screenshots of Timeline, Mixer, Piano Roll, Browser, and Graph views are attached to the PR for design review.

## Out of Scope

- Changing the fundamental architecture (custom editor + separate webview panels).
- New animations beyond the existing fade-in.
- Native plugin editor windows.
