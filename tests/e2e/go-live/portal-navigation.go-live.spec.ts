// Go-live smoke: parent portal navigation with stable selectors and minimal assertions.
import { expect, test } from "@playwright/test";

import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveGoLiveParentAccess } from "../helpers/go-live";
import { buildTenantPath } from "../helpers/tenant";

function resolveGoLiveTenantSlug() {
  // Prefer an explicit go-live tenant slug, then fall back to the default e2e tenant.
  return (
    process.env.E2E_GO_LIVE_TENANT_SLUG ||
    process.env.E2E_TENANT_SLUG ||
    "e2e-testing"
  );
}

// Parent access is resolved via a shared helper so staging runs can reset access codes.

// Tagged for go-live suite filtering.
test.describe("[go-live] Parent portal navigation", () => {
  test("[go-live][prod-safe] Parent login page renders", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();

    await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    await expect(page.getByTestId("parent-login-email")).toBeVisible();
    await expect(page.getByTestId("parent-login-access-code")).toBeVisible();
    await expect(page.getByTestId("parent-login-submit")).toBeVisible();
  });

  test("[go-live] Parent can navigate dashboard, students, sessions, and attendance", async ({
    page,
  }) => {
    const tenantSlug = resolveGoLiveTenantSlug();
    const { email, accessCode } = await resolveGoLiveParentAccess(page, tenantSlug);

    await loginAsParentWithAccessCode(page, tenantSlug, email, accessCode);

    await page.goto(buildTenantPath(tenantSlug, "/portal"));
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
    await expect(page.getByTestId("portal-dashboard-error")).toHaveCount(0);

    await page
      .locator('[data-testid="parent-nav"] a[href*="/portal/students"]')
      .first()
      .click();
    await expect(page.getByTestId("portal-students-page")).toBeVisible();
    await expect(page.getByTestId("portal-students-error")).toHaveCount(0);

    const studentCard = page
      .locator('[data-testid^="portal-student-card-"]')
      .first();
    if ((await studentCard.count()) === 0) {
      // Skip when staging lacks linked students (common when e2e fixtures are not seeded).
      test.skip(
        true,
        "No linked students found. Seed portal data or provide go-live fixtures.",
      );
      return;
    }
    await studentCard.click();
    await expect(page.getByTestId("portal-student-detail-page")).toBeVisible();

    await page.getByTestId("portal-tab-attendance").click();
    await expect(page.getByTestId("portal-student-attendance")).toBeVisible();
    await expect(page.getByTestId("portal-attendance-error")).toHaveCount(0);

    await page
      .locator('[data-testid="parent-nav"] a[href*="/portal/sessions"]')
      .first()
      .click();
    await expect(page.getByTestId("portal-sessions-page")).toBeVisible();
    await expect(page.getByTestId("portal-sessions-error")).toHaveCount(0);

    const sessionRow = page
      .locator('[data-testid^="portal-session-row-"]')
      .first();
    if ((await sessionRow.count()) === 0) {
      // Skip when staging lacks upcoming sessions (common when e2e fixtures are not seeded).
      test.skip(
        true,
        "No upcoming sessions found. Seed portal data or provide go-live fixtures.",
      );
      return;
    }
    await sessionRow.click();
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
  });
});
