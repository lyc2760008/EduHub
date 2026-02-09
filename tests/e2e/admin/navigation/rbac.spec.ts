// RBAC navigation coverage validates admin-only visibility and tenant isolation constraints.
import { expect, test } from "@playwright/test";

import { loginAsAdmin, loginAsParent, loginAsTutor } from "..\/..\/helpers\/auth";
import { expectAdminBlocked, resolveOtherTenantSlug } from "..\/..\/helpers\/parent-auth";
import { buildTenantPath } from "..\/..\/helpers\/tenant";

test.describe("Admin navigation RBAC", () => {
  test("[regression][rbac] tutor sees only permitted nav items", async ({ page }) => {
    const { tenantSlug } = await loginAsTutor(page);

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();

    await expect(page.getByTestId("nav-link-sessions")).toBeVisible();
    await expect(page.getByTestId("nav-link-parents")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-reports")).toHaveCount(0);
  });

  test("[regression][rbac] parent is blocked from admin routes", async ({ page }) => {
    const { tenantSlug } = await loginAsParent(page);

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expectAdminBlocked(page);
    await expect(page.getByTestId("nav-link-dashboard")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-parents")).toHaveCount(0);
  });

  test("[regression][rbac] tenant isolation blocks cross-tenant admin access", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const configuredSecondary =
      process.env.E2E_SECOND_TENANT_SLUG || process.env.SEED_SECOND_TENANT_SLUG;

    test.skip(
      !configuredSecondary,
      "Secondary tenant slug not configured for isolation check.",
    );

    const otherTenant =
      configuredSecondary === tenantSlug
        ? resolveOtherTenantSlug(tenantSlug)
        : configuredSecondary;

    if (!otherTenant) {
      test.skip(true, "Unable to resolve other tenant slug for isolation check.");
      return;
    }

    await page.goto(buildTenantPath(otherTenant, "/admin/audit"));
    await expectAdminBlocked(page);
  });
});
