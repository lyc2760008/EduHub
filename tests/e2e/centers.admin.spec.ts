// Admin centers smoke test covering create + list behavior.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";

test.describe("Centers - Admin smoke", () => {
  test("Admin can open Centers page, create a center, and see it in list", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const uniqueName = `E2E Center ${Date.now()}`;

    await loginViaUI(page, { email, password, tenantSlug });

    // Navigate through the admin centers URL for the tenant.
    await page.goto(`/${tenantSlug}/admin/centers`);

    await expect(page.getByTestId("centers-page")).toBeVisible();

    await page.getByTestId("create-center-button").click();
    await page.getByTestId("center-name-input").fill(uniqueName);
    await page
      .getByTestId("center-timezone-select")
      .fill("America/Edmonton");
    await page.getByTestId("save-center-button").click();

    await expect(page.getByTestId("centers-table")).toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });
});
