import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  define: {
    __VERSION__: JSON.stringify(process.env.VERSION ?? "dev"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
