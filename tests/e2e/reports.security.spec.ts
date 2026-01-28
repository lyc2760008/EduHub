// Reports security smoke: tutor access should be blocked from admin reports.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Reports - security", () => {
  test("Tutor is blocked from reports page", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    test.skip(!email || !password, "Tutor env vars not set for security smoke.");

    await loginViaUI(page, { email: email!, password: password!, tenantSlug });
    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));

    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId("reports-page")).toHaveCount(0);
  });
});
