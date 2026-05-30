import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.BROWSER_HARNESS_PORT ?? "5173", 10);
const harnessPort = Number.isFinite(port) ? port : 5173;
const baseURL = `http://127.0.0.1:${harnessPort}/browser-harness.html`;

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "node scripts/browser-harness.mjs",
    env: {
      BROWSER_HARNESS_PORT: String(harnessPort),
      BROWSER_HARNESS_STRICT_PORT: "true"
    },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: baseURL
  }
});
