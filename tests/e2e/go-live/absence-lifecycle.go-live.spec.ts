// Go-live staging smoke: absence request lifecycle with minimal API assertions.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import {
  ensurePortalAbsenceRequest,
  fetchPortalRequests,
  resubmitPortalAbsenceRequest,
  resolveAbsenceRequest,
  withdrawPortalAbsenceRequest,
} from "../helpers/absence-requests";
import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveStep206Fixtures } from "../helpers/step206";
import { buildTenantPath } from "../helpers/tenant";

const CREATE_MESSAGE = "Go-live absence request";
const RESUBMIT_MESSAGE = "Go-live resubmission";

function resolveGoLiveTenantSlug() {
  // Prefer an explicit go-live tenant slug, then fall back to the default e2e tenant.
  return (
    process.env.E2E_GO_LIVE_TENANT_SLUG ||
    process.env.E2E_TENANT_SLUG ||
    "e2e-testing"
  );
}

function resolveParentAccess(tenantSlug: string) {
  // Prefer explicit go-live credentials; fall back to seeded fixtures for local runs.
  const explicitEmail = process.env.E2E_PARENT_EMAIL;
  const explicitAccessCode = process.env.E2E_PARENT_ACCESS_CODE;
  if (explicitEmail && explicitAccessCode) {
    return { email: explicitEmail, accessCode: explicitAccessCode };
  }

  const fixtures = resolveStep206Fixtures();
  if (tenantSlug !== fixtures.tenantSlug) {
    throw new Error(
      "Missing E2E_PARENT_EMAIL/E2E_PARENT_ACCESS_CODE for non-e2e tenant go-live run.",
    );
  }

  return { email: fixtures.parentA1Email, accessCode: fixtures.accessCode };
}

function resolveAbsenceCandidates(tenantSlug: string) {
  // Prefer an explicit go-live session ID, then try multiple seeded sessions to avoid cross-spec collisions.
  const preferredSessionId = process.env.E2E_GO_LIVE_SESSION_ID;
  const studentId = process.env.E2E_GO_LIVE_STUDENT_ID;
  if (preferredSessionId && studentId) {
    return { studentId, sessionIds: [preferredSessionId] };
  }

  const fixtures = resolveStep206Fixtures();
  if (tenantSlug !== fixtures.tenantSlug) {
    throw new Error(
      "Missing E2E_GO_LIVE_SESSION_ID/E2E_GO_LIVE_STUDENT_ID for non-e2e tenant go-live run.",
    );
  }

  return {
    studentId: fixtures.studentId,
    // Order candidates from least-coupled to most commonly exercised fixture sessions.
    sessionIds: [
      ...(preferredSessionId ? [preferredSessionId] : []),
      fixtures.upcomingSessionId,
      fixtures.step206SessionIds.withdrawFuture,
      fixtures.step206SessionIds.resubmit,
      fixtures.step206SessionIds.approveLock,
      fixtures.step206SessionIds.declineLock,
    ],
  };
}

async function findRequest(
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

async function findUsableRequest(
  page: Parameters<typeof fetchPortalRequests>[0],
  tenantSlug: string,
  studentId: string,
  sessionIds: string[],
) {
  // Pick the first request path that is still actionable for lifecycle checks.
  for (const sessionId of sessionIds) {
    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId,
      reasonCode: "OTHER",
      message: CREATE_MESSAGE,
    });

    if (request.status === "APPROVED" || request.status === "DECLINED") {
      continue;
    }

    return { sessionId, request };
  }

  throw new Error(
    "Absence lifecycle requires at least one pending/withdrawn-capable request session.",
  );
}

// Tagged for go-live suite filtering (staging-only; not prod-safe).
test.describe("[go-live] Absence request lifecycle", () => {
  test("[go-live] Parent request lifecycle + admin resolve", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();
    const { email: parentEmail, accessCode } = resolveParentAccess(tenantSlug);
    const { sessionIds, studentId } = resolveAbsenceCandidates(tenantSlug);

    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);

    const { sessionId, request } = await findUsableRequest(
      page,
      tenantSlug,
      studentId,
      sessionIds,
    );

    if (request.status === "WITHDRAWN") {
      const resubmit = await resubmitPortalAbsenceRequest(page, {
        tenantSlug,
        requestId: request.id,
        reasonCode: "OTHER",
        message: RESUBMIT_MESSAGE,
      });
      expect(resubmit.status()).toBe(200);
      await expect
        .poll(async () => (await findRequest(page, tenantSlug, sessionId, studentId))?.status ?? null)
        .toBe("PENDING");
    }

    const withdraw = await withdrawPortalAbsenceRequest(
      page,
      tenantSlug,
      request.id,
    );
    expect(withdraw.status()).toBe(200);

    await expect
      .poll(async () => (await findRequest(page, tenantSlug, sessionId, studentId))?.status ?? null)
      .toBe("WITHDRAWN");

    const resubmit = await resubmitPortalAbsenceRequest(page, {
      tenantSlug,
      requestId: request.id,
      reasonCode: "OTHER",
      message: RESUBMIT_MESSAGE,
    });
    expect(resubmit.status()).toBe(200);

    await expect
      .poll(async () => (await findRequest(page, tenantSlug, sessionId, studentId))?.status ?? null)
      .toBe("PENDING");

    // Switch to admin context to resolve the request.
    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);
    await resolveAbsenceRequest(page, tenantSlug, request.id, "APPROVED");

    // Re-login as parent and confirm the request is approved.
    await page.context().clearCookies();
    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);

    await expect
      .poll(async () => (await findRequest(page, tenantSlug, sessionId, studentId))?.status ?? null)
      .toBe("APPROVED");

    await page.goto(buildTenantPath(tenantSlug, `/portal/sessions/${sessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toBeVisible();
  });
});
