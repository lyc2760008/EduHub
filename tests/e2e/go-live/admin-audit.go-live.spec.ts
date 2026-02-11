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
      // Audit log uses the shared admin table error panel.
      .getByTestId("admin-table-error")
      .isVisible()
      .catch(() => false);
    expect(errorVisible).toBeFalsy();

    // Audit filters live inside the shared filter sheet (Step 21.3 admin table toolkit).
    await page.getByTestId("audit-log-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    // Keep go-live smoke focused on a stable, non-date filter (date presets can be flaky around midnight).
    await page.getByTestId("audit-actor-filter").selectOption("parent");
    await page.getByTestId("admin-filters-sheet-close").click();

    // Assert via filter chips (toolkit output) instead of select values (URL-driven state can lag).
    await expect(page.getByTestId("audit-log-search-filter-chip-actorType")).toBeVisible();

    // Wait for rows or empty state to replace the loading placeholder.
    await expect
      .poll(async () => {
        const rowCount = await page.getByTestId("audit-row-action").count();
        if (rowCount > 0) return "rows";
        // Scope to the desktop table container to avoid matching the hidden mobile empty panel.
        const emptyVisible = await page
          .getByTestId("audit-table-container")
          .getByTestId("admin-table-empty")
          .isVisible()
          .catch(() => false);
        return emptyVisible ? "empty" : "loading";
      })
      .toMatch(/rows|empty/);

    const rowCount = await page.getByTestId("audit-row-action").count();
    const emptyVisible = await page
      .getByTestId("audit-table-container")
      .getByTestId("admin-table-empty")
      .isVisible()
      .catch(() => false);

    if (rowCount === 0 && emptyVisible) {
      await expect(
        page
          .getByTestId("audit-table-container")
          .getByTestId("admin-table-empty"),
      ).toBeVisible();
      return;
    }

    // Click the row container (not the cell span) because the row handles navigation/drawer open.
    // Scope to `tr[...]` so we don't accidentally match `audit-row-action` spans.
    const firstRow = page.locator('tr[data-testid^="audit-row-"]').first();
    await firstRow.click();
    await expect(page.getByTestId("audit-detail-drawer")).toBeVisible();
  });
});
