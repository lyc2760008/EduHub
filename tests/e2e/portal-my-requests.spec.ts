// Parent portal "My Requests" list should be scoped to the logged-in parent.
import { expect, test } from "@playwright/test";

import { ensurePortalAbsenceRequest, fetchPortalRequests } from "./helpers/absence-requests";
import { buildPortalPath, loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep206Fixtures } from "./helpers/step206";

const REQUEST_MESSAGE = "Need to miss this session.";

test.describe("Portal My Requests list", () => {
  test("Lists only the parent’s requests and links to session detail", async ({ page }) => {
    const fixtures = resolveStep206Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.step206SessionIds.withdrawFuture;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId: fixtures.studentId,
      reasonCode: "ILLNESS",
      message: REQUEST_MESSAGE,
    });

    await page.goto(buildPortalPath(tenantSlug, "/requests"));
    await expect(page.getByTestId("portal-requests-page")).toBeVisible();

    const items = await fetchPortalRequests(page, tenantSlug);
    expect(items.length).toBeGreaterThan(0);
    // All list items should be scoped to the single linked student for this parent.
    for (const item of items) {
      expect(item.studentId).toBe(fixtures.studentId);
    }

    const row = page.getByTestId(`portal-request-row-${request.id}`);
    await expect(row).toBeVisible();
    await row.locator("a").first().click();

    await page.waitForURL((url) =>
      url.pathname.endsWith(`/portal/sessions/${sessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
  });
});
