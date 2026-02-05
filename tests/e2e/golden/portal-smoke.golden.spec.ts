// Golden path: parent portal navigation smoke coverage.
import { expect, test } from "@playwright/test";

import { buildPortalPath, loginParentWithAccessCode } from "../helpers/portal";
import { resolveStep203Fixtures } from "../helpers/step203";

// Tagged for Playwright suite filtering.
test.describe("[golden] Parent portal smoke", () => {
  test("[golden] Parent can navigate dashboard, students, sessions, and detail pages", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(buildPortalPath(tenantSlug));
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();

    const adminLinks = page.locator(
      '[data-testid="parent-shell"] a[href*="/admin"]',
    );
    await expect(adminLinks).toHaveCount(0);

    await page
      .locator('[data-testid="parent-nav"] a[href*="/portal/students"]')
      .first()
      .click();
    await expect(page.getByTestId("portal-students-page")).toBeVisible();
    await expect(page.getByTestId("portal-students-list")).toBeVisible();

    const studentCard = page.getByTestId(
      `portal-student-card-${fixtures.studentId}`,
    );
    await expect(studentCard).toBeVisible();
    await studentCard.click();
    await expect(page.getByTestId("portal-student-detail-page")).toBeVisible();
    await page.getByTestId("portal-tab-attendance").click();
    await expect(page.getByTestId("portal-student-attendance")).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="portal-attendance-list"], [data-testid="portal-attendance-empty"], [data-testid="portal-attendance-error"], [data-testid="portal-attendance-loading"]',
      ),
    ).toHaveCount(1);

    await page
      .locator('[data-testid="parent-nav"] a[href*="/portal/sessions"]')
      .first()
      .click();
    await expect(page.getByTestId("portal-sessions-page")).toBeVisible();
    await expect(page.getByTestId("portal-sessions-list")).toBeVisible();

    const sessionRow = page.getByTestId(
      `portal-session-row-${fixtures.upcomingSessionId}`,
    );
    await expect(sessionRow).toBeVisible();
    await sessionRow.click();
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
  });
});
