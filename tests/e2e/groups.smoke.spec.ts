// Admin groups smoke test covering page access, tenant-aware API context, and regressions.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";

test.describe("Groups - smoke", () => {
  test("Admin can open Groups page and tenant context resolves", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    // Use tenant-aware paths to support subdomain or /t/<slug> routing.
    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));

    await expect(page.getByTestId("groups-page")).toBeVisible();
    await expect(page.getByTestId("access-denied")).toHaveCount(0);

    // API sanity check ensures tenant context is resolved for authenticated calls.
    const meResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/me"),
    );
    expect(meResponse.status()).toBe(200);

    const mePayload = await meResponse.json();
    expect(mePayload?.tenant?.tenantSlug).toBe(tenantSlug);
    expect(mePayload?.membership?.role).toBeTruthy();

    // Regression smokes for existing admin pages.
    await page.goto(buildTenantPath(tenantSlug, "/admin/centers"));
    await expect(page.getByTestId("centers-page")).toBeVisible();

    await page.goto(buildTenantPath(tenantSlug, "/admin/users"));
    await expect(page.getByTestId("users-page")).toBeVisible();

    await page.goto(buildTenantPath(tenantSlug, "/admin/programs"));
    await expect(page.getByTestId("programs-page")).toBeVisible();

    // API-level smokes cover student/parent features when admin pages are not present.
    const studentsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/students"),
    );
    expect(studentsResponse.status()).toBe(200);

    const parentsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/parents"),
    );
    expect(parentsResponse.status()).toBe(200);
  });
});
