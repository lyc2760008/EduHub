// Session detail access control checks for linked vs unlinked sessions.
import { expect, test } from "@playwright/test";

import { buildTenantUrl, resolveOtherTenantSlug } from "..\/helpers/parent-auth";
import {
  buildPortalApiPath,
  buildPortalPath,
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep203Fixtures } from "..\/helpers/step203";

const NOT_FOUND_STATUSES = [403, 404];

// Tagged for Playwright suite filtering.
test.describe("[regression] Portal session detail access control", () => {
  test("Parent cannot access unlinked or cross-tenant sessions", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(
      buildPortalPath(tenantSlug, `/sessions/${fixtures.unlinkedSessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-not-found")).toBeVisible();
    await expect(page.getByTestId("portal-session-detail-page")).toHaveCount(0);

    const unlinkedApiResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/sessions/${fixtures.unlinkedSessionId}`),
    );
    expect(NOT_FOUND_STATUSES).toContain(unlinkedApiResponse.status());

    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);
    // Use the other tenant host/path to force tenant resolution, not just a path swap.
    const crossTenantResponse = await page.request.get(
      buildTenantUrl(
        otherTenantSlug,
        `/api/portal/sessions/${fixtures.pastSessionId}`,
      ),
    );
    expect(NOT_FOUND_STATUSES).toContain(crossTenantResponse.status());
  });
});


