// Tenant isolation smoke test for staff absence request surfaces.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import { buildTenantUrl, resolveOtherTenantSlug } from "..\/helpers/parent-auth";
import { resolveStep205Fixtures } from "..\/helpers/step205";

// Tagged for Playwright suite filtering.
test.describe("[regression] Staff absence tenant isolation", () => {
  test("Staff session cannot read other-tenant session data", async ({ page }) => {
    const fixtures = resolveStep205Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);
    const sessionId = fixtures.absenceStaffSessionIds.pending;

    await loginAsAdmin(page, tenantSlug);

    const crossTenantDetail = await page.request.get(
      buildTenantUrl(otherTenantSlug, `/api/sessions/${sessionId}`),
    );
    expect([401, 403, 404]).toContain(crossTenantDetail.status());

    const crossTenantAttendance = await page.request.get(
      buildTenantUrl(otherTenantSlug, `/api/sessions/${sessionId}/attendance`),
    );
    expect([401, 403, 404]).toContain(crossTenantAttendance.status());
  });
});


