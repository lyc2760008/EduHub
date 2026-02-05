// Golden path: parent absence lifecycle, admin resolve, and staff auto-assist checks.
import { expect, test } from "@playwright/test";

import {
  clearAttendanceForStudent,
  ensurePortalAbsenceRequest,
  fetchPortalRequests,
  withdrawPortalAbsenceRequest,
} from "../helpers/absence-requests";
import { fetchAttendance } from "../helpers/attendance";
import { loginAsAdmin } from "../helpers/auth";
import { buildPortalPath, loginParentWithAccessCode } from "../helpers/portal";
import { resolveStep206Fixtures } from "../helpers/step206";
import { buildTenantPath } from "../helpers/tenant";

const CREATE_MESSAGE = "Need to miss this session.";
const RESUBMIT_MESSAGE = "Resubmitting with updated details.";
const WITHDRAW_MESSAGE = "Auto-assist withdrawn coverage.";

const STATUS_MATCHERS = {
  pending: /Pending|\u5f85\u5904\u7406/,
  withdrawn: /Withdrawn|\u5df2\u64a4\u56de/,
  approved: /Approved|\u5df2\u6279\u51c6/,
};

async function findRequestForSession(
  page: Parameters<typeof fetchPortalRequests>[0],
  tenantSlug: string,
  sessionId: string,
  studentId: string,
) {
  const items = await fetchPortalRequests(page, tenantSlug);
  return (
    items.find(
      (item) => item.sessionId === sessionId && item.studentId === studentId,
    ) ?? null
  );
}

