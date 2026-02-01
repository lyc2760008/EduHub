// i18n smoke test for the parent portal session detail view.
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
} from "./helpers/portal";
import { resolveStep203Fixtures } from "./helpers/step203";

test.describe("Portal session detail i18n", () => {
  test("Session detail renders in EN and zh-CN without raw keys", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(
      buildPortalPath(tenantSlug, `/sessions/${fixtures.pastSessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();

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
