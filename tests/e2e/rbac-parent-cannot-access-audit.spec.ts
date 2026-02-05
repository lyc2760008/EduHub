// Playwright coverage for parent RBAC blocking admin audit routes (Step 20.8C).
import { expect, test } from "@playwright/test";

import { resolveParent1Credentials } from "./helpers/portal";
import { loginAsParentWithAccessCode, expectAdminBlocked } from "./helpers/parent-auth";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";

test.describe("Parent RBAC blocks audit log", () => {
  test("Parent session cannot access admin audit UI or API", async ({ page }) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `RBAC audit test must target e2e-testing; got ${tenantSlug}.`,
      );
    }

    const parentCredentials = await resolveParent1Credentials(page);
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      parentCredentials.email,
      parentCredentials.accessCode,
    );

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expectAdminBlocked(page);

    const apiResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/admin/audit"),
    );
    expect([401, 403]).toContain(apiResponse.status());
  });
});
