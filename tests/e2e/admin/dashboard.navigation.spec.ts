// Admin dashboard navigation smoke test using stable data-testid hooks.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { assertTenantContext, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Admin dashboard navigation", () => {
  test("Admin can navigate to Sessions and Reports from dashboard widgets", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });

    // Tenant context check ensures the session is scoped to the expected tenant.
    await assertTenantContext(page, tenantSlug);

    const dashboardPath = buildTenantPath(tenantSlug, "/admin");
    const sessionsPath = buildTenantPath(tenantSlug, "/admin/sessions");
    const reportsPath = buildTenantPath(tenantSlug, "/admin/reports");

    await page.waitForURL((url) => url.pathname.startsWith(dashboardPath));
    await expect(page.getByTestId("admin-dashboard-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-dashboard")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Navigate to Sessions via the dashboard widget link.
    await page
      .getByTestId("upcoming-sessions-widget")
      .getByTestId("view-all-sessions-link")
      .click();
    await page.waitForURL((url) => url.pathname.startsWith(sessionsPath));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-sessions")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Return to the dashboard to use the Reports widget link.
    await page.getByTestId("nav-link-dashboard").click();
    await page.waitForURL((url) => url.pathname.startsWith(dashboardPath));
    await expect(page.getByTestId("admin-dashboard-page")).toBeVisible();

    // Navigate to Reports via the weekly attendance widget link.
    await page
      .getByTestId("weekly-attendance-widget")
      .getByTestId("view-full-report-link")
      .click();
    await page.waitForURL((url) => url.pathname.startsWith(reportsPath));
    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-reports")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});



