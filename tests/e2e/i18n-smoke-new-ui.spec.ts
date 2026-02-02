// i18n smoke test for staff absence panel + attendance banner (EN + zh-CN).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { ensurePortalAbsenceRequest } from "./helpers/absence-requests";
import { loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep205Fixtures } from "./helpers/step205";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Staff absence i18n smoke", () => {
  test("Session detail renders staff absence UI in EN + zh-CN", async ({ page }) => {
    const fixtures = resolveStep205Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.absenceStaffSessionIds.pending;
    const studentId = fixtures.studentId;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId,
      reasonCode: "ILLNESS",
      message: "i18n coverage",
    });

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();
    await expect(page.getByTestId(`attendance-absence-banner-${studentId}`)).toBeVisible();

    await expect(page.getByTestId("absence-request-panel")).toContainText(
      "Absence request",
    );

    // Toggle locale cookie directly for admin since there is no UI switch.
    await page.evaluate(() => {
      document.cookie = "locale=zh-CN; path=/";
    });
    await page.reload();

    await expect(page.getByTestId("absence-request-panel")).toContainText("请假申请");
    await expect(page.getByTestId(`attendance-absence-banner-${studentId}`)).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    const keyPattern = /(^|\s)staff\.absence\.[a-z0-9_.-]+/i;
    expect(keyPattern.test(bodyText)).toBeFalsy();
  });
});
