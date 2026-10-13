import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node scripts/test-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
