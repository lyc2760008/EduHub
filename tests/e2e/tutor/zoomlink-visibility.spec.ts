// Step 22.7 tutor coverage: Zoom link visibility on assigned sessions and strict tutor RBAC.
import { expect, test } from "@playwright/test";

import { expectFieldAbsent, expectNoSensitivePayloadContent } from "../helpers/security";
import {
  resolveStep227Fixtures,
  STEP227_INTERNAL_ONLY_SENTINEL,
  STEP227_ZOOM_LINK,
} from "../helpers/step227";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type TutorSessionDetailPayload = {
  session?: {
    sessionId?: string;
    zoomLink?: string | null;
  };
  roster?: Array<Record<string, unknown>>;
};

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test.describe("[regression] [step22.7] Tutor zoom-link visibility", () => {
  test("Assigned tutor sees zoom link in list and run-session detail", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/sessions"));
    await expect(page.getByTestId("tutor-sessions-page")).toBeVisible();
    // Constrain date range around the seeded Step 22.7 zoom session so it appears on page 1 even when
    // the tenant has many sessions in the broader 30-day window.
    const zoomWindowStart = formatDateInput(new Date(Date.now() + 11 * 24 * 60 * 60 * 1000));
    const zoomWindowEnd = formatDateInput(new Date(Date.now() + 13 * 24 * 60 * 60 * 1000));
    const filteredListResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/tutor/sessions?") &&
        response.url().includes(`from=${zoomWindowStart}`) &&
        response.url().includes(`to=${zoomWindowEnd}`),
    );
    await page.getByTestId("tutor-sessions-filter-start").fill(zoomWindowStart);
    await page.getByTestId("tutor-sessions-filter-end").fill(zoomWindowEnd);
    await filteredListResponse;

    const zoomRow = page.getByTestId(`tutor-session-row-${fixtures.zoomSessionId}`);
    await expect(zoomRow).toBeVisible();
    await expect(zoomRow.locator(`a[href="${STEP227_ZOOM_LINK}"]`)).toBeVisible();

    const detailResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes(`/api/tutor/sessions/${fixtures.zoomSessionId}`),
    );

    await page.getByTestId(`tutor-run-session-link-${fixtures.zoomSessionId}`).click();
    await expect(page.getByTestId("tutor-run-session-page")).toBeVisible();
    await expect(page.locator(`a[href="${STEP227_ZOOM_LINK}"]`).first()).toBeVisible();

    const detailResponse = await detailResponsePromise;
    expect(detailResponse.status()).toBe(200);
    const payload = (await detailResponse.json()) as TutorSessionDetailPayload;

    expect(payload.session?.sessionId).toBe(fixtures.zoomSessionId);
    expect(payload.session?.zoomLink).toBe(STEP227_ZOOM_LINK);
    expectFieldAbsent(payload, "cancelReasonCode");
    expectFieldAbsent(payload, "internalNote");
    expectNoSensitivePayloadContent(payload, {
      internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
    });
  });

  test("Tutor is blocked from non-assigned and cross-tenant session detail", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();

    const nonAssignedResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, `/api/tutor/sessions/${fixtures.tutorBSessionId}`),
    );
    expect([403, 404]).toContain(nonAssignedResponse.status());

    const crossTenantResponse = await page.request.get(
      buildTenantApiPath(fixtures.secondaryTenantSlug, `/api/tutor/sessions/${fixtures.zoomSessionId}`),
    );
    expect([401, 403, 404]).toContain(crossTenantResponse.status());
  });
});
