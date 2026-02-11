// Golden path: parent auth throttling/lockout flow for magic-link requests.
import { expect, test } from "@playwright/test";

import { uniqueString } from "../helpers/data";
import { buildTenantPath } from "../helpers/tenant";

// Force a clean session so throttling is exercised from the login page.
test.use({ storageState: { cookies: [], origins: [] } });

// Tagged for Playwright suite filtering.
test.describe("[golden] Parent auth hardening", () => {
  test("[golden] Parent lockout banner appears after repeated link requests", async ({
    page,
  }) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `[golden] auth test must target e2e-testing; got ${tenantSlug}.`,
      );
    }

    const email = `e2e.throttle.${uniqueString("auth")}` + "@example.com";
    const loginPath = buildTenantPath(tenantSlug, "/parent/login");

    await page.goto(loginPath);
    await page.getByTestId("parent-login-email").fill(email);

    // Request flow:
    // - First submit generally moves to success view.
    // - Repeated resend attempts should eventually surface the rate-limit banner.
    const requestPathFragment = `/${tenantSlug}/api/parent-auth/magic-link/request`;
    const firstResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(requestPathFragment),
    );
    await page.getByTestId("parent-login-submit").click();
    await firstResponsePromise;

    // The banner can appear on the form view or the success view, depending on prior runs.
    if (!(await page.getByTestId("parent-login-rate-limit").isVisible().catch(() => false))) {
      await expect(page.getByTestId("parent-login-success")).toBeVisible();
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await page.getByTestId("parent-login-rate-limit").isVisible().catch(() => false)) {
        break;
      }

      // Prefer resend when success view is visible; otherwise keep submitting the form.
      if (await page.getByTestId("parent-login-success").isVisible().catch(() => false)) {
        const resendPromise = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes(requestPathFragment),
        );
        await page.getByTestId("parent-login-resend").click();
        await resendPromise;
      } else {
        const submitPromise = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes(requestPathFragment),
        );
        await page.getByTestId("parent-login-submit").click();
        await submitPromise;
      }
    }

    await expect(page.getByTestId("parent-login-rate-limit")).toBeVisible();
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
  });
});