// Tagged for Playwright suite filtering.
test.describe("[golden] Absence request lifecycle", () => {
  test("[golden] Parent request lifecycle + staff auto-assist coverage", async ({
    page,
  }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const lifecycleSessionId = fixtures.step206SessionIds.resubmit;
    const withdrawSessionId = fixtures.step206SessionIds.autoAssistWithdrawn;
    const studentId = fixtures.studentId;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    let lifecycleRequest = await findRequestForSession(
      page,
      tenantSlug,
      lifecycleSessionId,
      studentId,
    );

    if (!lifecycleRequest) {
      await page.goto(
        buildPortalPath(tenantSlug, `/sessions/${lifecycleSessionId}`),
      );
      await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();

      await page.getByTestId("portal-absence-cta").click();
      await expect(page.getByTestId("portal-absence-modal")).toBeVisible();
      await page.getByTestId("portal-absence-reason").selectOption("ILLNESS");
      await page.getByTestId("portal-absence-message").fill(CREATE_MESSAGE);

      const createResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/portal/requests") &&
          response.request().method() === "POST",
      );
      await page.getByTestId("portal-absence-submit").click();
      await createResponse;

      await expect
        .poll(async () =>
          findRequestForSession(page, tenantSlug, lifecycleSessionId, studentId),
        )
        .not.toBeNull();
      lifecycleRequest = await findRequestForSession(
        page,
        tenantSlug,
        lifecycleSessionId,
        studentId,
      );
    }

    if (!lifecycleRequest) {
      throw new Error("Expected a lifecycle absence request to exist.");
    }

    if (
      lifecycleRequest.status === "APPROVED" ||
      lifecycleRequest.status === "DECLINED"
    ) {
      throw new Error(
        "Lifecycle test needs a pending/withdrawn request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.goto(
      buildPortalPath(tenantSlug, `/sessions/${lifecycleSessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toBeVisible();

    if (lifecycleRequest.status === "WITHDRAWN") {
      await page.getByTestId("portal-absence-resubmit").click();
      await expect(page.getByTestId("portal-absence-modal")).toBeVisible();
      await page.getByTestId("portal-absence-reason").selectOption("OTHER");
      await page.getByTestId("portal-absence-message").fill(RESUBMIT_MESSAGE);
      await page.getByTestId("portal-absence-submit").click();

      await expect
        .poll(async () => {
          const next = await findRequestForSession(
            page,
            tenantSlug,
            lifecycleSessionId,
            studentId,
          );
          return next?.status ?? null;
        })
        .toBe("PENDING");
    }

    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      STATUS_MATCHERS.pending,
    );

    await page.getByTestId("portal-absence-withdraw").click();
    await expect(page.getByTestId("portal-absence-withdraw-modal")).toBeVisible();
    await page.getByTestId("portal-absence-withdraw-confirm").click();

    await expect
      .poll(async () => {
        const next = await findRequestForSession(
          page,
          tenantSlug,
          lifecycleSessionId,
          studentId,
        );
        return next?.status ?? null;
      })
      .toBe("WITHDRAWN");

    await page.reload();
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      STATUS_MATCHERS.withdrawn,
    );

    await page.getByTestId("portal-absence-resubmit").click();
    await expect(page.getByTestId("portal-absence-modal")).toBeVisible();
    await page.getByTestId("portal-absence-reason").selectOption("OTHER");
    await page.getByTestId("portal-absence-message").fill(RESUBMIT_MESSAGE);
    await page.getByTestId("portal-absence-submit").click();

    await expect
      .poll(async () => {
        const next = await findRequestForSession(
          page,
          tenantSlug,
          lifecycleSessionId,
          studentId,
        );
        return next?.status ?? null;
      })
      .toBe("PENDING");
    lifecycleRequest = await findRequestForSession(
      page,
      tenantSlug,
      lifecycleSessionId,
      studentId,
    );
    if (!lifecycleRequest) {
      throw new Error("Expected resubmitted request to exist.");
    }

    await page.reload();
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      STATUS_MATCHERS.pending,
    );

    let withdrawRequest = await findRequestForSession(
      page,
      tenantSlug,
      withdrawSessionId,
      studentId,
    );

    if (!withdrawRequest) {
      withdrawRequest = await ensurePortalAbsenceRequest(page, {
        tenantSlug,
        sessionId: withdrawSessionId,
        studentId,
        reasonCode: "OTHER",
        message: WITHDRAW_MESSAGE,
      });
    }

    if (
      withdrawRequest.status === "APPROVED" ||
      withdrawRequest.status === "DECLINED"
    ) {
      throw new Error(
        "Withdrawn auto-assist check needs a pending/withdrawn request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    if (withdrawRequest.status === "PENDING") {
      const withdrawResponse = await withdrawPortalAbsenceRequest(
        page,
        tenantSlug,
        withdrawRequest.id,
      );
      expect(withdrawResponse.status()).toBe(200);

      await expect
        .poll(async () => {
          const next = await findRequestForSession(
            page,
            tenantSlug,
            withdrawSessionId,
            studentId,
          );
          return next?.status ?? null;
        })
        .toBe("WITHDRAWN");
      withdrawRequest = await findRequestForSession(
        page,
        tenantSlug,
        withdrawSessionId,
        studentId,
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    await expect(page.getByTestId("requests-inbox")).toBeVisible();

    const requestRow = page.getByTestId(`request-row-${lifecycleRequest.id}`);
    await expect(requestRow).toBeVisible();
    await requestRow.click();
    await expect(page.getByTestId("requests-drawer")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    const resolveResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/requests/${lifecycleRequest.id}/resolve`) &&
        response.request().method() === "POST",
    );
    await page.getByTestId("requests-approve-button").click();
    const resolved = await resolveResponse;
    expect([200, 409]).toContain(resolved.status());

    await clearAttendanceForStudent(
      page,
      tenantSlug,
      lifecycleSessionId,
      studentId,
    );
    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${lifecycleSessionId}`),
    );
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();

    const approvedBanner = page.getByTestId(
      `attendance-absence-banner-${studentId}`,
    );
    await expect(approvedBanner).toBeVisible();
    await expect(approvedBanner).toHaveAttribute("data-status", "APPROVED");

    const approvedSelect = page.getByTestId(
      `attendance-status-select-${studentId}`,
    );
    await expect(approvedSelect).toHaveValue("EXCUSED");

    const attendancePayload = await fetchAttendance(
      page,
      tenantSlug,
      lifecycleSessionId,
    );
    const attendanceEntry = attendancePayload.roster.find(
      (entry) => entry.student.id === studentId,
    );
    expect(attendanceEntry?.attendance).toBeNull();

    await clearAttendanceForStudent(
      page,
      tenantSlug,
      withdrawSessionId,
      studentId,
    );
    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${withdrawSessionId}`),
    );
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();

    await expect(
      page.locator(`[data-testid="attendance-absence-banner-${studentId}"]`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`attendance-status-select-${studentId}`),
    ).toHaveValue("unset");

    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(
      buildPortalPath(tenantSlug, `/sessions/${lifecycleSessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      STATUS_MATCHERS.approved,
    );
  });
});

