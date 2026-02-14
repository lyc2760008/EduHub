// Step 23.3 security E2E validates RBAC, tenant isolation, and payload redaction for notifications.
import { expect, test, type Browser, type Page } from "@playwright/test";

import { loginAsAdmin, loginAsTutorViaApi } from "../helpers/auth";
import {
  fetchPortalNotifications,
  findNotificationsLeakMatch,
  parseNotificationsCsv,
} from "../helpers/notifications";
import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { STEP233_INTERNAL_ONLY_SENTINEL, resolveStep233Fixtures } from "../helpers/step233";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

function resolveBaseUrl() {
  // Dedicated base URL fallback keeps ad-hoc browser contexts aligned with project config.
  return process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000";
}

async function newAuthedPage(
  browser: Browser,
  login: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({ baseURL: resolveBaseUrl() });
  const page = await context.newPage();
  await login(page);
  return { context, page };
}

test.describe("[regression] Step 23.3 notifications RBAC + tenant security", () => {
  test("Notification endpoints enforce recipient scope and leak-safe payloads", async ({
    page,
    browser,
  }) => {
    const fixtures = resolveStep233Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const parent = await newAuthedPage(browser, async (ctxPage) => {
      await loginAsParentWithAccessCode(
        ctxPage,
        fixtures.tenantSlug,
        fixtures.parentA1Email,
        fixtures.accessCode,
      );
    });
    const tutor = await newAuthedPage(browser, async (ctxPage) => {
      await loginAsTutorViaApi(ctxPage, fixtures.tenantSlug);
    });

    try {
      const parentReadsTutorId = await parent.page.request.post(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/notifications/${fixtures.notificationIds.tutorHomeworkUnread}/read`,
        ),
      );
      expect(parentReadsTutorId.status()).toBe(404);

      const tutorReadsParentId = await tutor.page.request.post(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/notifications/${fixtures.notificationIds.parentAnnouncementDeepLink}/read`,
        ),
      );
      expect(tutorReadsParentId.status()).toBe(404);

      const parentCrossTenant = await parent.page.request.get(
        `/t/${fixtures.secondaryTenantSlug}/api/portal/notifications/unread-count`,
      );
      expect([401, 403, 404]).toContain(parentCrossTenant.status());

      const tutorCrossTenant = await tutor.page.request.get(
        `/t/${fixtures.secondaryTenantSlug}/api/portal/notifications?status=all&limit=10`,
      );
      expect([401, 403, 404]).toContain(tutorCrossTenant.status());

      const adminCrossTenant = await page.request.get(
        `/t/${fixtures.secondaryTenantSlug}/api/admin/reports/notifications-engagement?page=1&pageSize=25`,
      );
      expect([401, 403, 404]).toContain(adminCrossTenant.status());

      // Deep links must not bypass existing homework RBAC for unlinked students.
      await parent.page.goto(
        buildTenantPath(
          fixtures.tenantSlug,
          `/portal/homework/${fixtures.homeworkItemIds.parentUnlinked}`,
        ),
      );
      await expect(parent.page.getByTestId("parent-homework-detail-error")).toBeVisible();
      const deniedPageHtml = await parent.page.content();
      expect(deniedPageHtml).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);

      const parentPayload = JSON.stringify(
        await fetchPortalNotifications(parent.page, fixtures.tenantSlug, {
          status: "all",
          limit: 50,
        }),
      );
      expect(findNotificationsLeakMatch(parentPayload)).toBeNull();
      expect(parentPayload).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);
      expect(parentPayload).not.toContain("recipientUserId");

      const tutorPayload = JSON.stringify(
        await fetchPortalNotifications(tutor.page, fixtures.tenantSlug, {
          status: "all",
          limit: 50,
        }),
      );
      expect(findNotificationsLeakMatch(tutorPayload)).toBeNull();
      expect(tutorPayload).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);
      expect(tutorPayload).not.toContain("recipientUserId");

      const reportResponse = await page.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          "/api/admin/reports/notifications-engagement?page=1&pageSize=25",
        ),
      );
      expect(reportResponse.status()).toBe(200);
      const reportPayload = JSON.stringify(await reportResponse.json());
      expect(findNotificationsLeakMatch(reportPayload)).toBeNull();
      expect(reportPayload).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);
      expect(reportPayload).not.toContain("recipientUserId");

      const reportCsvResponse = await page.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          "/api/admin/reports/notifications-engagement.csv?page=1&pageSize=100",
        ),
      );
      expect(reportCsvResponse.status()).toBe(200);
      const reportCsv = await reportCsvResponse.text();
      const parsedCsv = parseNotificationsCsv(reportCsv);
      expect(parsedCsv.headers).not.toEqual(
        expect.arrayContaining(["recipientUserId", "userId", "email"]),
      );
      expect(findNotificationsLeakMatch(reportCsv)).toBeNull();
      expect(reportCsv).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);
    } finally {
      await Promise.all([parent.context.close(), tutor.context.close()]);
    }
  });
});
