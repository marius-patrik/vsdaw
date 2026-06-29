import type { Config } from "tailwindcss";

export const tailwindPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        sg: {
          bg: "var(--sg-background)",
          fg: "var(--sg-foreground)",
          panel: {
            bg: "var(--sg-panel-background)",
            fg: "var(--sg-panel-foreground)",
            border: "var(--sg-panel-border)",
          },
          surface: {
            1: "var(--sg-surface-1)",
            2: "var(--sg-surface-2)",
            3: "var(--sg-surface-3)",
          },
          border: {
            DEFAULT: "var(--sg-border)",
            subtle: "var(--sg-border-subtle)",
            focus: "var(--sg-border-focus)",
          },
          accent: {
            DEFAULT: "var(--sg-accent)",
            fg: "var(--sg-accent-foreground)",
            hover: "var(--sg-accent-hover)",
          },
          danger: "var(--sg-danger)",
          warning: "var(--sg-warning)",
          success: "var(--sg-success)",
          info: "var(--sg-info)",
          text: {
            primary: "var(--sg-text-primary)",
            secondary: "var(--sg-text-secondary)",
            disabled: "var(--sg-text-disabled)",
          },
          meter: {
            green: "var(--sg-meter-green)",
            yellow: "var(--sg-meter-yellow)",
            red: "var(--sg-meter-red)",
          },
          playhead: "var(--sg-playhead)",
          selection: "var(--sg-selection)",
          loop: "var(--sg-loop-region)",
          grid: {
            DEFAULT: "var(--sg-grid-line)",
            sub: "var(--sg-grid-line-sub)",
            bar: "var(--sg-grid-line-bar)",
          },
        },
      },
      spacing: {
        px: "var(--sg-space-px)",
        0.5: "var(--sg-space-0-5)",
        1: "var(--sg-space-1)",
        2: "var(--sg-space-2)",
        3: "var(--sg-space-3)",
        4: "var(--sg-space-4)",
        5: "var(--sg-space-5)",
        6: "var(--sg-space-6)",
        8: "var(--sg-space-8)",
        10: "var(--sg-space-10)",
        12: "var(--sg-space-12)",
      },
      borderRadius: {
        sm: "var(--sg-radius-sm)",
        md: "var(--sg-radius-md)",
        lg: "var(--sg-radius-lg)",
        full: "var(--sg-radius-full)",
      },
      fontSize: {
        xs: "var(--sg-font-xs)",
        sm: "var(--sg-font-sm)",
        base: "var(--sg-font-base)",
        md: "var(--sg-font-md)",
        lg: "var(--sg-font-lg)",
        xl: "var(--sg-font-xl)",
      },
      boxShadow: {
        sm: "var(--sg-shadow-sm)",
        md: "var(--sg-shadow-md)",
      },
    },
  },
};
