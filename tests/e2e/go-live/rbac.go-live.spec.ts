// Go-live smoke: parent RBAC should block access to admin routes.
import { test } from "@playwright/test";

import { expectAdminBlocked, loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveStep203Fixtures } from "../helpers/step203";
import { buildTenantPath } from "../helpers/tenant";

function resolveGoLiveTenantSlug() {
  // Prefer an explicit go-live tenant slug, then fall back to the default e2e tenant.
  return (
    process.env.E2E_GO_LIVE_TENANT_SLUG ||
    process.env.E2E_TENANT_SLUG ||
    "e2e-testing"
  );
}

// Tagged for go-live suite filtering (safe for production when parent creds are read-only).
test.describe("[go-live][prod-safe] RBAC", () => {
  test("[go-live][prod-safe] Parent cannot access admin audit", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();
    // Prefer explicit go-live credentials; fall back to seeded fixtures for local runs.
    const explicitEmail = process.env.E2E_PARENT_EMAIL;
    const explicitAccessCode = process.env.E2E_PARENT_ACCESS_CODE;
    let parentEmail = explicitEmail || "";
    let accessCode = explicitAccessCode || "";

    if (!parentEmail || !accessCode) {
      const fixtures = resolveStep203Fixtures();
      if (tenantSlug !== fixtures.tenantSlug) {
        throw new Error(
          "Missing E2E_PARENT_EMAIL/E2E_PARENT_ACCESS_CODE for non-e2e tenant go-live run.",
        );
      }
      parentEmail = fixtures.parentA1Email;
      accessCode = fixtures.accessCode;
    }

    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expectAdminBlocked(page);
  });
});
