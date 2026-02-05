// Auto-assist should ignore withdrawn requests and still honor approved ones.
import { expect, test } from "@playwright/test";

import {
  clearAttendanceForStudent,
  ensurePortalAbsenceRequest,
  resolveAbsenceRequest,
  withdrawPortalAbsenceRequest,
} from "..\/helpers/absence-requests";
import { loginAsAdmin } from "..\/helpers/auth";
import { loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep206Fixtures } from "..\/helpers/step206";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Auto-assist correctness", () => {
  test("Withdrawn request does not trigger banners or prefill", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.step206SessionIds.autoAssistWithdrawn;
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
      message: "Auto-assist withdrawn scenario.",
    });

    if (request.status === "PENDING") {
      const withdrawResponse = await withdrawPortalAbsenceRequest(
        page,
        tenantSlug,
        request.id,
      );
      expect(withdrawResponse.status()).toBe(200);
    }

    if (request.status === "APPROVED" || request.status === "DECLINED") {
      throw new Error(
        "Withdrawn auto-assist test requires a pending or withdrawn request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await clearAttendanceForStudent(page, tenantSlug, sessionId, studentId);
    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();

    const banner = page.locator(
      `[data-testid="attendance-absence-banner-${studentId}"]`,
    );
    await expect(banner).toHaveCount(0);
    await expect(
      page.getByTestId(`attendance-status-select-${studentId}`),
    ).toHaveValue("unset");
  });

  test("Approved request still triggers auto-assist banner and prefill", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.step206SessionIds.autoAssistApproved;
    const studentId = fixtures.studentId;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId,
      reasonCode: "TRAVEL",
      message: "Auto-assist approved scenario.",
    });

    if (request.status === "WITHDRAWN" || request.status === "DECLINED") {
      throw new Error(
        "Approved auto-assist test requires a pending or approved request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    if (request.status === "PENDING") {
      await resolveAbsenceRequest(page, tenantSlug, request.id, "APPROVED");
    }

    await clearAttendanceForStudent(page, tenantSlug, sessionId, studentId);
    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();

    const banner = page.getByTestId(`attendance-absence-banner-${studentId}`);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-status", "APPROVED");
    await expect(
      page.getByTestId(`attendance-status-select-${studentId}`),
    ).toHaveValue("EXCUSED");
  });
});


