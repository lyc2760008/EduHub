// Step 23.3 admin report E2E validates notifications aggregates, URL state, and CSV export safety.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import {
  findNotificationsLeakMatch,
  parseFiltersFromUrl,
  parseNotificationsCsv,
} from "../helpers/notifications";
import { STEP233_INTERNAL_ONLY_SENTINEL, resolveStep233Fixtures } from "../helpers/step233";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

test.describe("[regression] Step 23.3 admin notifications engagement report", () => {
  test("Report filters/URL state/CSV export are aggregate-only and deterministic", async ({
    page,
  }) => {
    const fixtures = resolveStep233Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const announcementOnlyParams = new URLSearchParams({
      page: "1",
      pageSize: "25",
      sortField: "sentCount",
      sortDir: "desc",
      filters: JSON.stringify({ type: "ANNOUNCEMENT" }),
    });
    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/admin/reports/notifications-engagement?${announcementOnlyParams.toString()}`,
      ),
    );
    await expect(page.getByTestId("admin-notifications-engagement-page")).toBeVisible();
    await expect(page.getByTestId("notifications-engagement-report")).toBeVisible();

    await expect
      .poll(() => String(parseFiltersFromUrl(page).type ?? ""))
      .toBe("ANNOUNCEMENT");
    const urlBeforeReload = page.url();
    await page.reload();
    await expect(page.getByTestId("notifications-engagement-report")).toBeVisible();
    expect(page.url()).toBe(urlBeforeReload);

    const listQuery = new URL(page.url()).searchParams.toString();
    const listResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/reports/notifications-engagement?${listQuery}`,
      ),
    );
    expect(listResponse.status()).toBe(200);
    const listPayload = (await listResponse.json()) as {
      items?: Array<{ type: string }>;
    };
    const rows = listPayload.items ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.type === "ANNOUNCEMENT")).toBeTruthy();

    const [csvRequest, csvResponse] = await Promise.all([
      page.waitForRequest((request) =>
        request.url().includes("/api/admin/reports/notifications-engagement.csv"),
      ),
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/reports/notifications-engagement.csv") &&
          response.request().method() === "GET",
      ),
      page.getByTestId("notifications-engagement-search-export-csv").click(),
    ]);
    expect(csvResponse.ok()).toBeTruthy();

    const csvProbe = await page.request.get(csvRequest.url());
    expect(csvProbe.status()).toBe(200);
    const csvText = await csvProbe.text();
    const parsed = parseNotificationsCsv(csvText);
    expect(parsed.headers).toEqual(
      expect.arrayContaining([
        "type",
        "audienceRole",
        "sentCount",
        "readCount",
        "readRate",
        "avgTimeToReadHours",
      ]),
    );
    expect(parsed.headers).not.toEqual(
      expect.arrayContaining(["recipientUserId", "userId", "email"]),
    );
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.every((row) => row.type === "ANNOUNCEMENT")).toBeTruthy();
    expect(findNotificationsLeakMatch(csvText)).toBeNull();
    expect(csvText).not.toContain(STEP233_INTERNAL_ONLY_SENTINEL);

    await page.getByTestId("notifications-engagement-search-input").fill(
      fixtures.reportEmptySearch,
    );
    await page.waitForRequest((request) =>
      request.url().includes("/api/admin/reports/notifications-engagement"),
    );
    await expect(
      page
        .locator('[data-testid="notifications-engagement-table"] [data-testid="admin-table-empty"]')
        .first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("notifications-engagement-search-export-csv"),
    ).toBeDisabled();

    const emptyQuery = new URL(page.url()).searchParams.toString();
    const emptyCsvResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/reports/notifications-engagement.csv?${emptyQuery}`,
      ),
    );
    expect(emptyCsvResponse.status()).toBe(200);
    const emptyCsv = parseNotificationsCsv(await emptyCsvResponse.text());
    expect(emptyCsv.headers.length).toBeGreaterThan(0);
    expect(emptyCsv.rows.length).toBe(0);
  });
});
