// Reports admin smoke coverage: nav link, page load, and tenant context assertion.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { assertTenantContext, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Reports - admin smoke", () => {
  test("Admin can open Reports via AdminNav and see active state", async ({
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

    // Tenant context check ensures /api/me resolves the expected tenant and role.
    await assertTenantContext(page, tenantSlug);

    const reportsPath = buildTenantPath(tenantSlug, "/admin/reports");

    await expect(page.getByTestId("admin-nav")).toBeVisible();

    // Use the nav link so the active state is driven by routing.
    await page.getByTestId("nav-link-reports").click();
    await page.waitForURL((url) => url.pathname.startsWith(reportsPath));

    await expect(page.getByTestId("reports-page")).toBeVisible();
    await expect(page.getByTestId("report-upcoming-sessions")).toBeVisible();
    await expect(page.getByTestId("report-weekly-attendance")).toBeVisible();
    await expect(page.getByTestId("report-student-activity")).toBeVisible();

    // aria-current signals which nav link is active without relying on CSS classes.
    await expect(page.getByTestId("nav-link-reports")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});



