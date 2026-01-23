// UI login helper for Playwright tests with tenant-aware routes.
import { expect, Page } from "@playwright/test";

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

  await page.goto(`/${tenantSlug}/login`);
  await page.getByTestId("login-email").fill(opts.email);
  await page.getByTestId("login-password").fill(opts.password);
  await page.getByTestId("login-submit").click();

  // Wait for the tenant admin route to confirm session establishment.
  await page.waitForURL(new RegExp(`/${tenantSlug}/admin`));

  const postLoginMarker = page.locator(
    '[data-testid="app-shell"], [data-testid="access-denied"]'
  );
  await expect(postLoginMarker.first()).toBeVisible();
}
