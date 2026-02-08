// Staff absence auto-assist approved flow validates banner + prefill without autosave.
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import { fetchAttendance } from "..\/helpers/attendance";
import {
  clearAttendanceForStudent,
  ensurePortalAbsenceRequest,
  resolveAbsenceRequest,
} from "..\/helpers/absence-requests";
import {
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep205Fixtures } from "..\/helpers/step205";
import { buildTenantPath } from "..\/helpers/tenant";

async function findSessionRowInList(
  page: Page,
  sessionId: string,
) {
  // Session rows are paginated, so advance pages until found or until pagination ends.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = page.getByTestId(`sessions-row-${sessionId}`);
    if ((await row.count()) > 0) {
      await expect(row.first()).toBeVisible();
      return row.first();
    }
    const nextButton = page.getByTestId("admin-pagination-next");
    if ((await nextButton.count()) === 0 || !(await nextButton.isEnabled())) {
      break;
    }
    await nextButton.click();
    await page.waitForLoadState("networkidle");
  }
  return null;
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Staff auto-assist approved", () => {
  test("Approved request pre-fills attendance without auto-save", async ({ page }) => {
    const fixtures = resolveStep205Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.absenceStaffSessionIds.approved;
    const studentId = fixtures.studentId;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId,
      reasonCode: "ILLNESS",
      message: "Feeling unwell today.",
    });

    if (request.status === "DECLINED") {
      throw new Error(
        "Approved auto-assist test expects pending or approved request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    if (request.status === "PENDING") {
      // Pending badge only shows while the request is unresolved.
      await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
      const row = await findSessionRowInList(page, sessionId);
      if (row) {
        await expect(row.getByTestId(`absence-badge-${sessionId}`)).toBeVisible();
      }

      await resolveAbsenceRequest(page, tenantSlug, request.id, "APPROVED");
    }

    await clearAttendanceForStudent(page, tenantSlug, sessionId, studentId);

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();
    await expect(page.getByTestId(`absence-request-status-${request.id}`)).toContainText(
      "Approved",
    );

    const banner = page.getByTestId(`attendance-absence-banner-${studentId}`);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-status", "APPROVED");

    const statusSelect = page.getByTestId(`attendance-status-select-${studentId}`);
    await expect(statusSelect).toHaveValue("EXCUSED");

    const beforeSave = await fetchAttendance(page, tenantSlug, sessionId);
    const beforeEntry = beforeSave.roster.find(
      (entry) => entry.student.id === studentId,
    );
    expect(beforeEntry?.attendance).toBeNull();

    await statusSelect.selectOption("PRESENT");
    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    const afterSave = await fetchAttendance(page, tenantSlug, sessionId);
    const afterEntry = afterSave.roster.find(
      (entry) => entry.student.id === studentId,
    );
    expect(afterEntry?.attendance?.status).toBe("PRESENT");

    // Session detail remained writable after approval, which confirms no destructive schedule mutation.
  });
});


