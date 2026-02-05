// i18n smoke test for absence request surfaces in portal and admin (Step 20.4C).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import {
  buildPortalPath,
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Absence request i18n", () => {
  test("Portal session detail and admin requests render in EN + zh-CN", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(
      buildPortalPath(
        tenantSlug,
        `/sessions/${fixtures.absenceSessionIds.happy}`,
      ),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();

    const nav = page.getByTestId("parent-nav");
    await expect(nav).toContainText("My Students");

    await page.getByTestId("parent-language-toggle").click();
    // Validate zh-CN rendering using a stable nav label.
    await expect(nav).toContainText("我的孩子");

    const portalBody = await page.locator("body").innerText();
    const portalKeyPattern = /(^|\s)(portal|parent)\.[a-z0-9_.-]+/i;
    expect(portalKeyPattern.test(portalBody)).toBeFalsy();

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    await expect(page.getByTestId("requests-page")).toBeVisible();
    await expect(page.getByTestId("requests-page")).toContainText(
      "Absence requests",
    );

    // Toggle locale cookie directly for admin since there is no UI switch.
    await page.evaluate(() => {
      document.cookie = "locale=zh-CN; path=/";
    });
    await page.reload();

    await expect(page.getByTestId("requests-page")).toContainText("请假申请");

    const adminBody = await page.locator("body").innerText();
    const adminKeyPattern = /(^|\s)admin\.[a-z0-9_.-]+/i;
    expect(adminKeyPattern.test(adminBody)).toBeFalsy();
  });
});


