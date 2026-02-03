// Resubmit flow should move a withdrawn request back to pending with updated details.
import { expect, test } from "@playwright/test";

import {
  ensurePortalAbsenceRequest,
  fetchPortalRequests,
  withdrawPortalAbsenceRequest,
} from "./helpers/absence-requests";
import { loginAsAdmin } from "./helpers/auth";
import { buildPortalPath, loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep206Fixtures } from "./helpers/step206";
import { buildTenantPath } from "./helpers/tenant";

const INITIAL_MESSAGE = "Original request message.";
const UPDATED_MESSAGE = "Updated reason after resubmission.";

test.describe("Resubmit flow", () => {
  test("Parent resubmits a withdrawn request and sees pending again", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.step206SessionIds.resubmit;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    let request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId: fixtures.studentId,
      reasonCode: "TRAVEL",
      message: INITIAL_MESSAGE,
    });

    if (request.status === "APPROVED" || request.status === "DECLINED") {
      throw new Error(
        "Resubmit flow requires a pending or withdrawn request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    if (request.status === "PENDING") {
      const withdrawResponse = await withdrawPortalAbsenceRequest(
        page,
        tenantSlug,
        request.id,
      );
      expect(withdrawResponse.status()).toBe(200);
      const refreshed = await fetchPortalRequests(page, tenantSlug);
      const updated = refreshed.find((item) => item.id === request.id);
      if (!updated) {
        throw new Error("Expected withdrawn request to appear in portal list.");
      }
      request = updated;
    }

    await page.goto(buildPortalPath(tenantSlug, `/sessions/${sessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await page.getByTestId("portal-absence-resubmit").click();
    await expect(page.getByTestId("portal-absence-modal")).toBeVisible();

    await page.getByTestId("portal-absence-reason").selectOption("OTHER");
    await page.getByTestId("portal-absence-message").fill(UPDATED_MESSAGE);
    await page.getByTestId("portal-absence-submit").click();

    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      "Pending review",
    );

    const items = await fetchPortalRequests(page, tenantSlug);
    const updated = items.find((item) => item.id === request.id);
    if (!updated) {
      throw new Error("Expected resubmitted request to appear in portal list.");
    }
    expect(updated.status).toBe("PENDING");
    expect(updated.message).toBe(UPDATED_MESSAGE);

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    const row = page.getByTestId(`request-row-${request.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Pending");
  });
});
