// Tutor access test verifying groups page is blocked for non-admin roles.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Groups - Tutor access blocked", () => {
  test("Tutor cannot access /admin/groups", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    test.skip(
      !email || !password,
      "Missing E2E_TUTOR_EMAIL or E2E_TUTOR_PASSWORD env vars.",
    );

    await loginViaUI(page, { email: email!, password: password!, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));

    await expect(page.getByTestId("groups-page")).toHaveCount(0);
    await expect(page.getByTestId("access-denied")).toBeVisible();
  });
});



