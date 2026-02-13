// Step 22.7 parent coverage: linked parent sees zoom link while non-linked parent and cross-tenant paths remain blocked.
import { expect, test } from "@playwright/test";

import { buildTenantUrl } from "../helpers/parent-auth";
import { loginParentWithAccessCode, buildPortalApiPath, buildPortalPath } from "../helpers/portal";
import { expectNoSensitivePayloadContent } from "../helpers/security";
import {
  resolveStep227Fixtures,
  STEP227_INTERNAL_ONLY_SENTINEL,
  STEP227_ZOOM_LINK,
} from "../helpers/step227";

type PortalSessionPayload = {
  session?: {
    id?: string;
    zoomLink?: string | null;
  };
};

test.describe("[regression] [step22.7] Parent zoom-link visibility", () => {
  test("Linked parent sees zoom link on session detail and payload stays safe", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();

    await page.goto(buildPortalPath(fixtures.tenantSlug, `/sessions/${fixtures.zoomSessionId}`));
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.locator(`a[href="${STEP227_ZOOM_LINK}"]`).first()).toBeVisible();

    const response = await page.request.get(
      buildPortalApiPath(fixtures.tenantSlug, `/sessions/${fixtures.zoomSessionId}`),
    );
    expect(response.status()).toBe(200);

    const payload = (await response.json()) as PortalSessionPayload;
    expect(payload.session?.id).toBe(fixtures.zoomSessionId);
    expect(payload.session?.zoomLink).toBe(STEP227_ZOOM_LINK);
    expectNoSensitivePayloadContent(payload, {
      internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
    });
  });

  test("Non-involved parent and cross-tenant parent access are blocked", async ({ page, browser }) => {
    const fixtures = resolveStep227Fixtures();

    const crossTenantResponse = await page.request.get(
      buildTenantUrl(
        fixtures.secondaryTenantSlug,
        `/api/portal/sessions/${fixtures.zoomSessionId}`,
      ),
    );
    expect([401, 403, 404]).toContain(crossTenantResponse.status());

    const isolatedContext = await browser.newContext({ baseURL: test.info().project.use?.baseURL as string | undefined });
    const isolatedPage = await isolatedContext.newPage();

    try {
      await loginParentWithAccessCode(isolatedPage, fixtures.tenantSlug, {
        email: fixtures.parentA0Email,
        accessCode: fixtures.accessCode,
      });

      await isolatedPage.goto(
        buildPortalPath(fixtures.tenantSlug, `/sessions/${fixtures.zoomSessionId}`),
      );
      await expect(isolatedPage.getByTestId("portal-session-detail-not-found")).toBeVisible();

      const unlinkedResponse = await isolatedPage.request.get(
        buildPortalApiPath(fixtures.tenantSlug, `/sessions/${fixtures.zoomSessionId}`),
      );
      expect([403, 404]).toContain(unlinkedResponse.status());
    } finally {
      await isolatedContext.close();
    }
  });
});
