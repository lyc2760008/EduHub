// Tenant isolation checks for parent portal routes and access codes.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import {
  buildTenantUrl,
  prepareParentAccessCode,
  resolveOtherTenantSlug,
} from "./helpers/parent-auth";
import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "./helpers/portal";

test.describe("Parent portal tenant isolation", () => {
  test("Cross-tenant navigation redirects to login", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    await page.goto(buildPortalPath(otherTenantSlug, ""));
    await page.waitForURL((url) => url.pathname.endsWith("/parent/login"));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();
  });

  test("Access code is scoped to tenant", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);
    const { parentEmail, accessCode } = await prepareParentAccessCode(
      page,
      tenantSlug,
    );

    await page.context().clearCookies();
    await page.goto(buildTenantUrl(otherTenantSlug, "/parent/login"));
    await page.getByTestId("parent-login-email").fill(parentEmail);
    await page.getByTestId("parent-login-access-code").fill(accessCode);

    const authResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/auth/callback/parent-credentials"),
    );
    await page.getByTestId("parent-login-submit").click();
    await authResponsePromise;

    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    // Cross-tenant access code should fail with field-level invalid credentials.
    await expect(page.getByTestId("parent-login-code-error")).toBeVisible();
  });
});
