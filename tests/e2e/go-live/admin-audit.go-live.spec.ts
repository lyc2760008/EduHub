// Go-live smoke: admin audit log access with read-only filters.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import { buildTenantPath } from "../helpers/tenant";

function resolveGoLiveTenantSlug() {
  // Prefer an explicit go-live tenant slug, then fall back to the default e2e tenant.
  return (
    process.env.E2E_GO_LIVE_TENANT_SLUG ||
    process.env.E2E_TENANT_SLUG ||
    "e2e-testing"
  );
}

// Tagged for go-live suite filtering (safe for production when creds are read-only).
test.describe("[go-live][prod-safe] Admin audit access", () => {
  test("[go-live][prod-safe] Admin can open audit log and filters", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();

    await loginAsAdmin(page, tenantSlug);
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));

    await expect(page.getByTestId("audit-log-page")).toBeVisible();
    await expect(page.getByTestId("audit-log")).toBeVisible();
    // Check error state non-blockingly to avoid hanging when the element is not rendered at all.
    const errorVisible = await page
      .getByTestId("audit-error-state")
      .isVisible()
      .catch(() => false);
    expect(errorVisible).toBeFalsy();

    await page.getByTestId("audit-range-filter").selectOption("7d");
    await page.getByTestId("audit-category-filter").selectOption("auth");
    await page.getByTestId("audit-actor-filter").selectOption("parent");

    await expect(page.getByTestId("audit-range-filter")).toHaveValue("7d");
    await expect(page.getByTestId("audit-category-filter")).toHaveValue("auth");
    await expect(page.getByTestId("audit-actor-filter")).toHaveValue("parent");

    // Wait for rows or empty state to replace the loading placeholder.
    await expect
      .poll(async () => {
        const rowCount = await page.getByTestId("audit-row-action").count();
        if (rowCount > 0) return "rows";
        const emptyVisible = await page
          .getByTestId("audit-empty-state")
          .isVisible()
          .catch(() => false);
        return emptyVisible ? "empty" : "loading";
      })
      .toMatch(/rows|empty/);

    const rowCount = await page.getByTestId("audit-row-action").count();
    const emptyVisible = await page
      .getByTestId("audit-empty-state")
      .isVisible()
      .catch(() => false);

    if (rowCount === 0 && emptyVisible) {
      await expect(page.getByTestId("audit-empty-state")).toBeVisible();
      return;
    }

    const firstRowAction = page.getByTestId("audit-row-action").first();
    await firstRowAction.click();
    await expect(page.getByTestId("audit-detail-drawer")).toBeVisible();
  });
});
