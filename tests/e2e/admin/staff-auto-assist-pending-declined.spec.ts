// Staff absence auto-assist pending/declined banners should not prefill attendance.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import {
  clearAttendanceForStudent,
  ensurePortalAbsenceRequest,
  resolveAbsenceRequest,
} from "..\/helpers/absence-requests";
import { loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep205Fixtures } from "..\/helpers/step205";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Staff auto-assist pending + declined", () => {
  test("Pending and declined requests show banners without prefill", async ({ page }) => {
    const fixtures = resolveStep205Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const studentId = fixtures.studentId;
    const pendingSessionId = fixtures.absenceStaffSessionIds.pending;
    const declinedSessionId = fixtures.absenceStaffSessionIds.declined;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const pendingRequest = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: pendingSessionId,
      studentId,
      reasonCode: "TRAVEL",
      message: "Family travel planned.",
    });
    if (pendingRequest.status !== "PENDING") {
      throw new Error(
        "Pending auto-assist test expects a pending request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    const declinedRequest = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: declinedSessionId,
      studentId,
      reasonCode: "OTHER",
      message: "Schedule conflict.",
    });
    if (declinedRequest.status === "APPROVED") {
      throw new Error(
        "Declined auto-assist test cannot proceed with an approved request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    if (declinedRequest.status === "PENDING") {
      await resolveAbsenceRequest(page, tenantSlug, declinedRequest.id, "DECLINED");
    }

    await clearAttendanceForStudent(page, tenantSlug, pendingSessionId, studentId);
    await clearAttendanceForStudent(page, tenantSlug, declinedSessionId, studentId);

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${pendingSessionId}`));
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();
    const pendingBanner = page.getByTestId(
      `attendance-absence-banner-${studentId}`,
    );
    await expect(pendingBanner).toBeVisible();
    await expect(pendingBanner).toHaveAttribute("data-status", "PENDING");
    await expect(
      page.getByTestId(`attendance-status-select-${studentId}`),
    ).toHaveValue("unset");

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${declinedSessionId}`));
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();
    const declinedBanner = page.getByTestId(
      `attendance-absence-banner-${studentId}`,
    );
    await expect(declinedBanner).toBeVisible();
    await expect(declinedBanner).toHaveAttribute("data-status", "DECLINED");
    await expect(
      page.getByTestId(`attendance-status-select-${studentId}`),
    ).toHaveValue("unset");
  });
});


