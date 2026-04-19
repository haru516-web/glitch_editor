import { defineConfig } from "vite";

export default defineConfig({
  base: "/glitch_editor/",
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
