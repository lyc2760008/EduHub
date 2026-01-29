// UI login helper for Playwright tests with tenant-aware routes.
import { expect, Page } from "@playwright/test";

import { buildTenantPath } from "./tenant";

type LoginOptions = {
  email: string;
  password: string;
  tenantSlug?: string;
};

/**
 * UI login helper.
 * Replace selectors if the login page structure changes.
 */
export async function loginViaUI(page: Page, opts: LoginOptions) {
  const tenantSlug =
    opts.tenantSlug || process.env.E2E_TENANT_SLUG || "demo";

  const loginPath = buildTenantPath(tenantSlug, "/login");
  // Use tenant-aware paths so tests work with subdomain or /t/<slug> base URLs.
  await page.goto(loginPath);
  await page.getByTestId("login-email").fill(opts.email);
  await page.getByTestId("login-password").fill(opts.password);
  await page.getByTestId("login-submit").click();

  // Wait for the tenant admin route to confirm session establishment.
  const adminPath = buildTenantPath(tenantSlug, "/admin");
  await page.waitForURL((url) => url.pathname.startsWith(adminPath));

  const postLoginMarker = page.locator(
    '[data-testid="app-shell"], [data-testid="access-denied"]'
  );
  await expect(postLoginMarker.first()).toBeVisible();
}

// Env helpers keep login credentials centralized for deterministic auth setup.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env var.`);
  }
  return value;
}

function resolveTenantSlug(override?: string) {
  return override || process.env.E2E_TENANT_SLUG || "demo";
}

function resolveTutorCredentials() {
  const email = process.env.E2E_TUTOR_EMAIL || process.env.E2E_TUTOR1_EMAIL;
  const password =
    process.env.E2E_TUTOR_PASSWORD || process.env.E2E_TUTOR1_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing E2E_TUTOR_EMAIL/E2E_TUTOR_PASSWORD (or E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD) env vars.",
    );
  }

  return { email, password };
}

// Admin login wrapper keeps env resolution and tenant defaults consistent.
export async function loginAsAdmin(page: Page, tenantSlug?: string) {
  const email = requireEnv("E2E_ADMIN_EMAIL");
  const password = requireEnv("E2E_ADMIN_PASSWORD");
  const resolvedTenant = resolveTenantSlug(tenantSlug);
  await loginViaUI(page, { email, password, tenantSlug: resolvedTenant });
  return { email, tenantSlug: resolvedTenant };
}

// Tutor login wrapper mirrors admin login for RBAC coverage.
export async function loginAsTutor(page: Page, tenantSlug?: string) {
  const { email, password } = resolveTutorCredentials();
  const resolvedTenant = resolveTenantSlug(tenantSlug);
  await loginViaUI(page, { email, password, tenantSlug: resolvedTenant });
  return { email, tenantSlug: resolvedTenant };
}
