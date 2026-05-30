import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@renderer": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url))
    }
  },
  test: {
    environment: "node",
    exclude: ["tests/visual/**", "node_modules/**", "dist/**", "dist-electron/**"],
    globals: true,
    server: {
      deps: {
        inline: ["tasmota-webserial-esptool"]
      }
    },
    setupFiles: ["./src/renderer/test/setupDexie.ts"]
  }
});
