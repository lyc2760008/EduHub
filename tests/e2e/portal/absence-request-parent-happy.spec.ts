// Happy-path coverage for parent absence request submission (Step 20.4C).
import { expect, test } from "@playwright/test";

import {
  buildPortalApiPath,
  buildPortalPath,
  loginParentWithAccessCode,
} from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";

type PortalRequestItem = {
  id: string;
  sessionId: string;
  studentId: string;
  status: string;
};

type PortalRequestsResponse = {
  items: PortalRequestItem[];
};

const ABSENCE_MESSAGE = "Feeling unwell today.";

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent absence request happy path", () => {
  test("Parent submits absence request and sees pending status", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const existingResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, "/requests?take=100&skip=0"),
    );
    expect(existingResponse.status()).toBe(200);
    const existingPayload =
      (await existingResponse.json()) as PortalRequestsResponse;
    const existingRequest = existingPayload.items.find(
      (item) =>
        item.sessionId === fixtures.absenceSessionIds.happy &&
        item.studentId === fixtures.studentId,
    );
    if (existingRequest) {
      throw new Error(
        "Expected no existing absence request for happy-path session. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.goto(
      buildPortalPath(tenantSlug, `/sessions/${fixtures.absenceSessionIds.happy}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();

    await expect(page.getByTestId("portal-absence-cta")).toBeVisible();
    await page.getByTestId("portal-absence-cta").click();
    await expect(page.getByTestId("portal-absence-modal")).toBeVisible();

    await page.getByTestId("portal-absence-reason").selectOption("ILLNESS");
    await page.getByTestId("portal-absence-message").fill(ABSENCE_MESSAGE);

    await page.getByTestId("portal-absence-submit").click();

    // Toast may clear quickly after the session refresh; assert on the status chip instead.
    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      "Pending",
    );
    await expect(page.getByTestId("portal-absence-cta")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("portal-absence-status-chip")).toContainText(
      "Pending",
    );
  });
});


