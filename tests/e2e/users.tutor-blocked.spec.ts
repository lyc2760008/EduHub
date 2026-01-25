// Tutor access test verifying users page is blocked for non-admin roles.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Users - Tutor access blocked", () => {
  test("Tutor cannot access /admin/users", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error("Missing E2E_TUTOR_EMAIL or E2E_TUTOR_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/users"));

    await expect(page.getByTestId("users-page")).toHaveCount(0);
    await expect(page.getByTestId("access-denied")).toBeVisible();
  });
});
