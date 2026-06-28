import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: "./src/index.tsx",
    },
  },
  html: {
    template: "./public/index.html",
  },
  output: {
    target: "web",
    sourceMap: {
      js: "source-map",
      css: true,
    },
    filenameHash: true,
  },
});
