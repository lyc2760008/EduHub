// Audit tenant-isolation regression checks keep admin audit routes scoped to the active tenant.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import { resolveOtherTenantSlug } from "../helpers/parent-auth";
import { buildTenantPath } from "../helpers/tenant";

test.describe("[regression] Audit log tenant isolation", () => {
  test("Tenant A admin cannot read tenant B audit UI or API", async ({ page }) => {
    const primaryTenant = process.env.E2E_TENANT_SLUG || "e2e-testing";
    const secondaryTenant = resolveOtherTenantSlug(primaryTenant);

    await loginAsAdmin(page, primaryTenant);
    await page.goto(buildTenantPath(secondaryTenant, "/admin/audit"));
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="login-page"]'),
    ).toBeVisible();

    // Path-scoped API probe validates cross-tenant isolation independent of header-based routing.
    const response = await page.request.get(
      `/t/${secondaryTenant}/api/admin/audit?page=1&pageSize=5`,
    );
    expect([401, 403, 404]).toContain(response.status());
  });
});
