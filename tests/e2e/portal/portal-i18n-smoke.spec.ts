// i18n smoke tests for parent portal UI (EN + zh-CN toggle).
import { expect, test } from "@playwright/test";

import {
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "..\/helpers/portal";

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent portal i18n", () => {
  test("Dashboard renders in EN and zh-CN without raw keys", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();

    const nav = page.getByTestId("parent-nav");
    await expect(nav).toContainText("My Students");

    await page.getByTestId("parent-language-toggle").click();
    await expect(nav).toContainText("我的孩子");

    const bodyText = await page.locator("body").innerText();
    // Guard against raw i18n keys while allowing emails/usernames that may contain "parent.".
    const keyPattern = /(^|\s)(portal|parent)\.[a-z0-9_.-]+/i;
    expect(keyPattern.test(bodyText)).toBeFalsy();
  });
});


