// Access-control checks for parent users against admin requests routes (Step 20.4C).
import { expect, test } from "@playwright/test";

import { expectAdminBlocked } from "..\/helpers/parent-auth";
import { loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent access control for admin requests", () => {
  test("Parent cannot access admin requests UI or API", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    await expectAdminBlocked(page);
    await expect(page.getByTestId("requests-page")).toHaveCount(0);

    const adminListResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/requests?status=PENDING"),
    );
    expect([401, 403]).toContain(adminListResponse.status());
  });
});


