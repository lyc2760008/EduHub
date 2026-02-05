// Parent sees resolved absence request status after admin action (Step 20.4C).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import {
  buildPortalApiPath,
  buildPortalPath,
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";
import { buildTenantApiPath } from "..\/helpers/tenant";

type PortalRequestItem = {
  id: string;
  sessionId: string;
  studentId: string;
  status: string;
};

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent sees resolved absence request", () => {
  test("Parent sees approved status on session detail", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    let requestId: string | null = null;
    let requestStatus: string | null = null;

    const listResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, "/requests?take=100&skip=0"),
    );
    expect(listResponse.status()).toBe(200);
    const listPayload = (await listResponse.json()) as {
      items?: PortalRequestItem[];
    };
    const existing = (listPayload.items || []).find(
      (item) =>
        item.sessionId === fixtures.absenceSessionIds.resolved &&
        item.studentId === fixtures.studentId,
    );

    if (existing) {
      requestId = existing.id;
      requestStatus = existing.status;
    } else {
      const createResponse = await page.request.post(
        buildPortalApiPath(tenantSlug, "/requests"),
        {
          data: {
            sessionId: fixtures.absenceSessionIds.resolved,
            studentId: fixtures.studentId,
            reasonCode: "FAMILY",
            message: "Family event conflicts with session.",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdPayload = (await createResponse.json()) as {
        request?: PortalRequestItem;
      };
      requestId = createdPayload.request?.id ?? null;
      requestStatus = createdPayload.request?.status ?? null;
    }

    if (!requestId) {
      throw new Error("Expected an absence request id for resolved-status test.");
    }
    if (!requestStatus) {
      throw new Error("Expected an absence request status for resolved-status test.");
    }

    if (requestStatus === "DECLINED") {
      throw new Error(
        "Expected a pending or approved request for resolved-status test. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    // Switch to admin to resolve if the request is still pending.
    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    if (requestStatus === "PENDING") {
      const resolveResponse = await page.request.post(
        buildTenantApiPath(tenantSlug, `/api/requests/${requestId}/resolve`),
        { data: { status: "APPROVED" } },
      );
      if (![200, 409].includes(resolveResponse.status())) {
        throw new Error(
          `Unexpected resolve status ${resolveResponse.status()} for absence request.`,
        );
      }
    }

    // Return to parent portal and confirm approved status renders.
    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    await page.goto(
      buildPortalPath(
        tenantSlug,
        `/sessions/${fixtures.absenceSessionIds.resolved}`,
      ),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      "Approved",
    );
  });
});


