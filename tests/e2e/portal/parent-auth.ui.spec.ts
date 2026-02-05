// UI-focused Playwright coverage for parent access-code auth and admin reset flow.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import { buildTenantPath } from "..\/helpers/tenant";
import {
  buildTenantUrl,
  createStudentAndLinkParent,
  expectAdminBlocked,
  loginAsParentWithAccessCode,
  prepareParentAccessCode,
  resolveOtherTenantSlug,
} from "..\/helpers/parent-auth";

// Force a clean session so login UI states are exercised in this suite.
test.use({ storageState: { cookies: [], origins: [] } });

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent auth UI", () => {
  test("Admin reset code via UI then parent login succeeds", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const { studentId, parentId, parentEmail } =
      await createStudentAndLinkParent(page, tenantSlug);

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/students/${studentId}?mode=edit`),
    );
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByTestId("parents-table")).toBeVisible();

    await page.getByTestId(`parent-reset-${parentId}`).click();
    await expect(page.getByTestId("parent-reset-code-modal")).toBeVisible();

    const resetResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/parents/${parentId}/reset-access-code`) &&
        response.request().method() === "POST",
    );
    await page.getByTestId("parent-reset-confirm").click();
    const resetResponse = await resetResponsePromise;
    expect(resetResponse.status()).toBe(200);

    const codeLocator = page.getByTestId("parent-reset-code-value");
    await expect(codeLocator).toBeVisible();
    const accessCode = (await codeLocator.textContent())?.trim();
    if (!accessCode) {
      throw new Error("Expected access code to be rendered in reset modal.");
    }

    await page.getByTestId("parent-reset-close").click();
    await expect(page.getByTestId("parent-reset-code-modal")).toHaveCount(0);

    // Clear admin session before authenticating as the parent.
    await page.context().clearCookies();

    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);

    await page.reload();
    await expect(page.getByTestId("parent-shell")).toBeVisible();
  });

  test("Parent sessions cannot access admin routes", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const { parentEmail, accessCode } = await prepareParentAccessCode(
      page,
      tenantSlug,
    );

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);

    for (const route of ["/admin", "/admin/students", "/admin/reports"]) {
      await page.goto(buildTenantPath(tenantSlug, route));
      await expectAdminBlocked(page);
    }
  });

  test("Tenant isolation blocks cross-tenant login", async ({ page }) => {
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
    // Field-level error indicates invalid credentials without revealing tenant details.
    await expect(page.getByTestId("parent-login-code-error")).toBeVisible();

    const session = (await page.evaluate(async () => {
      const response = await fetch("/api/auth/session");
      return response.json();
    })) as { user?: unknown } | null;
    const sessionUser = session && typeof session === "object" ? session.user : null;
    expect(sessionUser).toBeFalsy();
    expect(page.url()).toContain("/parent/login");
  });

  test("Wrong access code shows generic invalid credentials", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const { parentEmail } = await prepareParentAccessCode(page, tenantSlug);

    await page.context().clearCookies();
    await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
    await page.getByTestId("parent-login-email").fill(parentEmail);
    await page.getByTestId("parent-login-access-code").fill("WRONG-CODE");

    const authResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/auth/callback/parent-credentials"),
    );
    await page.getByTestId("parent-login-submit").click();
    await authResponsePromise;

    await expect(page.getByTestId("parent-login-page")).toBeVisible();
    // Invalid credentials should surface as a field-level error.
    await expect(page.getByTestId("parent-login-code-error")).toBeVisible();
  });
});


