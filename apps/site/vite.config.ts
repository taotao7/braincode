import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/braincode/",
  define: {
    __VERSION__: JSON.stringify(process.env.VERSION ?? "dev"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
