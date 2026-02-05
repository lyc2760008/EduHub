// Negative coverage for duplicate, past, and unlinked absence requests (Step 20.4C).
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

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent absence request negative cases", () => {
  test("Duplicate, past, and unlinked requests are blocked", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const createResponse = await page.request.post(
      buildPortalApiPath(tenantSlug, "/requests"),
      {
        data: {
          sessionId: fixtures.absenceSessionIds.duplicate,
          studentId: fixtures.studentId,
          reasonCode: "ILLNESS",
          message: "Already reported once.",
        },
      },
    );
    if (![201, 409].includes(createResponse.status())) {
      throw new Error(
        `Unexpected create status ${createResponse.status()} for duplicate test setup.`,
      );
    }

    await page.goto(
      buildPortalPath(
        tenantSlug,
        `/sessions/${fixtures.absenceSessionIds.duplicate}`,
      ),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();

    await expect(page.getByTestId("portal-absence-cta")).toHaveCount(0);
    await expect(page.getByTestId("portal-absence-status-chip")).toBeVisible();

    const duplicateResponse = await page.request.post(
      buildPortalApiPath(tenantSlug, "/requests"),
      {
        data: {
          sessionId: fixtures.absenceSessionIds.duplicate,
          studentId: fixtures.studentId,
          reasonCode: "ILLNESS",
          message: "Duplicate attempt.",
        },
      },
    );
    expect(duplicateResponse.status()).toBe(409);

    const listResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, "/requests?take=100&skip=0"),
    );
    expect(listResponse.status()).toBe(200);
    const listPayload = (await listResponse.json()) as PortalRequestsResponse;
    const sessionRequests = listPayload.items.filter(
      (item) =>
        item.sessionId === fixtures.absenceSessionIds.duplicate &&
        item.studentId === fixtures.studentId,
    );
    expect(sessionRequests.length).toBe(1);

    await page.goto(buildPortalPath(tenantSlug, `/sessions/${fixtures.pastSessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-absence-cta")).toHaveCount(0);
    await expect(page.getByTestId("portal-absence-ineligible")).toBeVisible();

    const unlinkedResponse = await page.request.post(
      buildPortalApiPath(tenantSlug, "/requests"),
      {
        data: {
          sessionId: fixtures.unlinkedSessionId,
          studentId: fixtures.unlinkedStudentId,
          reasonCode: "TRAVEL",
          message: "Not linked to this student.",
        },
      },
    );
    expect([403, 404]).toContain(unlinkedResponse.status());
  });
});


