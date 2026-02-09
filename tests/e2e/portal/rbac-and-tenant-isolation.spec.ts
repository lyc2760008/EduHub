// RBAC and tenant isolation checks for parent withdraw endpoints and admin routes.
import { expect, test } from "@playwright/test";

import {
  ensurePortalAbsenceRequest,
  withdrawPortalAbsenceRequest,
} from "..\/helpers/absence-requests";
import { buildTenantUrl, expectAdminBlocked, resolveOtherTenantSlug } from "..\/helpers/parent-auth";
import {
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep206Fixtures } from "..\/helpers/step206";
import { buildTenantPath } from "..\/helpers/tenant";

const RBAC_MESSAGE = "RBAC isolation request.";

// Tagged for Playwright suite filtering.
test.describe("[regression] RBAC + tenant isolation (parent)", () => {
  test("Parent cannot access admin routes or withdraw another parent's request", async ({
    page,
  }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.step206SessionIds.withdrawFuture;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId: fixtures.studentId,
      reasonCode: "TRAVEL",
      message: RBAC_MESSAGE,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    await expectAdminBlocked(page);

    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA0Email,
      accessCode: fixtures.accessCode,
    });

    const response = await withdrawPortalAbsenceRequest(
      page,
      tenantSlug,
      request.id,
    );
    expect([403, 404]).toContain(response.status());
  });

  test("Parent session is tenant-scoped for portal requests", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    // Clear tenant headers so cross-tenant navigation and API calls resolve correctly.
    await page.context().setExtraHTTPHeaders({});
    await page.goto(buildTenantUrl(otherTenantSlug, "/portal/requests"));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();

    const response = await page.request.get(
      buildTenantUrl(otherTenantSlug, "/api/portal/requests?take=1&skip=0"),
    );
    expect([401, 403, 404]).toContain(response.status());
  });
});


