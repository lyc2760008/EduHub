// Parent withdraw flow should update status across portal + admin inbox.
import { expect, test } from "@playwright/test";

import {
  ensurePortalAbsenceRequest,
  fetchPortalRequests,
  resubmitPortalAbsenceRequest,
} from "..\/helpers/absence-requests";
import { loginAsAdmin } from "..\/helpers/auth";
import { buildPortalPath, loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep206Fixtures } from "..\/helpers/step206";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

const REQUEST_MESSAGE = "Requesting an excused absence.";

// Tagged for Playwright suite filtering.
test.describe("[regression] Withdraw happy path", () => {
  test("Parent withdraws a pending request before session start", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.step206SessionIds.withdrawFuture;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    let request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId: fixtures.studentId,
      reasonCode: "ILLNESS",
      message: REQUEST_MESSAGE,
    });

    if (request.status === "WITHDRAWN") {
      const resubmitResponse = await resubmitPortalAbsenceRequest(page, {
        tenantSlug,
        requestId: request.id,
        reasonCode: "ILLNESS",
        message: REQUEST_MESSAGE,
      });
      expect(resubmitResponse.status()).toBe(200);
      const refreshed = await fetchPortalRequests(page, tenantSlug);
      const updated = refreshed.find((item) => item.id === request.id);
      if (!updated) {
        throw new Error("Expected resubmitted request to appear in portal list.");
      }
      request = updated;
    }

    if (request.status === "APPROVED" || request.status === "DECLINED") {
      throw new Error(
        "Withdraw happy-path requires a pending request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.goto(buildPortalPath(tenantSlug, `/sessions/${sessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await page.getByTestId("portal-absence-withdraw").click();
    await expect(page.getByTestId("portal-absence-withdraw-modal")).toBeVisible();
    await page.getByTestId("portal-absence-withdraw-confirm").click();

    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      "Withdrawn",
    );

    await page.goto(buildPortalPath(tenantSlug, "/requests"));
    await expect(page.getByTestId("portal-requests-page")).toBeVisible();
    const statusBadge = page.getByTestId(
      `portal-request-status-${request.id}-desktop`,
    );
    await expect(statusBadge).toContainText("Withdrawn");

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    // Requests filter moved into the shared sheet in toolkit rollout.
    await page.getByTestId("requests-list-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("admin-requests-status-filter").selectOption("WITHDRAWN");
    await page.getByTestId("admin-filters-sheet-close").click();
    await expect.poll(
      async () => {
        const response = await page.request.get(
          buildTenantApiPath(tenantSlug, "/api/requests?status=WITHDRAWN&pageSize=100"),
        );
        if (response.status() !== 200) return false;
        const payload = (await response.json()) as { items?: Array<{ id?: string }> };
        return Boolean(payload.items?.some((item) => item.id === request.id));
      },
      {
        timeout: 20000,
        message: "Expected withdrawn request to appear in admin requests API.",
      },
    ).toBeTruthy();
  });
});


