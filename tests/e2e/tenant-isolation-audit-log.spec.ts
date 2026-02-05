// Playwright conditional coverage for audit log tenant isolation (Step 20.8C).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { uniqueString } from "./helpers/data";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Audit log tenant isolation", () => {
  test("Tenant A cannot see audit events from tenant B", async ({ page }) => {
    const primaryTenant = process.env.E2E_TENANT_SLUG || "e2e-testing";
    const secondaryTenant = process.env.E2E_SECOND_TENANT_SLUG;

    test.skip(!secondaryTenant, "Secondary tenant not configured for E2E.");

    if (primaryTenant !== "e2e-testing") {
      throw new Error(
        `Tenant isolation test must target e2e-testing; got ${primaryTenant}.`,
      );
    }

    const uniqueEmail = `e2e.tenant.${uniqueString("audit")}@example.com`;

    await page.goto(buildTenantPath(secondaryTenant, "/parent/login"));
    await page.getByTestId("parent-login-email").fill(uniqueEmail);
    await page.getByTestId("parent-login-access-code").fill("WRONG-CODE");
    const authResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/callback/parent-credentials") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("parent-login-submit").click();
    await authResponsePromise;

    await page.context().clearCookies();
    await loginAsAdmin(page, primaryTenant);

    const auditResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/audit") &&
        response.request().method() === "GET",
    );
    await page.goto(buildTenantPath(primaryTenant, "/admin/audit"));
    await auditResponsePromise;

    const filterResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/audit") &&
        response.request().method() === "GET",
    );
    await page.getByTestId("audit-category-filter").selectOption("auth");
    await filterResponsePromise;

    await expect(page.getByTestId("audit-log")).not.toContainText(uniqueEmail);
  });
});
