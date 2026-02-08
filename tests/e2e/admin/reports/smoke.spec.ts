// Reports smoke coverage validates admin discoverability and basic render health for reports v1.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../../helpers/auth";
import { assertTenantContext, buildTenantPath } from "../../helpers/tenant";
import { expectReportsPageLoaded, resolveTenantSlug } from "./_helpers";

test.describe("Admin Reports Smoke", () => {
  test("[regression][reports] admin can open reports index and report pages", async ({
    page,
  }) => {
    const tenantSlug = resolveTenantSlug();

    await loginAsAdmin(page, tenantSlug);
    await assertTenantContext(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));
    await expectReportsPageLoaded(page);
    await expect(page.getByTestId("nav-link-reports")).toBeVisible();

    // Follow each card CTA to ensure routes are reachable and table shell mounts without error banners.
    await page.goto(buildTenantPath(tenantSlug, "/admin/reports/upcoming-sessions"));
    await expect(page.getByTestId("report-upcoming-sessions")).toBeVisible();
    await expect(page.getByTestId("admin-table-error")).toHaveCount(0);

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports/absence-requests"));
    await expect(page.getByTestId("report-absence-requests")).toBeVisible();
    await expect(page.getByTestId("admin-table-error")).toHaveCount(0);

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports/students-directory"));
    await expect(page.getByTestId("report-students-directory")).toBeVisible();
    await expect(page.getByTestId("admin-table-error")).toHaveCount(0);

    // i18n sanity check: rendered page content should not leak raw translation key paths.
    await expect(page.locator("body")).not.toContainText("admin.reports.");
    await expect(page.locator("body")).not.toContainText("admin.table.");
  });
});
