// Parent RBAC guard for staff session detail + attendance endpoints (Step 20.5C).
import { expect, test } from "@playwright/test";

import { expectAdminBlocked } from "./helpers/parent-auth";
import { loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep205Fixtures } from "./helpers/step205";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";

test.describe("Parent cannot access staff session routes", () => {
  test("Parent is blocked from staff session detail and attendance APIs", async ({
    page,
  }) => {
    const fixtures = resolveStep205Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.absenceStaffSessionIds.pending;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expectAdminBlocked(page);
    await expect(page.getByTestId("session-detail-page")).toHaveCount(0);

    const detailResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}`),
    );
    expect([401, 403]).toContain(detailResponse.status());

    const attendanceResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}/attendance`),
    );
    expect([401, 403]).toContain(attendanceResponse.status());
  });
});
