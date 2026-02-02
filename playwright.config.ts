// Playwright config for minimal E2E coverage of Centers flows.
// Load .env so E2E_* variables are available to the test runner.
import "dotenv/config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Global setup keeps the dedicated e2e tenant fixtures ready for all specs.
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Default to the dedicated e2e tenant host to keep dev data isolated.
    baseURL: process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
