// Tenant isolation smoke test for portal absence requests (Step 20.4C).
import { expect, test } from "@playwright/test";

import { buildTenantUrl, resolveOtherTenantSlug } from "..\/helpers/parent-auth";
import {
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";

// Tagged for Playwright suite filtering.
test.describe("[regression] Absence request tenant isolation", () => {
  test("Parent session cannot read other-tenant absence requests", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const otherTenantSlug = resolveOtherTenantSlug(tenantSlug);

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const crossTenantResponse = await page.request.get(
      buildTenantUrl(otherTenantSlug, "/api/portal/requests?take=1&skip=0"),
    );

    expect([401, 403, 404]).toContain(crossTenantResponse.status());
  });
});


