import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sg: {
          background: "var(--sg-background)",
          foreground: "var(--sg-foreground)",
          sidebar: "var(--sg-sidebar-background)",
          panel: "var(--sg-panel-background)",
          accent: "var(--sg-accent)",
          "accent-foreground": "var(--sg-accent-foreground)",
          border: "var(--sg-border)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
