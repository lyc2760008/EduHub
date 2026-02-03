// Withdraw should be blocked for approved/declined requests and past sessions.
import { expect, test } from "@playwright/test";

import {
  ensurePortalAbsenceRequest,
  fetchPortalRequests,
  resubmitPortalAbsenceRequest,
  resolveAbsenceRequest,
  withdrawPortalAbsenceRequest,
} from "./helpers/absence-requests";
import { loginAsAdmin } from "./helpers/auth";
import { buildPortalPath, loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep206Fixtures } from "./helpers/step206";

const LOCKED_MESSAGE = "Status lock test request.";

test.describe("Withdraw restrictions", () => {
  test("Approved and declined requests cannot be withdrawn", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const approveSessionId = fixtures.step206SessionIds.approveLock;
    const declineSessionId = fixtures.step206SessionIds.declineLock;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    let approveRequest = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: approveSessionId,
      studentId: fixtures.studentId,
      reasonCode: "FAMILY",
      message: LOCKED_MESSAGE,
    });

    if (approveRequest.status === "WITHDRAWN") {
      const resubmitResponse = await resubmitPortalAbsenceRequest(page, {
        tenantSlug,
        requestId: approveRequest.id,
        reasonCode: "FAMILY",
        message: LOCKED_MESSAGE,
      });
      expect(resubmitResponse.status()).toBe(200);
      const refreshed = await fetchPortalRequests(page, tenantSlug);
      const updated = refreshed.find((item) => item.id === approveRequest.id);
      if (!updated) {
        throw new Error("Expected approved-lock request after resubmit.");
      }
      approveRequest = updated;
    }

    if (approveRequest.status === "DECLINED") {
      throw new Error(
        "Approved restriction test expects a pending or approved request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    if (approveRequest.status === "PENDING") {
      await resolveAbsenceRequest(page, tenantSlug, approveRequest.id, "APPROVED");
    }

    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(buildPortalPath(tenantSlug, `/sessions/${approveSessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-withdraw")).toHaveCount(0);

    const approveWithdrawResponse = await withdrawPortalAbsenceRequest(
      page,
      tenantSlug,
      approveRequest.id,
    );
    expect(approveWithdrawResponse.status()).toBeGreaterThanOrEqual(400);
    expect(approveWithdrawResponse.status()).toBeLessThan(500);

    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    let declineRequest = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: declineSessionId,
      studentId: fixtures.studentId,
      reasonCode: "OTHER",
      message: LOCKED_MESSAGE,
    });

    if (declineRequest.status === "WITHDRAWN") {
      const resubmitResponse = await resubmitPortalAbsenceRequest(page, {
        tenantSlug,
        requestId: declineRequest.id,
        reasonCode: "OTHER",
        message: LOCKED_MESSAGE,
      });
      expect(resubmitResponse.status()).toBe(200);
      const refreshed = await fetchPortalRequests(page, tenantSlug);
      const updated = refreshed.find((item) => item.id === declineRequest.id);
      if (!updated) {
        throw new Error("Expected decline-lock request after resubmit.");
      }
      declineRequest = updated;
    }

    if (declineRequest.status === "APPROVED") {
      throw new Error(
        "Decline restriction test expects a pending or declined request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    if (declineRequest.status === "PENDING") {
      await resolveAbsenceRequest(page, tenantSlug, declineRequest.id, "DECLINED");
    }

    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(buildPortalPath(tenantSlug, `/sessions/${declineSessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-withdraw")).toHaveCount(0);

    const declineWithdrawResponse = await withdrawPortalAbsenceRequest(
      page,
      tenantSlug,
      declineRequest.id,
    );
    expect(declineWithdrawResponse.status()).toBeGreaterThanOrEqual(400);
    expect(declineWithdrawResponse.status()).toBeLessThan(500);
  });

  test("Requests on started sessions cannot be withdrawn", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const pastSessionId = fixtures.step206SessionIds.withdrawPast;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const items = await fetchPortalRequests(page, tenantSlug);
    const pastRequest = items.find(
      (item) => item.sessionId === pastSessionId,
    );
    if (!pastRequest) {
      throw new Error(
        "Expected seeded pending request for started-session restriction test.",
      );
    }

    await page.goto(buildPortalPath(tenantSlug, `/sessions/${pastSessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-withdraw")).toHaveCount(0);

    const response = await withdrawPortalAbsenceRequest(
      page,
      tenantSlug,
      pastRequest.id,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });
});
