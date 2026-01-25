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
