// Security regression coverage for tenant isolation and admin-only RBAC enforcement.
import { expect, test, type Page } from "@playwright/test";

import { buildOtherTenantApiUrl } from "..\/helpers/attendance";
import { loginAsAdmin, loginAsTutor } from "..\/helpers/auth";
import { createTestSuffix } from "..\/helpers/data";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

type StudentCreateResponse = { student?: { id?: string } };

async function createStudentViaApi(
  page: Page,
  tenantSlug: string,
  firstName: string,
  lastName: string,
) {
  // API creation avoids UI dependencies when validating cross-tenant access.
  const response = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/students"),
    { data: { firstName, lastName } },
  );
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as StudentCreateResponse;
  const studentId = payload.student?.id;
  if (!studentId) {
    throw new Error("Expected student id in create student response.");
  }
  return studentId;
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Security - tenant isolation and RBAC", () => {
  test("Tutor blocked from admin-only pages and APIs", async ({ page }) => {
    const { tenantSlug } = await loginAsTutor(page);

    const adminRoutes = [
      "/admin/users",
      "/admin/students",
      "/admin/reports",
    ];

    for (const route of adminRoutes) {
      // Access denied UI should render for tutor roles on admin-only pages.
      await page.goto(buildTenantPath(tenantSlug, route));
      await expect(page.getByTestId("access-denied")).toBeVisible();
    }

    const studentsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/students"),
    );
    expect(studentsResponse.status()).toBe(403);

    const subjectsResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/subjects"),
      { data: { name: "E2E RBAC Subject" } },
    );
    expect(subjectsResponse.status()).toBe(403);
  });

  test("Cross-tenant access attempts are blocked", async ({ page }, testInfo) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const suffix = createTestSuffix(testInfo, "tenant-guard");
    const studentId = await createStudentViaApi(
      page,
      tenantSlug,
      `E2E${suffix}`,
      "Tenant",
    );

    // Use a non-existent tenant slug to avoid accidental shared memberships.
    const otherTenantSlug = `ghost-${suffix}`.toLowerCase();

    const crossTenantApi = await page.request.get(
      buildOtherTenantApiUrl(
        otherTenantSlug,
        `/api/students/${studentId}`,
      ),
    );
    expect([403, 404]).toContain(crossTenantApi.status());

    // Cross-tenant UI navigation should not reveal the student record.
    await page.goto(
      buildTenantPath(otherTenantSlug, `/admin/students/${studentId}?mode=view`),
    );
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId("student-detail-page")).toHaveCount(0);
  });
});


