// Withdraw should be blocked for approved/declined requests and past sessions.
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

import {
  ensurePortalAbsenceRequest,
  fetchPortalRequests,
  resubmitPortalAbsenceRequest,
  resolveAbsenceRequest,
  withdrawPortalAbsenceRequest,
} from "..\/helpers/absence-requests";
import { loginAsAdmin } from "..\/helpers/auth";
import { resolveCenterAndTutor, uniqueString } from "..\/helpers/data";
import { buildPortalPath, loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep206Fixtures } from "..\/helpers/step206";
import { buildTenantApiPath } from "..\/helpers/tenant";

const LOCKED_MESSAGE = "Status lock test request.";

type SessionCreateResponse = {
  session?: { id?: string };
};

async function createUpcomingSession(
  page: Parameters<typeof loginAsAdmin>[0],
  tenantSlug: string,
  studentId: string,
  label: string,
) {
  // Create unique sessions per run so fixture IDs don't go stale between seeds.
  const { tutor, center } = await resolveCenterAndTutor(page, tenantSlug);
  const timezone = center.timezone || "America/Edmonton";
  const seed = uniqueString(`withdraw-${label}`);
  const seedValue = Array.from(seed).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const startAt = DateTime.now()
      .setZone(timezone)
      .plus({ days: 4 + attempt })
      .set({
        hour: 10 + (attempt % 4),
        minute: (seedValue + attempt * 13) % 55,
        second: (seedValue + attempt * 7) % 60,
        millisecond: (seedValue * 31 + attempt * 97) % 1000,
      });
    const endAt = startAt.plus({ hours: 1 });

    const response = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions"),
      {
        data: {
          centerId: center.id,
          tutorId: tutor.id,
          sessionType: "ONE_ON_ONE",
          studentId,
          startAt: startAt.toISO(),
          endAt: endAt.toISO(),
          timezone,
        },
      },
    );

    if (response.status() === 201) {
      const payload = (await response.json()) as SessionCreateResponse;
      const sessionId = payload.session?.id;
      if (!sessionId) {
        throw new Error("Expected session id in session create response.");
      }
      return sessionId;
    }

    if (response.status() !== 409) {
      const details = await response.text();
      throw new Error(
        `Unexpected session create status ${response.status()}: ${details}`,
      );
    }
  }

  throw new Error("Unable to create a unique session for withdraw test.");
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Withdraw restrictions", () => {
  test("Approved and declined requests cannot be withdrawn", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginAsAdmin(page, tenantSlug);
    const approveSessionId = await createUpcomingSession(
      page,
      tenantSlug,
      fixtures.studentId,
      "approve",
    );
    const declineSessionId = await createUpcomingSession(
      page,
      tenantSlug,
      fixtures.studentId,
      "decline",
    );

    await page.context().clearCookies();

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


