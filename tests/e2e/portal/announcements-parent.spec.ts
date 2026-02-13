// Step 22.8 parent announcements E2E coverage validates published-only feed, detail rendering, and read idempotency.
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

test.describe("[regression] Step 22.8 Parent announcements", () => {
  test("Parent feed/detail show published announcements and read receipts are idempotent", async ({
    page,
  }) => {
    const fixtures = resolveStep228Fixtures();

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/portal/announcements"));
    await expect(page.getByTestId("parent-announcements-feed")).toBeVisible();
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

    const seededPub1 = listPayload.items.find((item) => item.title === STEP228_TITLES.pub1);
    expect(seededPub1?.unread).toBeTruthy();

    const pub1Link = page
      .locator('a[href*="/portal/announcements/"]')
      .filter({ hasText: STEP228_TITLES.pub1 })
      .first();
    await expect(pub1Link).toBeVisible();
    await expect(pub1Link).toContainText(/Unread|未读/i);

    await pub1Link.click();
    await expect(page.getByTestId("parent-announcement-detail")).toBeVisible();
    await expect(page.locator("article")).toContainText("E2E_BODY_PUB_1");
    await expectNoRawAnnouncementI18nKeys(page);

    await page.getByRole("link", { name: /Back|返回/i }).first().click();
    await expect(page.getByTestId("parent-announcements-feed")).toBeVisible();
    const pub1LinkAfterRead = page
      .locator('a[href*="/portal/announcements/"]')
      .filter({ hasText: STEP228_TITLES.pub1 })
      .first();
    await expect(pub1LinkAfterRead).toBeVisible();
    await expect(pub1LinkAfterRead).not.toContainText(/Unread|未读/i);

    await pub1LinkAfterRead.click();
    await expect(page.getByTestId("parent-announcement-detail")).toBeVisible();

    // Read endpoint must be safely idempotent when called repeatedly.
    const readPath = buildTenantApiPath(
      fixtures.tenantSlug,
      `/api/portal/announcements/${fixtures.announcementIds.pub1}/read`,
    );
    const readResponse1 = await page.request.post(readPath);
    expect(readResponse1.status()).toBe(200);
    const readResponse2 = await page.request.post(readPath);
    expect(readResponse2.status()).toBe(200);
  });
});
