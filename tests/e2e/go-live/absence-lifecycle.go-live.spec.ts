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

function resolveAbsenceTargets(tenantSlug: string) {
  // Prefer explicit go-live session/student IDs; fall back to seeded fixtures for local runs.
  const sessionId = process.env.E2E_GO_LIVE_SESSION_ID;
  const studentId = process.env.E2E_GO_LIVE_STUDENT_ID;
  if (sessionId && studentId) {
    return { sessionId, studentId };
  }

  const fixtures = resolveStep206Fixtures();
  if (tenantSlug !== fixtures.tenantSlug) {
    throw new Error(
      "Missing E2E_GO_LIVE_SESSION_ID/E2E_GO_LIVE_STUDENT_ID for non-e2e tenant go-live run.",
    );
  }

  return {
    // Use approve-lock session to avoid colliding with Step 20.6 resubmit fixtures.
    sessionId: fixtures.step206SessionIds.approveLock,
    studentId: fixtures.studentId,
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

// Tagged for go-live suite filtering (staging-only; not prod-safe).
test.describe("[go-live] Absence request lifecycle", () => {
  test("[go-live] Parent request lifecycle + admin resolve", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();
    const { email: parentEmail, accessCode } = resolveParentAccess(tenantSlug);
    const { sessionId, studentId } = resolveAbsenceTargets(tenantSlug);

    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);

    let request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId,
      reasonCode: "OTHER",
      message: CREATE_MESSAGE,
    });

    if (request.status === "APPROVED" || request.status === "DECLINED") {
      throw new Error(
        "Absence lifecycle requires a pending/withdrawn request. Use a fresh upcoming session.",
      );
    }

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
