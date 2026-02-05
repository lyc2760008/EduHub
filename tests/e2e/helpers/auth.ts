// UI login helper for Playwright tests with tenant-aware routes.
import { expect, Page } from "@playwright/test";

import { buildTenantApiPath, buildTenantPath } from "./tenant";

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
    // Default to the dedicated e2e tenant to avoid polluting demo data.
    opts.tenantSlug || process.env.E2E_TENANT_SLUG || "e2e-testing";

  // Skip login when an existing session already matches the expected user.
  const sessionResponse = await page.request.get(
    buildTenantApiPath(tenantSlug, "/api/me"),
  );
  if (sessionResponse.status() === 200) {
    const payload = (await sessionResponse.json()) as {
      user?: { email?: string };
      tenant?: { tenantSlug?: string };
    };
    if (
      payload.user?.email?.toLowerCase() === opts.email.toLowerCase() &&
      payload.tenant?.tenantSlug === tenantSlug
    ) {
      return;
    }
    // Clear mismatched sessions to avoid role-based redirects during login.
    await page.context().clearCookies();
  }

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
  // Keep helper defaults aligned with the dedicated e2e tenant.
  return override || process.env.E2E_TENANT_SLUG || "e2e-testing";
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

function resolveParentCredentials() {
  // Prefer explicit E2E parent creds, then fall back to seed defaults.
  const email = process.env.E2E_PARENT_EMAIL || process.env.SEED_PARENT_EMAIL;
  const password =
    process.env.E2E_PARENT_PASSWORD || process.env.SEED_PARENT_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing E2E_PARENT_EMAIL/E2E_PARENT_PASSWORD (or SEED_PARENT_EMAIL/SEED_PARENT_PASSWORD) env vars.",
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

// Parent login wrapper mirrors admin/tutor helpers for RBAC coverage.
export async function loginAsParent(page: Page, tenantSlug?: string) {
  const { email, password } = resolveParentCredentials();
  const resolvedTenant = resolveTenantSlug(tenantSlug);
  await loginViaUI(page, { email, password, tenantSlug: resolvedTenant });
  return { email, tenantSlug: resolvedTenant };
}
