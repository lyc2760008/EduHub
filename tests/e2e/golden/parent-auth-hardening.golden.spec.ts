// Golden path: parent auth throttling/lockout flow.
import { expect, test } from "@playwright/test";

import { uniqueString } from "../helpers/data";
import { buildTenantPath } from "../helpers/tenant";

// Force a clean session so throttling is exercised from the login page.
test.use({ storageState: { cookies: [], origins: [] } });

// Tagged for Playwright suite filtering.
test.describe("[golden] Parent auth hardening", () => {
  test("[golden] Parent lockout banner appears after repeated failures", async ({
    page,
  }) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `[golden] auth test must target e2e-testing; got ${tenantSlug}.`,
      );
    }

    const email = `e2e.throttle.${uniqueString("auth")}` + "@example.com";
    const accessCode = "WRONG-CODE";
    const loginPath = buildTenantPath(tenantSlug, "/parent/login");

    await page.goto(loginPath);
    await page.getByTestId("parent-login-email").fill(email);
    await page.getByTestId("parent-login-access-code").fill(accessCode);

    const alert = page.getByTestId("parent-login-alert");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const authResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/callback/parent-credentials") &&
          response.request().method() === "POST",
      );
      await page.getByTestId("parent-login-submit").click();
      await authResponsePromise;

      try {
        await expect(alert).toBeVisible({ timeout: 1000 });
        break;
      } catch {
        await expect(page.getByTestId("parent-login-code-error")).toBeVisible();
      }
    }

    await expect(alert).toBeVisible();

    const submitButton = page.getByTestId("parent-login-submit");
    if (!(await submitButton.isDisabled())) {
      const retryResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/callback/parent-credentials") &&
          response.request().method() === "POST",
      );
      await submitButton.click();
      await retryResponsePromise;
      await expect(alert).toBeVisible();
    }

    await expect(page.getByTestId("parent-login-page")).toBeVisible();
  });
});
