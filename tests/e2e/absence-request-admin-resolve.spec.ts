// Admin resolves a pending absence request from the requests inbox (Step 20.4C).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { buildPortalApiPath, loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep204Fixtures } from "./helpers/step204";
import { buildTenantPath } from "./helpers/tenant";

type PortalRequestItem = {
  id: string;
  sessionId: string;
  studentId: string;
  status: string;
};

type PortalRequestsResponse = {
  items: PortalRequestItem[];
};

test.describe("Admin resolves absence request", () => {
  test("Admin approves a pending request from the inbox", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const listResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, "/requests?take=100&skip=0"),
    );
    expect(listResponse.status()).toBe(200);
    const listPayload = (await listResponse.json()) as PortalRequestsResponse;
    let request = listPayload.items.find(
      (item) =>
        item.sessionId === fixtures.absenceSessionIds.resolve &&
        item.studentId === fixtures.studentId,
    );

    if (!request) {
      const createResponse = await page.request.post(
        buildPortalApiPath(tenantSlug, "/requests"),
        {
          data: {
            sessionId: fixtures.absenceSessionIds.resolve,
            studentId: fixtures.studentId,
            reasonCode: "ILLNESS",
            message: "Please excuse the absence.",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      const createdPayload = (await createResponse.json()) as {
        request?: PortalRequestItem;
      };
      request = createdPayload.request ?? null;
    }

    if (!request) {
      throw new Error("Expected a pending request for admin resolve test.");
    }
    if (request.status !== "PENDING") {
      throw new Error(
        `Expected pending status for admin resolve test, got ${request.status}.`,
      );
    }

    // Clear parent session cookies before switching to admin.
    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    await expect(page.getByTestId("requests-page")).toBeVisible();

    const rowTestId = `request-row-${request.id}`;
    await expect(page.getByTestId(rowTestId)).toBeVisible();

    await page.getByTestId(rowTestId).click();
    await expect(page.getByTestId("requests-drawer")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("requests-approve-button").click();

    await expect(page.getByTestId("requests-drawer")).toHaveCount(0);
    await expect(page.getByTestId(rowTestId)).toHaveCount(0);
  });
});
