// Admin centers smoke test covering create + list behavior.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { uniqueString } from "..\/helpers/data";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Centers - Admin smoke", () => {
  test("Admin can open Centers page, create a center, and see it in list", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const uniqueName = uniqueString("E2E Center");

    await loginViaUI(page, { email, password, tenantSlug });

    // Use tenant-aware paths to support subdomain or /t/<slug> routing.
    await page.goto(buildTenantPath(tenantSlug, "/admin/centers"));

    await expect(page.getByTestId("centers-page")).toBeVisible();

    await page.getByTestId("create-center-button").click();
    await page.getByTestId("center-name-input").fill(uniqueName);
    // Timezone is a select element; use selectOption for stable E2E behavior.
    await page
      .getByTestId("center-timezone-select")
      .selectOption("America/Edmonton");
    await page.getByTestId("save-center-button").click();

    await expect(page.getByTestId("centers-table")).toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });
});




