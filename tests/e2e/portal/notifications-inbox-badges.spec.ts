// Step 23.3 parent notifications E2E covers badge cap, inbox deep links, and idempotent read flows.
import { expect, test } from "@playwright/test";

import {
  fetchPortalNotifications,
  fetchUnreadCounts,
  findNotificationsLeakMatch,
} from "../helpers/notifications";
import {
  STEP233_INTERNAL_ONLY_SENTINEL,
  STEP233_PARENT_UNREAD_CAP_COUNT,
  resolveStep233Fixtures,
} from "../helpers/step233";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type MarkReadResponse = {
  ok: boolean;
  readAt: string | null;
};

type MarkAllResponse = {
  ok: boolean;
  markedReadCount: number;
};

test.describe("[regression] Step 23.3 parent notifications inbox + badges", () => {
  test("Parent badge cap/deep-links/read actions are correct and tenant-safe", async ({
    page,
  }) => {
    const fixtures = resolveStep233Fixtures();
    const notificationsNavLink = page.locator(
      `a[href$="/${fixtures.tenantSlug}/portal/notifications"]`,
    );

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/portal/homework"));
    await expect(page.getByTestId("parent-homework-inbox-page")).toBeVisible();
    await expect(notificationsNavLink).toBeVisible();

    const initialCounts = await fetchUnreadCounts(page, fixtures.tenantSlug, "portal");
    expect(initialCounts.unreadCount).toBeGreaterThanOrEqual(STEP233_PARENT_UNREAD_CAP_COUNT);
    await expect(notificationsNavLink).toContainText("99+");

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/portal/notifications"));
    await expect(page.getByTestId("notifications-inbox-portal")).toBeVisible();
    await expect(page.getByTestId("notifications-list-portal")).toBeVisible();
    // Unread rows render a secondary action button; this avoids locale-coupled text selectors.
    await expect(
      page.locator('[data-testid="notifications-list-portal"] li button:nth-of-type(2)').first(),
    ).toBeVisible();

    const beforeReadCounts = await fetchUnreadCounts(page, fixtures.tenantSlug, "portal");
    const announcementRow = page
      .locator('[data-testid="notifications-list-portal"] li')
      .filter({ hasText: "E2E_PARENT_NOTIFICATION_TARGET_ANNOUNCEMENT" })
      .first();
    await expect(announcementRow).toBeVisible();
    await announcementRow.locator("button").first().click();

    await page.waitForURL((url) =>
      url.pathname.endsWith(
        `/portal/announcements/${fixtures.announcementIds.pub1}`,
      ),
    );
    await expect(page.getByTestId("parent-announcement-detail")).toBeVisible();

    const markReadProbe = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/portal/notifications/${fixtures.notificationIds.parentAnnouncementDeepLink}/read`,
      ),
    );
    expect(markReadProbe.status()).toBe(200);
    const markReadPayload = (await markReadProbe.json()) as MarkReadResponse;
    expect(markReadPayload.ok).toBeTruthy();
    expect(markReadPayload.readAt).toBeTruthy();

    const afterReadCounts = await fetchUnreadCounts(page, fixtures.tenantSlug, "portal");
    expect(afterReadCounts.unreadCount).toBeLessThan(beforeReadCounts.unreadCount);

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/portal/notifications"));
    await expect(page.getByTestId("notifications-inbox-portal")).toBeVisible();

    const deniedRow = page
      .locator('[data-testid="notifications-list-portal"] li')
      .filter({ hasText: "E2E_PARENT_NOTIFICATION_TARGET_DENIED_HOMEWORK" })
      .first();
    await expect(deniedRow).toBeVisible();
    await deniedRow.locator("button").first().click();

    await page.waitForURL((url) =>
      url.pathname.endsWith(
        `/portal/homework/${fixtures.homeworkItemIds.parentUnlinked}`,
      ),
    );
    await expect(page.getByTestId("parent-homework-detail-error")).toBeVisible();
    // Denied destination must stay generic and never leak the internal Step 23.3 sentinel.
    const deniedHtml = await page.content();
    expect(deniedHtml).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/portal/notifications"));
    await expect(page.getByTestId("notifications-inbox-portal")).toBeVisible();

    const markAllButton = page
      .locator('[data-testid="notifications-inbox-portal"] > div')
      .first()
      .locator("button")
      .first();
    await expect(markAllButton).toBeEnabled();
    await markAllButton.click();

    await expect
      .poll(async () => {
        const counts = await fetchUnreadCounts(page, fixtures.tenantSlug, "portal");
        return counts.unreadCount;
      })
      .toBe(0);

    // Count badges are hidden when unread count is zero.
    await expect(notificationsNavLink).not.toContainText(/[0-9]/);

    const markAllProbe = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        "/api/portal/notifications/mark-all-read",
      ),
    );
    expect(markAllProbe.status()).toBe(200);
    const markAllPayload = (await markAllProbe.json()) as MarkAllResponse;
    expect(markAllPayload.ok).toBeTruthy();
    expect(markAllPayload.markedReadCount).toBe(0);

    const listPayload = await fetchPortalNotifications(page, fixtures.tenantSlug, {
      status: "all",
      limit: 50,
    });
    const serializedPayload = JSON.stringify(listPayload);
    expect(findNotificationsLeakMatch(serializedPayload)).toBeNull();
    expect(serializedPayload).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);
  });
});
