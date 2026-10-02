import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "@renderer": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url))
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  }
});
