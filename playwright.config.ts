// Playwright config for minimal E2E coverage of Centers flows.
// Load .env so E2E_* variables are available to the test runner.
import "dotenv/config";
import { defineConfig } from "@playwright/test";

const ADMIN_STORAGE_STATE = "tests/e2e/.auth/admin.json";
const PARENT_STORAGE_STATE = "tests/e2e/.auth/parent.json";

type TraceMode = "off" | "on" | "retain-on-failure" | "on-first-retry" | "on-all-retries";
type ScreenshotMode = "off" | "on" | "only-on-failure";
type VideoMode = "off" | "on" | "retain-on-failure" | "on-first-retry";

function asEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  const normalized = value.trim() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Global setup keeps the dedicated e2e tenant fixtures ready for all specs.
  globalSetup: "./tests/e2e/global-setup.ts",
  // Cap workers to reduce local dev server saturation during full regression loops.
  workers: Number(process.env.E2E_WORKERS || 2),
  // Retry once by default to absorb transient browser/network flakes in local/STAGING runs.
  retries: Number(process.env.E2E_RETRIES || 1),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Default to the dedicated e2e tenant host to keep dev data isolated.
    baseURL: process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000",
    // Allow local debugging to opt into headed mode without changing config.
    headless: (process.env.E2E_HEADLESS || "true").trim().toLowerCase() !== "false",
    // Artifact capture can dominate runtime when many tests fail; keep defaults but allow env overrides.
    trace: asEnum<TraceMode>(process.env.E2E_TRACE, ["off", "on", "retain-on-failure", "on-first-retry", "on-all-retries"] as const, "retain-on-failure"),
    screenshot: asEnum<ScreenshotMode>(process.env.E2E_SCREENSHOT, ["off", "on", "only-on-failure"] as const, "only-on-failure"),
    video: asEnum<VideoMode>(process.env.E2E_VIDEO, ["off", "on", "retain-on-failure", "on-first-retry"] as const, "retain-on-failure"),
  },
  // Include HTML report output for go-live gating and operator review.
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
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
    {
      name: "go-live-chromium",
      testDir: "./tests/e2e/go-live",
      // Go-live specs manage auth within each test to support staging/prod runs.
    },
  ],
});
