// Logout should revoke portal access across direct URLs and history.
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "./helpers/portal";

test.describe("Parent portal logout", () => {
  test("Logout blocks portal pages until login", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `Portal logout tests must target the e2e-testing tenant; got ${tenantSlug}.`,
      );
    }
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    const identityTrigger = page.locator(
      '[data-testid="portal-identity-trigger"]:visible',
    );
    await expect(identityTrigger).toBeVisible();
    await identityTrigger.click();
    await expect(
      page.locator('[data-testid="portal-identity-dropdown"]:visible'),
    ).toBeVisible();
    await page.locator('[data-testid="portal-identity-logout"]:visible').click();

    await expect(page.getByTestId("parent-login-page")).toBeVisible();

    await page.goto(buildPortalPath(tenantSlug));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    // Some layouts keep the shell mounted; assert portal content is not visible instead.
    await expect(page.getByTestId("portal-dashboard-page")).toHaveCount(0);

    await page.goto(buildPortalPath(tenantSlug, "/account"));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    await expect(page.getByTestId("portal-account-page")).toHaveCount(0);

    await page.goBack();
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    await expect(page.getByTestId("portal-dashboard-page")).toHaveCount(0);
  });
});
