// Step 22.8 tutor announcements E2E coverage validates published-only feed, detail rendering, and read idempotency.
import { expect, test } from "@playwright/test";

import { expectNoRawAnnouncementI18nKeys } from "../helpers/announcements";
import { STEP228_TITLES, resolveStep228Fixtures } from "../helpers/step228";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type PortalAnnouncementsListResponse = {
  items: Array<{
    id: string;
    title: string;
    unread: boolean;
  }>;
  nextCursor: string | null;
};

test.describe("[regression] Step 22.8 Tutor announcements", () => {
  test("Tutor feed/detail show published announcements and read receipts are idempotent", async ({
    page,
  }) => {
    const fixtures = resolveStep228Fixtures();

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/announcements"));
    await expect(page.getByTestId("tutor-announcements-feed")).toBeVisible();
    await expectNoRawAnnouncementI18nKeys(page);

    const listResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/portal/announcements?limit=50"),
    );
    expect(listResponse.status()).toBe(200);
    const listPayload = (await listResponse.json()) as PortalAnnouncementsListResponse;

    expect(listPayload.items.some((item) => item.title === STEP228_TITLES.pub1)).toBeTruthy();
    expect(listPayload.items.some((item) => item.title === STEP228_TITLES.pub2)).toBeTruthy();
    expect(listPayload.items.some((item) => item.title === STEP228_TITLES.draft1)).toBeFalsy();
    expect(listPayload.items.some((item) => item.title === STEP228_TITLES.arch1)).toBeFalsy();

    const unreadItem = listPayload.items.find((item) => item.unread);
    expect(unreadItem).toBeTruthy();
    const unreadTargetTitle = unreadItem?.title ?? STEP228_TITLES.search;
    const unreadTargetId = unreadItem?.id ?? fixtures.announcementIds.search;

    const pub2Link = page
      .locator('a[href*="/tutor/announcements/"]')
      .filter({ hasText: unreadTargetTitle })
      .first();
    await expect(pub2Link).toBeVisible();
    await expect(pub2Link).toContainText(/Unread|未读/i);

    await pub2Link.click();
    await expect(page.getByTestId("tutor-announcement-detail")).toBeVisible();
    await expect(page.locator("article")).toContainText(unreadTargetTitle);
    await expectNoRawAnnouncementI18nKeys(page);

    await page.getByRole("link", { name: /Back|返回/i }).first().click();
    await expect(page.getByTestId("tutor-announcements-feed")).toBeVisible();
    const pub2LinkAfterRead = page
      .locator('a[href*="/tutor/announcements/"]')
      .filter({ hasText: unreadTargetTitle })
      .first();
    await expect(pub2LinkAfterRead).toBeVisible();
    await expect(pub2LinkAfterRead).not.toContainText(/Unread|未读/i);

    await pub2LinkAfterRead.click();
    await expect(page.getByTestId("tutor-announcement-detail")).toBeVisible();

    // Read endpoint must be safely idempotent when called repeatedly.
    const readPath = buildTenantApiPath(
      fixtures.tenantSlug,
      `/api/portal/announcements/${unreadTargetId}/read`,
    );
    const readResponse1 = await page.request.post(readPath);
    expect(readResponse1.status()).toBe(200);
    const readResponse2 = await page.request.post(readPath);
    expect(readResponse2.status()).toBe(200);
  });
});
