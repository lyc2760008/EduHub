// Playwright coverage for audit log entries on absence request resolves (Step 20.8C).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import { ensurePortalAbsenceRequest, resolveAbsenceRequest } from "..\/helpers/absence-requests";
import { loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Audit log absence request resolve", () => {
  test("Audit log captures resolved absence requests without leaking messages", async ({
    page,
  }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const requestMessage = "Please excuse this absence.";
    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: fixtures.absenceSessionIds.resolve,
      studentId: fixtures.studentId,
      reasonCode: "ILLNESS",
      message: requestMessage,
    });

    if (request.status !== "PENDING") {
      throw new Error(
        `Expected pending request for audit resolve test, got ${request.status}.`,
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await resolveAbsenceRequest(page, tenantSlug, request.id, "APPROVED");

    const auditResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/audit") &&
        response.request().method() === "GET",
    );
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await auditResponsePromise;

    const filterResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/audit") &&
        response.request().method() === "GET",
    );
    await page.getByTestId("audit-category-filter").selectOption("requests");
    await filterResponsePromise;

    const actionCell = page.locator(
      '[data-testid="audit-row-action"][data-action="ABSENCE_REQUEST_RESOLVED"]',
    );
    await expect(actionCell.first()).toBeVisible();

    const row = actionCell.first().locator("xpath=ancestor::tr");
    await row.click();

    const detailDrawer = page.getByTestId("audit-detail-drawer");
    await expect(detailDrawer).toBeVisible();
    await expect(detailDrawer).not.toContainText(requestMessage);
  });
});


