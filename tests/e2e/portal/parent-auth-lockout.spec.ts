// Playwright coverage for parent auth throttling UX (Step 20.8C).
// Parent auth is magic-link based; throttling is enforced on repeated link requests.
import { expect, test } from "@playwright/test";

import { uniqueString } from "..\/helpers/data";
import { buildTenantPath } from "..\/helpers/tenant";

// Force a clean session so throttling is exercised from the login page.
test.use({ storageState: { cookies: [], origins: [] } });

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent auth throttling UI", () => {
  test("Repeated link requests trigger throttle and stay enforced server-side", async ({
    page,
  }) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `Parent throttle test must target e2e-testing; got ${tenantSlug}.`,
      );
    }

    const email = `e2e.throttle.${uniqueString("auth")}@example.com`;
    const loginPath = buildTenantPath(tenantSlug, "/parent/login");

    await page.goto(loginPath);
    await page.getByTestId("parent-login-email").fill(email);

    const rateLimitAlert = page.getByTestId("parent-login-rate-limit");
    const successView = page.getByTestId("parent-login-success");

    // First attempt moves to the success view, unless throttling is already enforced.
    await page.getByTestId("parent-login-submit").click();
    await Promise.race([
      rateLimitAlert.waitFor({ state: "visible" }),
      successView.waitFor({ state: "visible" }),
    ]);

    // If we weren't throttled immediately, keep resending until the rate limit UI appears.
    if ((await rateLimitAlert.count()) === 0) {
      const resendButton = page.getByTestId("parent-login-resend");
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await resendButton.click();
        if ((await rateLimitAlert.count()) > 0) break;
      }
    }

    // UI should show the throttle callout once enforced.
    await expect(rateLimitAlert).toBeVisible();

    // Another attempt should still keep the throttle callout visible.
    const resendButton = page
      .getByTestId("parent-login-resend")
      .or(page.getByTestId("parent-login-submit"));
    await resendButton.click();
    await expect(rateLimitAlert).toBeVisible();

    await expect(page.getByTestId("parent-login-page")).toBeVisible();
  });
});


