// Golden path: parent RBAC blocks admin access.
import { expect, test } from "@playwright/test";

import { expectAdminBlocked } from "../helpers/parent-auth";
import { loginParentWithAccessCode } from "../helpers/portal";
import { resolveStep203Fixtures } from "../helpers/step203";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[golden] Parent RBAC", () => {
  test("[golden] Parent is blocked from admin audit UI and API", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expectAdminBlocked(page);
    await expect(page.getByTestId("audit-log")).toHaveCount(0);

    const apiResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/admin/audit?take=1&skip=0"),
    );
    expect([401, 403]).toContain(apiResponse.status());
  });
});
