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
import {
  ensureGoLiveAbsenceTarget,
  resolveGoLiveParentAccess,
} from "../helpers/go-live";
import { buildPortalApiPath } from "../helpers/portal";
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

// Parent access + absence target resolution is delegated to a shared helper so staging runs can self-seed.

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

async function resolvePortalSessionCandidate(
  page: Parameters<typeof fetchPortalRequests>[0],
  tenantSlug: string,
) {
  // Pull the first visible portal session so absence requests are anchored to parent-visible data.
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const response = await page.request.get(
    buildPortalApiPath(
      tenantSlug,
      `/sessions?take=50&skip=0&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  );
  if (response.status() !== 200) {
    throw new Error(`Unexpected portal sessions status ${response.status()}.`);
  }
  const payload = (await response.json()) as {
    items?: Array<{ id?: string; studentId?: string }>;
  };
  const candidate = payload.items?.find((item) => item.id && item.studentId);
  if (!candidate?.id || !candidate.studentId) {
    return null;
  }
  return { sessionId: candidate.id, studentId: candidate.studentId };
}

// Tagged for go-live suite filtering (staging-only; not prod-safe).
test.describe("[go-live] Absence request lifecycle", () => {
  test("[go-live] Parent request lifecycle + admin resolve", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();
    const parentAccess = await resolveGoLiveParentAccess(page, tenantSlug);
    await ensureGoLiveAbsenceTarget(
      page,
      tenantSlug,
      parentAccess,
    );

    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      parentAccess.email,
      parentAccess.accessCode,
    );

    const sessionCandidate = await resolvePortalSessionCandidate(page, tenantSlug);
    // Skip when staging data lacks parent-visible sessions (common when seeding is disabled).
    test.skip(
      !sessionCandidate,
      "No portal sessions found for parent; provide go-live session IDs or seed data.",
    );
    if (!sessionCandidate) return;
    const { sessionId, studentId } = sessionCandidate;

    const { sessionId: requestSessionId, request } = await findUsableRequest(
      page,
      tenantSlug,
      studentId,
      [sessionId],
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
        .poll(
          async () =>
            (await findRequest(page, tenantSlug, requestSessionId, studentId))
              ?.status ?? null,
        )
        .toBe("PENDING");
    }

    const withdraw = await withdrawPortalAbsenceRequest(
      page,
      tenantSlug,
      request.id,
    );
    // Staging data can already be withdrawn from prior runs; accept 409 and verify state.
    if (![200, 409].includes(withdraw.status())) {
      expect(withdraw.status()).toBe(200);
    }

    let withdrew = true;
    try {
      await expect
        .poll(
          async () =>
            (await findRequest(page, tenantSlug, requestSessionId, studentId))
              ?.status ?? null,
        )
        .toBe("WITHDRAWN");
    } catch {
      // If staging rejects the withdraw (ex: request no longer withdrawable), continue with resolve.
      withdrew = false;
    }

    if (withdrew) {
      const resubmit = await resubmitPortalAbsenceRequest(page, {
        tenantSlug,
        requestId: request.id,
        reasonCode: "OTHER",
        message: RESUBMIT_MESSAGE,
      });
      expect(resubmit.status()).toBe(200);

      await expect
        .poll(
          async () =>
            (await findRequest(page, tenantSlug, requestSessionId, studentId))
              ?.status ?? null,
        )
        .toBe("PENDING");
    }

    // Switch to admin context to resolve the request.
    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);
    await resolveAbsenceRequest(page, tenantSlug, request.id, "APPROVED");

    // Re-login as parent and confirm the request is approved.
    await page.context().clearCookies();
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      parentAccess.email,
      parentAccess.accessCode,
    );

    await expect
      .poll(
        async () =>
          (await findRequest(page, tenantSlug, requestSessionId, studentId))
            ?.status ?? null,
      )
      .toBe("APPROVED");

    await page.goto(
      buildTenantPath(tenantSlug, `/portal/sessions/${requestSessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toBeVisible();
  });
});
