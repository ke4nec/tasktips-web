import { defineConfig, devices } from "@playwright/test";

// E2E 默认跑本地 dev 服务器（npm run dev，端口 5174）。
// CI 中可用 `npx playwright test` 配合 webServer 自动拉起。
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5174/app/",
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
