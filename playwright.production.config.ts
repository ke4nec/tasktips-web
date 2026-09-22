import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5175", ...devices["Desktop Chrome"] },
  webServer: {
    command: "node tests/production/server.mjs",
    url: "http://127.0.0.1:5175/app/",
    reuseExistingServer: false,
  },
});
