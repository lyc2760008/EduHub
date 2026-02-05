// Tutor access test verifying generator endpoint is blocked.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { buildTenantApiPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[slow] [regression] Sessions - generator access", () => {
  test("Tutor cannot generate sessions", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_TUTOR_EMAIL or E2E_TUTOR_PASSWORD env vars.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });

    const response = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: {} },
    );

    expect(response.status()).toBe(403);
  });
});



