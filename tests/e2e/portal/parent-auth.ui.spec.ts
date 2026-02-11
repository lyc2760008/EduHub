// UI-focused Playwright coverage for parent magic-link auth and admin invite UX.
//
// Constraints:
// - Do not depend on a real email inbox in E2E.
// - Assert UI state and safe backend triggering (toast + network response), not email delivery.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import { buildTenantPath } from "../helpers/tenant";
import {
  createStudentAndLinkParent,
  expectAdminBlocked,
  loginAsParentWithAccessCode,
  prepareParentAccessCode,
} from "../helpers/parent-auth";

// Force a clean session so login UI states are exercised in this suite.
test.use({ storageState: { cookies: [], origins: [] } });

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent auth UI", () => {
  test("Admin can send a parent sign-in link from Student Detail", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const { studentId, parentId } = await createStudentAndLinkParent(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, `/admin/students/${studentId}?mode=edit`));
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByTestId("parents-table")).toBeVisible();

    // Verify we trigger the invite endpoint (email delivery is out-of-scope for E2E).
    const sendResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/parents/${parentId}/send-magic-link`),
    );
    await page.getByTestId(`parent-send-link-${parentId}`).click();
    const sendResponse = await sendResponsePromise;
    // Rate limiting can legitimately trigger during full-suite runs (shared IP limits).
    expect([200, 409]).toContain(sendResponse.status());

    // The admin UI renders a safe toast without leaking the parent email or tokens.
    await expect(page.getByTestId("parent-send-link-toast")).toBeVisible();
  });

  test("Parent sessions cannot access admin routes", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const { parentEmail, accessCode } = await prepareParentAccessCode(page, tenantSlug);

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);

    for (const route of ["/admin", "/admin/students", "/admin/reports"]) {
      await page.goto(buildTenantPath(tenantSlug, route));
      await expectAdminBlocked(page);
    }
  });

  test("Invalid magic-link token does not establish a session", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    const { parentEmail, accessCode } = await prepareParentAccessCode(page, tenantSlug);

    // Ensure any prior cookies are cleared before testing a bad-token flow.
    await page.context().clearCookies();

    // Use a clearly invalid token value. Do not log or persist any real tokens.
    await page.goto(buildTenantPath(tenantSlug, "/parent/auth/verify?token=invalid-token"));

    // The verify page should render a generic bad-token state (invalid/failed).
    // Copy is localized, but EN fixtures commonly render "Invalid link" for bad tokens.
    await expect(page.getByText(/Invalid link|Unable to sign in/i)).toBeVisible();

    // A bad token should not sign the user in.
    const sessionResponse = await page.request.get("/api/auth/session");
    expect(sessionResponse.status()).toBe(200);
    const sessionPayload = (await sessionResponse.json()) as { user?: unknown } | null;
    expect(sessionPayload?.user).toBeFalsy();

    // Sanity: the happy-path login helper still works after a failed attempt.
    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
  });
});
