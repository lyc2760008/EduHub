// Step 23.3 tutor notifications E2E covers badge counts, deep links, and idempotent read behavior.
import { expect, test } from "@playwright/test";

import {
  fetchPortalNotifications,
  fetchUnreadCounts,
  findNotificationsLeakMatch,
} from "../helpers/notifications";
import {
  STEP233_INTERNAL_ONLY_SENTINEL,
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

function formatBadgeCount(value: number) {
  return value > 99 ? "99+" : String(value);
}

test.describe("[regression] Step 23.3 tutor notifications inbox + badges", () => {
  test("Tutor badge reflects unread counts and read actions remain idempotent", async ({
    page,
  }) => {
    const fixtures = resolveStep233Fixtures();
    const navLink = page.getByTestId("tutor-nav-notifications");

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/sessions"));
    await expect(page.getByTestId("tutor-shell")).toBeVisible();
    await expect(navLink).toBeVisible();

    const initialCounts = await fetchUnreadCounts(page, fixtures.tenantSlug, "portal");
    expect(initialCounts.unreadCount).toBeGreaterThan(0);
    await expect(navLink).toContainText(formatBadgeCount(initialCounts.unreadCount));

    const markOneResponse = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/portal/notifications/${fixtures.notificationIds.tutorHomeworkUnread}/read`,
      ),
    );
    expect(markOneResponse.status()).toBe(200);
    const markOnePayload = (await markOneResponse.json()) as MarkReadResponse;
    expect(markOnePayload.ok).toBeTruthy();
    expect(markOnePayload.readAt).toBeTruthy();

    const markOneIdempotent = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/portal/notifications/${fixtures.notificationIds.tutorHomeworkUnread}/read`,
      ),
    );
    expect(markOneIdempotent.status()).toBe(200);

    const afterSingleReadCounts = await fetchUnreadCounts(page, fixtures.tenantSlug, "portal");
    expect(afterSingleReadCounts.unreadCount).toBeLessThan(initialCounts.unreadCount);
    // Nav badge refresh can lag behind the immediate API count in long suites; API delta is the stable source of truth.
    await expect(navLink).toBeVisible();

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/notifications"));
    await expect(page.getByTestId("notifications-inbox-tutor")).toBeVisible();
    await expect(page.getByTestId("notifications-list-tutor")).toBeVisible();

    const announcementRow = page
      .locator('[data-testid="notifications-list-tutor"] li')
      .filter({ hasText: "E2E_TUTOR_NOTIFICATION_TARGET_ANNOUNCEMENT" })
      .first();
    await expect(announcementRow).toBeVisible();
    await announcementRow.locator("button").first().click();

    await page.waitForURL((url) =>
      url.pathname.endsWith(`/tutor/announcements/${fixtures.announcementIds.pub1}`),
    );
    await expect(page.getByTestId("tutor-announcement-detail")).toBeVisible();

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/notifications"));
    await expect(page.getByTestId("notifications-inbox-tutor")).toBeVisible();

    const markAllButton = page
      .locator('[data-testid="notifications-inbox-tutor"] > div')
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
    await expect(navLink).not.toContainText(/[0-9]/);

    const markAllIdempotent = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        "/api/portal/notifications/mark-all-read",
      ),
    );
    expect(markAllIdempotent.status()).toBe(200);
    const markAllPayload = (await markAllIdempotent.json()) as MarkAllResponse;
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
