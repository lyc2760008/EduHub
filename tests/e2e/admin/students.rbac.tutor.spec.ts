// Tutor RBAC test to ensure students admin screen remains restricted.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Students - Tutor RBAC", () => {
  test("Tutor cannot access /admin/students", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_TUTOR_EMAIL or E2E_TUTOR_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/students"));

    await expect(page.getByTestId("students-page")).toHaveCount(0);
    await expect(page.getByTestId("access-denied")).toBeVisible();
  });
});



