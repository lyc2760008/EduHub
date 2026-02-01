// Access control validation for parent portal routes and admin restrictions.
import { expect, test } from "@playwright/test";

import { expectAdminBlocked } from "./helpers/parent-auth";
import {
  buildPortalApiPath,
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
  resolveUnlinkedStudentId,
} from "./helpers/portal";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";

test.describe("Parent portal access control", () => {
  test("Unlinked student and admin routes are blocked", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const credentials = await resolveParent1Credentials(page);
    const unlinkedStudentId = await resolveUnlinkedStudentId(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    await page.goto(
      buildPortalPath(tenantSlug, `/students/${unlinkedStudentId}`),
    );
    await expect(page.getByTestId("portal-student-not-found")).toBeVisible();
    await expect(page.getByTestId("portal-student-detail-page")).toHaveCount(0);

    for (const route of ["/admin", "/admin/students", "/admin/reports"]) {
      await page.goto(buildTenantPath(tenantSlug, route));
      await expectAdminBlocked(page);
    }

    const adminApiResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/students"),
    );
    expect(adminApiResponse.status()).toBe(403);

    const portalApiResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/students/${unlinkedStudentId}`),
    );
    expect(portalApiResponse.status()).toBe(404);
  });
});
