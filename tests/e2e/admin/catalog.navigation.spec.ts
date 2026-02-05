// Catalog navigation smoke test ensures AdminNav and catalog cards route correctly.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { assertTenantContext, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Catalog navigation", () => {
  test("Admin can open Catalog and navigate to Subjects", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    // Tenant context check ensures the session is scoped to the expected tenant.
    await assertTenantContext(page, tenantSlug);

    const catalogPath = buildTenantPath(tenantSlug, "/admin/catalog");
    const subjectsPath = buildTenantPath(tenantSlug, "/admin/subjects");

    // Navigate to the catalog hub via AdminNav to exercise active-state logic.
    await page.getByTestId("nav-link-catalog").click();
    await page.waitForURL((url) => url.pathname.startsWith(catalogPath));

    await expect(page.getByTestId("catalog-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-catalog")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Use the subjects card to reach the Subjects page without relying on text.
    await page.getByTestId("catalog-card-subjects").click();
    await page.waitForURL((url) => url.pathname.startsWith(subjectsPath));

    await expect(page.getByTestId("subjects-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-catalog")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});



