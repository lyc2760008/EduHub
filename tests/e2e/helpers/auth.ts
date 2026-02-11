// UI login helper for Playwright tests with tenant-aware routes.
import { expect, Page } from "@playwright/test";

import { buildTenantApiPath, buildTenantPath } from "./tenant";

type LoginOptions = {
  email: string;
  password: string;
  tenantSlug?: string;
};

function isTransientNetworkError(error: unknown) {
  // Treat ECONNRESET-style failures as transient so login can fall back to UI flow.
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ECONNREFUSED|socket hang up/i.test(error.message);
}

async function tryGetSession(page: Page, tenantSlug: string) {
  try {
    return await page.request.get(buildTenantApiPath(tenantSlug, "/api/me"));
  } catch (error) {
    if (isTransientNetworkError(error)) {
      try {
        return await page.request.get(buildTenantApiPath(tenantSlug, "/api/me"));
      } catch {
        return null;
      }
    }
    throw error;
  }
}

/**
 * UI login helper.
 * Replace selectors if the login page structure changes.
 */
export async function loginViaUI(page: Page, opts: LoginOptions) {
  const tenantSlug =
    // Default to the dedicated e2e tenant to avoid polluting demo data.
    opts.tenantSlug || process.env.E2E_TENANT_SLUG || "e2e-testing";
  const adminPath = buildTenantPath(tenantSlug, "/admin");
  const postLoginMarker = page.locator(
    '[data-testid="app-shell"], [data-testid="access-denied"]'
  );

  // Skip login when an existing session already matches the expected user.
  const sessionResponse = await tryGetSession(page, tenantSlug);
  if (sessionResponse && sessionResponse.status() === 200) {
    const payload = (await sessionResponse.json()) as {
      user?: { email?: string };
      tenant?: { tenantSlug?: string };
    };
    if (
      payload.user?.email?.toLowerCase() === opts.email.toLowerCase() &&
      payload.tenant?.tenantSlug === tenantSlug
    ) {
      // Ensure the UI is on an admin route even when reusing a storage session.
      await page.goto(adminPath, { waitUntil: "domcontentloaded" });
      await Promise.race([
        page.waitForURL((url) => url.pathname.startsWith(adminPath), {
          timeout: 20_000,
        }),
        postLoginMarker.first().waitFor({ state: "visible", timeout: 20_000 }),
      ]);
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

  // Callback redirects can lag under load; accept either admin URL or shell render as successful login.
  await Promise.race([
    page.waitForURL((url) => url.pathname.startsWith(adminPath), {
      timeout: 20_000,
    }),
    postLoginMarker.first().waitFor({ state: "visible", timeout: 20_000 }),
  ]).catch(async () => {
    // Fallback navigation keeps admin login resilient when callback redirects stall.
    await page.goto(adminPath, { waitUntil: "domcontentloaded" });
  });

  await expect(postLoginMarker.first()).toBeVisible();
}

type ApiLoginOptions = {
  email: string;
  password: string;
  tenantSlug?: string;
  callbackPath?: string;
};

// Deterministic credential login for storageState setup avoids UI flakiness on remote STAGING.
export async function loginViaCredentialsApi(
  page: Page,
  opts: ApiLoginOptions,
) {
  const tenantSlug =
    opts.tenantSlug || process.env.E2E_TENANT_SLUG || "e2e-testing";
  const callbackPath = opts.callbackPath || `/${tenantSlug}/admin`;
  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();
  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  const csrfToken = csrfPayload.csrfToken?.trim();
  if (!csrfToken) {
    throw new Error("Expected csrfToken from /api/auth/csrf.");
  }

  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
  form.set("email", opts.email);
  form.set("password", opts.password);
  // Credentials provider uses tenantSlug to resolve membership under shared hosts.
  form.set("tenantSlug", tenantSlug);
  form.set("callbackUrl", callbackPath);
  form.set("json", "true");

  const callbackResponse = await page.request.post(
    "/api/auth/callback/credentials?json=true",
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      data: form.toString(),
    },
  );
  expect([200, 302]).toContain(callbackResponse.status());

  // Verify a tenant-scoped session exists before tests reuse this storage state file.
  const meResponse = await page.request.get(buildTenantApiPath(tenantSlug, "/api/me"), {
    headers: {
      "x-tenant-slug": tenantSlug,
    },
  });
  expect(meResponse.status()).toBe(200);
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

// Tutor API-login wrapper is used by setup-tutor to create deterministic storage state.
export async function loginAsTutorViaApi(page: Page, tenantSlug?: string) {
  const { email, password } = resolveTutorCredentials();
  const resolvedTenant = resolveTenantSlug(tenantSlug);
  await loginViaCredentialsApi(page, {
    email,
    password,
    tenantSlug: resolvedTenant,
    callbackPath: `/${resolvedTenant}/tutor/sessions`,
  });
  return { email, tenantSlug: resolvedTenant };
}

// Parent login wrapper mirrors admin/tutor helpers for RBAC coverage.
export async function loginAsParent(page: Page, tenantSlug?: string) {
  const { email, password } = resolveParentCredentials();
  const resolvedTenant = resolveTenantSlug(tenantSlug);
  await loginViaUI(page, { email, password, tenantSlug: resolvedTenant });
  return { email, tenantSlug: resolvedTenant };
}
