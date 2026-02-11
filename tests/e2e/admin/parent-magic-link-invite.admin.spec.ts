// Step 22.2 E2E coverage: Admin send/resend parent magic sign-in link from Student Detail -> Parents.
// This spec does NOT depend on real email delivery; it verifies UI state and the backend request outcome only.
import { expect, test } from "@playwright/test";

import { loginAsAdmin, loginAsTutor } from "../helpers/auth";
import { resolveStep203Fixtures } from "../helpers/step203";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

test.describe("[regression] Step 22.2 - Admin parent magic link invite/resend", () => {
  test("Admin can trigger send-link from Student Detail Parents section (no real email dependency)", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();

    await loginAsAdmin(page, fixtures.tenantSlug);

    await page.goto(
      // Use edit mode so row actions (including send-link) are enabled.
      buildTenantPath(fixtures.tenantSlug, `/admin/students/${fixtures.studentId}?mode=edit`),
    );
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByTestId("parents-section")).toBeVisible();

    const sendButtons = page.locator('button[data-testid^="parent-send-link-"]');
    await expect(sendButtons.first()).toBeVisible();
    await expect(sendButtons.first()).toBeEnabled();

    const sendResponsePromise = page.waitForResponse((response) => {
      if (response.request().method() !== "POST") return false;
      const url = response.url();
      return url.includes("/api/parents/") && url.includes("/send-magic-link");
    });

    await sendButtons.first().click();
    const sendResponse = await sendResponsePromise;
    // Rate limiting can trigger during full-suite runs; treat 200 + 409 as acceptable outcomes.
    expect([200, 409]).toContain(sendResponse.status());

    // Success feedback is surfaced as a toast-style panel (admin-friendly, no secret details).
    await expect(page.getByTestId("parent-send-link-toast")).toBeVisible();

    // i18n sanity check: the UI should not render raw translation key paths.
    await expect(page.locator("body")).not.toContainText("adminParentAuth.");
  });

  test("Missing parent email disables send-link action and shows helper text", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();

    await loginAsAdmin(page, fixtures.tenantSlug);

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/admin/students/${fixtures.missingEmailStudentId}?mode=view`,
      ),
    );
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByTestId("parents-section")).toBeVisible();

    const sendButtons = page.locator('button[data-testid^="parent-send-link-"]');
    await expect(sendButtons).toHaveCount(1);
    await expect(sendButtons.first()).toBeDisabled();

    // Helper text is expected for disabled state and must not expose secrets.
    await expect(page.getByText(/parent email required/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("adminParentAuth.disabled.");
  });

  test("Tutor cannot access Student Detail (RBAC blocks admin-only page and invite endpoint)", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();

    await loginAsTutor(page, fixtures.tenantSlug);

    await page.goto(
      buildTenantPath(fixtures.tenantSlug, `/admin/students/${fixtures.studentId}?mode=view`),
    );
    await expect(page.getByTestId("access-denied")).toBeVisible();

    // API should also reject tutor role even if they attempt to call it directly.
    const apiResponse = await page.request.post(
      buildTenantApiPath(fixtures.tenantSlug, "/api/parents/does-not-matter/send-magic-link"),
      { data: { studentId: fixtures.studentId } },
    );
    expect([401, 403]).toContain(apiResponse.status());
  });

  test("Tenant isolation: cross-tenant UI navigation is blocked (best-effort)", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    const otherTenantSlug = process.env.E2E_SECOND_TENANT_SLUG || `${fixtures.tenantSlug}-secondary`;

    await loginAsAdmin(page, fixtures.tenantSlug);

    // Cross-tenant UI navigation should not reveal the student record.
    await page.goto(
      buildTenantPath(otherTenantSlug, `/admin/students/${fixtures.studentId}?mode=view`),
    );
    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId("student-detail-page")).toHaveCount(0);
  });
});
