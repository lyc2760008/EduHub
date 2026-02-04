// Trust-layer smoke checks for header identity and account/help pages.
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "./helpers/portal";

test.describe("Parent portal trust header + pages", () => {
  test("Header identity, account, and help pages render", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `Portal trust tests must target the e2e-testing tenant; got ${tenantSlug}.`,
      );
    }
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    const identityTrigger = page.locator(
      '[data-testid="portal-identity-trigger"]:visible',
    );
    await expect(identityTrigger).toBeVisible();
    await expect(identityTrigger).toContainText(credentials.email);

    await identityTrigger.click();
    await expect(
      page.locator('[data-testid="portal-identity-dropdown"]:visible'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="portal-identity-account"]:visible'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="portal-identity-help"]:visible'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="portal-identity-logout"]:visible'),
    ).toBeVisible();

    await page.goto(buildPortalPath(tenantSlug, "/account"));
    await expect(page.getByTestId("portal-account-page")).toBeVisible();
    await expect(page.getByTestId("portal-account-email")).toContainText(
      credentials.email,
    );
    await expect(page.getByTestId("portal-account-students")).toBeVisible();

    const tenantLabel = page.getByTestId("portal-account-tenant");
    if ((await tenantLabel.count()) > 0) {
      await expect(tenantLabel).toHaveText(/\S+/);
    }

    await page.goto(buildPortalPath(tenantSlug, "/help"));
    await expect(page.getByTestId("portal-help-page")).toBeVisible();
    await expect(page.getByTestId("portal-help-accordion")).toBeVisible();
  });
});
