// Tutor access test verifying centers page is blocked for non-admin roles.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";

test.describe("Centers - Tutor access blocked", () => {
  test("Tutor cannot access /admin/centers", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_TUTOR_EMAIL or E2E_TUTOR_PASSWORD env vars.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(`/${tenantSlug}/admin/centers`);

    await expect(page.getByTestId("centers-page")).toHaveCount(0);
    await expect(page.getByTestId("access-denied")).toBeVisible();
  });
});
