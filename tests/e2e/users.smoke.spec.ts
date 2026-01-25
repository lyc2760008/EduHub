// Admin users smoke test covering page access and tenant-aware API context.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";

test.describe("Users - Admin smoke", () => {
  test("Admin can open Users page and /api/me resolves tenant", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/users"));
    await expect(page.getByTestId("users-page")).toBeVisible();
    await expect(page.getByTestId("access-denied")).toHaveCount(0);

    // API sanity check ensures tenant context is resolved for authenticated calls.
    const meResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/me"),
    );
    expect(meResponse.status()).toBe(200);

    const mePayload = await meResponse.json();
    expect(mePayload?.tenant?.tenantSlug).toBe(tenantSlug);
    expect(mePayload?.membership?.role).toBeTruthy();

    // Centers API smoke guard helps catch regressions from staff-center joins.
    const centersResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/centers"),
    );
    expect(centersResponse.status()).toBe(200);

    const centersPayload = await centersResponse.json();
    expect(Array.isArray(centersPayload)).toBe(true);
  });
});
