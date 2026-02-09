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

// Skip heavy suites when fixtures are unavailable and seeding is disabled.
const skipPortal =
  (process.env.E2E_SKIP_SEED || "").trim() === "1" &&
  (process.env.E2E_ALLOW_UNSEEDED_PORTAL || "").trim() !== "1";
const skipAdmin =
  (process.env.E2E_SKIP_SEED || "").trim() === "1" &&
  (process.env.E2E_ALLOW_UNSEEDED_ADMIN || "").trim() !== "1";
const skipGolden =
  (process.env.E2E_SKIP_SEED || "").trim() === "1" &&
  (process.env.E2E_ALLOW_UNSEEDED_GOLDEN || "").trim() !== "1";

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
    // Inject tenant headers when the base URL doesn't encode tenant context.
    extraHTTPHeaders: (() => {
      const tenantSlug = process.env.E2E_TENANT_SLUG;
      if (!tenantSlug) return undefined;
      const flag = (process.env.E2E_TENANT_HEADER || "").trim().toLowerCase();
      if (flag === "1" || flag === "true") {
        return { "x-tenant-slug": tenantSlug };
      }
      const baseUrl = process.env.E2E_BASE_URL || "";
      try {
        const { hostname, pathname } = new URL(baseUrl);
        const normalizedPath = pathname.replace(/\/+$/, "");
        const normalizedHost = hostname.toLowerCase();
        const normalizedSlug = tenantSlug.toLowerCase();
        if (normalizedPath.startsWith("/t/")) return undefined;
        if (normalizedHost.startsWith(`${normalizedSlug}.`)) return undefined;
        return { "x-tenant-slug": tenantSlug };
      } catch {
        return undefined;
      }
    })(),
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
      testIgnore: skipPortal ? /./ : undefined,
    },
    {
      name: "admin-chromium",
      testDir: "./tests/e2e/admin",
      dependencies: ["setup-admin"],
      use: {
        storageState: ADMIN_STORAGE_STATE,
      },
      testIgnore: skipAdmin ? /./ : undefined,
    },
    {
      name: "golden-chromium",
      testDir: "./tests/e2e/golden",
      dependencies: ["setup-admin", "setup-parent"],
      use: {
        storageState: PARENT_STORAGE_STATE,
      },
      testIgnore: skipGolden ? /./ : undefined,
    },
    {
      name: "go-live-chromium",
      testDir: "./tests/e2e/go-live",
      // Go-live specs manage auth within each test to support staging/prod runs.
    },
  ],
});
