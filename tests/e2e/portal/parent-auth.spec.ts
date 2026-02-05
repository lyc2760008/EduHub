// Parent portal auth smoke tests (access-code login + session persistence).
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "..\/helpers/portal";

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent portal auth", () => {
  test("Parent login lands on /portal and persists on refresh", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    await expect(page.getByTestId("parent-shell")).toBeVisible();
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${buildPortalPath(tenantSlug, "")}`));

    await page.reload();
    await expect(page.getByTestId("parent-shell")).toBeVisible();
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
  });
});


