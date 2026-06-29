import type { ThemeRecord, VsCodeTheme } from "@singularity/shared";
import darkPlus from "./dark-plus.json";
import dracula from "./dracula.json";
import lightPlus from "./light-plus.json";
import oneDarkPro from "./one-dark-pro.json";

export const BUILT_IN_THEMES = {
  darkPlus,
  lightPlus,
  dracula,
  oneDarkPro,
};

export const BUILT_IN_THEME_LIST = [darkPlus, lightPlus, dracula, oneDarkPro];

export const BUILT_IN_THEME_RECORDS: Array<ThemeRecord & { theme: VsCodeTheme }> = [
  {
    id: "dark-plus",
    name: darkPlus.name,
    type: darkPlus.type as VsCodeTheme["type"],
    source: "built-in",
    theme: darkPlus as VsCodeTheme,
  },
  {
    id: "light-plus",
    name: lightPlus.name,
    type: lightPlus.type as VsCodeTheme["type"],
    source: "built-in",
    theme: lightPlus as VsCodeTheme,
  },
  {
    id: "dracula",
    name: dracula.name,
    type: dracula.type as VsCodeTheme["type"],
    source: "built-in",
    theme: dracula as VsCodeTheme,
  },
  {
    id: "one-dark-pro",
    name: oneDarkPro.name,
    type: oneDarkPro.type as VsCodeTheme["type"],
    source: "built-in",
    theme: oneDarkPro as VsCodeTheme,
  },
];
