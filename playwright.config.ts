// Playwright config for minimal E2E coverage of Centers flows.
// Load .env so E2E_* variables are available to the test runner.
import "dotenv/config";
import { defineConfig } from "@playwright/test";

const ADMIN_STORAGE_STATE = "tests/e2e/.auth/admin.json";
const PARENT_STORAGE_STATE = "tests/e2e/.auth/parent.json";

export default defineConfig({
  testDir: "./tests/e2e",
  // Global setup keeps the dedicated e2e tenant fixtures ready for all specs.
  globalSetup: "./tests/e2e/global-setup.ts",
  // Cap workers to reduce local dev server flakiness; override with E2E_WORKERS.
  workers: Number(process.env.E2E_WORKERS || 4),
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
  // Project splits keep smoke fast while allowing portal/admin suites to reuse auth state.
  projects: [
    {
      name: "setup-admin",
      testDir: "./tests/e2e/setup",
      testMatch: /.*admin\.setup\.ts/,
    },
    {
      name: "setup-parent",
      testDir: "./tests/e2e/setup",
      testMatch: /.*parent\.setup\.ts/,
    },
    {
      name: "smoke-chromium",
      testDir: "./tests/e2e/smoke",
      dependencies: ["setup-admin"],
      use: {
        storageState: ADMIN_STORAGE_STATE,
      },
    },
    {
      name: "portal-chromium",
      testDir: "./tests/e2e/portal",
      dependencies: ["setup-parent"],
      use: {
        storageState: PARENT_STORAGE_STATE,
      },
    },
    {
      name: "admin-chromium",
      testDir: "./tests/e2e/admin",
      dependencies: ["setup-admin"],
      use: {
        storageState: ADMIN_STORAGE_STATE,
      },
    },
    {
      name: "golden-chromium",
      testDir: "./tests/e2e/golden",
      dependencies: ["setup-admin", "setup-parent"],
      use: {
        storageState: PARENT_STORAGE_STATE,
      },
    },
  ],
});
