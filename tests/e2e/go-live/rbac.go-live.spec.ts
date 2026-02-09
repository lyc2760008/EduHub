// Go-live smoke: parent RBAC should block access to admin routes.
import { test } from "@playwright/test";

import { expectAdminBlocked, loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveGoLiveParentAccess } from "../helpers/go-live";
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
    // Resolve a valid parent access code via the shared helper for staging reliability.
    const { email, accessCode } = await resolveGoLiveParentAccess(page, tenantSlug);

    await loginAsParentWithAccessCode(page, tenantSlug, email, accessCode);
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expectAdminBlocked(page);
  });
});
