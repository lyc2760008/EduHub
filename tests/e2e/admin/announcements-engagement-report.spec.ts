// Step 22.8 engagement/report E2E coverage validates aggregates, CSV parity, and security/RBAC/tenant guards.
import { expect, test, type Browser } from "@playwright/test";

import {
  findAnnouncementsLeakMatch,
  parseAnnouncementsCsv,
  parsePageUrl,
} from "../helpers/announcements";
import { loginAsAdmin, loginAsTutorViaApi } from "../helpers/auth";
import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import {
  STEP228_BODY_LEAK_SENTINEL,
  STEP228_NO_MATCH_SEARCH,
  STEP228_TITLES,
  resolveStep228Fixtures,
} from "../helpers/step228";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type EngagementResponse = {
  items: Array<{
    announcementId: string;
    title: string;
    totalReads: number;
    readRate: number | null;
    eligibleCount: number | null;
  }>;
};

type PortalAnnouncementsListResponse = {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

function resolveBaseUrl() {
  return process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000";
}

async function markAnnouncementReadAsParent(
  browser: Browser,
  tenantSlug: string,
  parentEmail: string,
  accessCode: string,
  announcementId: string,
) {
  const context = await browser.newContext({ baseURL: resolveBaseUrl() });
  const page = await context.newPage();
  try {
    await loginAsParentWithAccessCode(page, tenantSlug, parentEmail, accessCode);
    const response = await page.request.post(
      buildTenantApiPath(
        tenantSlug,
        `/api/portal/announcements/${announcementId}/read`,
      ),
      {
        headers: { "x-tenant-slug": tenantSlug },
      },
    );
    expect(response.status()).toBe(200);
  } finally {
    await context.close();
  }
}

async function markAnnouncementReadAsTutor(
  browser: Browser,
  tenantSlug: string,
  announcementId: string,
) {
  const context = await browser.newContext({ baseURL: resolveBaseUrl() });
  const page = await context.newPage();
  try {
    await loginAsTutorViaApi(page, tenantSlug);
    const response = await page.request.post(
      buildTenantApiPath(
        tenantSlug,
        `/api/portal/announcements/${announcementId}/read`,
      ),
      {
        headers: { "x-tenant-slug": tenantSlug },
      },
    );
    expect(response.status()).toBe(200);
  } finally {
    await context.close();
  }
}

test.describe("[regression] Step 22.8 Announcement engagement + CSV", () => {
  test("Engagement report shows deterministic read counts and CSV export matches filters", async ({
    page,
    browser,
  }) => {
    const fixtures = resolveStep228Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    // Make report assertions deterministic by applying explicit read actions in this test.
    await markAnnouncementReadAsParent(
      browser,
      fixtures.tenantSlug,
      fixtures.parentA1Email,
      fixtures.accessCode,
      fixtures.announcementIds.pub2,
    );
    await markAnnouncementReadAsTutor(
      browser,
      fixtures.tenantSlug,
      fixtures.announcementIds.pub2,
    );

    await page.goto(
      `${buildTenantPath(fixtures.tenantSlug, "/admin/announcements/engagement")}?sortField=publishedAt&sortDir=desc&page=1&pageSize=25`,
    );
    await expect(page.getByTestId("admin-announcements-engagement-page")).toBeVisible();
    await expect(page.getByTestId("announcements-engagement-report")).toBeVisible();

    const searchInput = page.getByTestId("announcements-engagement-search-input");
    await searchInput.fill(STEP228_TITLES.pub2);
    await page.waitForRequest(
      (request) =>
        request.url().includes("/api/admin/announcements/engagement") &&
        request.url().includes(`search=${encodeURIComponent(STEP228_TITLES.pub2)}`),
    );
    await expect.poll(() => parsePageUrl(page).searchParams.get("search") ?? "").toBe(
      STEP228_TITLES.pub2,
    );

    const listQuery = parsePageUrl(page).searchParams.toString();
    const engagementResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/announcements/engagement?${listQuery}`,
      ),
    );
    expect(engagementResponse.status()).toBe(200);
    const engagementPayload = (await engagementResponse.json()) as EngagementResponse;
    const pub2Row = engagementPayload.items.find((item) => item.title === STEP228_TITLES.pub2);
    expect(pub2Row).toBeTruthy();
    expect(pub2Row?.totalReads).toBe(2);
    expect(pub2Row?.eligibleCount).toBeNull();
    expect(pub2Row?.readRate).toBeNull();

    const uiRow = page
      .locator('[data-testid^="announcement-engagement-"]')
      .filter({ hasText: STEP228_TITLES.pub2 })
      .first();
    await expect(uiRow).toBeVisible();
    await expect(uiRow).toContainText("2");

    const listUrlBeforeExport = parsePageUrl(page);
    const [exportRequest, exportResponse] = await Promise.all([
      page.waitForRequest((request) =>
        request.url().includes("/api/admin/announcements/engagement.csv"),
      ),
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/announcements/engagement.csv") &&
          response.request().method() === "GET",
      ),
      page.getByTestId("announcements-engagement-search-export-csv").click(),
    ]);

    expect(exportResponse.ok()).toBeTruthy();
    const exportUrl = new URL(exportRequest.url());
    expect(exportUrl.searchParams.get("search") ?? "").toBe(
      listUrlBeforeExport.searchParams.get("search") ?? "",
    );
    expect(exportUrl.searchParams.get("sortField") ?? "").toBe(
      listUrlBeforeExport.searchParams.get("sortField") ?? "",
    );
    expect(exportUrl.searchParams.get("sortDir") ?? "").toBe(
      listUrlBeforeExport.searchParams.get("sortDir") ?? "",
    );
    expect(exportUrl.searchParams.get("filters") ?? "").toBe(
      listUrlBeforeExport.searchParams.get("filters") ?? "",
    );

    // Probe CSV via API for deterministic body assertions across blob-download browser differences.
    const csvProbeResponse = await page.request.get(exportRequest.url());
    expect(csvProbeResponse.ok()).toBeTruthy();
    const csvContent = await csvProbeResponse.text();
    const parsedCsv = parseAnnouncementsCsv(csvContent);
    expect(parsedCsv.headers).toEqual(
      expect.arrayContaining([
        "announcementId",
        "title",
        "publishedAt",
        "status",
        "totalReads",
        "readsParent",
        "readsTutor",
        "readsAdmin",
      ]),
    );
    expect(parsedCsv.rows.length).toBeGreaterThanOrEqual(1);
    expect(parsedCsv.rows.every((row) => row.title.includes(STEP228_TITLES.pub2))).toBeTruthy();

    const leakMatch = findAnnouncementsLeakMatch(csvContent, {
      forbiddenSentinel: STEP228_BODY_LEAK_SENTINEL,
    });
    expect(leakMatch).toBeNull();
    expect(csvContent).not.toContain(STEP228_BODY_LEAK_SENTINEL);
    expect(csvContent).not.toContain("E2E_BODY_PUB_2");
  });

  test("Engagement CSV export handles empty datasets gracefully", async ({ page }) => {
    const fixtures = resolveStep228Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);
    await page.goto(buildTenantPath(fixtures.tenantSlug, "/admin/announcements/engagement"));
    await expect(page.getByTestId("announcements-engagement-report")).toBeVisible();

    await page.getByTestId("announcements-engagement-search-input").fill(STEP228_NO_MATCH_SEARCH);
    await page.waitForRequest((request) =>
      request.url().includes("/api/admin/announcements/engagement"),
    );
    await expect(
      page
        .locator('[data-testid="announcements-engagement-table"] [data-testid="admin-table-empty"]')
        .first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("announcements-engagement-search-export-csv"),
    ).toBeDisabled();

    const query = parsePageUrl(page).searchParams.toString();
    const csvResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/announcements/engagement.csv?${query}`,
      ),
    );
    expect(csvResponse.status()).toBe(200);
    const parsed = parseAnnouncementsCsv(await csvResponse.text());
    expect(parsed.headers.length).toBeGreaterThanOrEqual(1);
    expect(parsed.rows.length).toBe(0);
  });

  test("Security: RBAC + tenant isolation + safe payload fields for announcements routes", async ({
    page,
    browser,
  }) => {
    const fixtures = resolveStep228Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/admin/announcements"));
    await expect(page.getByTestId("admin-announcements-page")).toBeVisible();
    // Step 22.8 v1 remains tenant-wide only; no center-scope selector should appear.
    await expect(page.getByTestId("announcement-filter-scope")).toHaveCount(0);
    await expect(page.getByTestId("admin-announcements-table")).toContainText(
      /Tenant-wide|全租户/i,
    );

    const parentContext = await browser.newContext({ baseURL: resolveBaseUrl() });
    const parentPage = await parentContext.newPage();
    try {
      await loginAsParentWithAccessCode(
        parentPage,
        fixtures.tenantSlug,
        fixtures.parentA1Email,
        fixtures.accessCode,
      );
      await parentPage.goto(buildTenantPath(fixtures.tenantSlug, "/admin/announcements"));
      await expect(
        parentPage.locator('[data-testid="access-denied"], [data-testid="login-page"]'),
      ).toBeVisible();

      const parentAdminApi = await parentPage.request.get(
        buildTenantApiPath(fixtures.tenantSlug, "/api/admin/announcements?page=1&pageSize=10"),
      );
      expect([401, 403]).toContain(parentAdminApi.status());

      const parentPortalList = await parentPage.request.get(
        buildTenantApiPath(fixtures.tenantSlug, "/api/portal/announcements?limit=10"),
      );
      expect(parentPortalList.status()).toBe(200);
      const parentPortalPayload =
        (await parentPortalList.json()) as PortalAnnouncementsListResponse;
      for (const row of parentPortalPayload.items) {
        // Feed rows must stay minimal and never expose body content.
        expect(Object.prototype.hasOwnProperty.call(row, "body")).toBeFalsy();
      }
    } finally {
      await parentContext.close();
    }

    const tutorContext = await browser.newContext({ baseURL: resolveBaseUrl() });
    const tutorPage = await tutorContext.newPage();
    try {
      await loginAsTutorViaApi(tutorPage, fixtures.tenantSlug);
      await tutorPage.goto(buildTenantPath(fixtures.tenantSlug, "/admin/announcements"));
      await expect(
        tutorPage.locator('[data-testid="access-denied"], [data-testid="login-page"]'),
      ).toBeVisible();
      const tutorAdminApi = await tutorPage.request.get(
        buildTenantApiPath(fixtures.tenantSlug, "/api/admin/announcements?page=1&pageSize=10"),
      );
      expect([401, 403]).toContain(tutorAdminApi.status());
    } finally {
      await tutorContext.close();
    }

    await page.goto(buildTenantPath(fixtures.secondaryTenantSlug, "/admin/announcements"));
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="login-page"]'),
    ).toBeVisible();

    const crossTenantAnnouncementsApi = await page.request.get(
      `/t/${fixtures.secondaryTenantSlug}/api/admin/announcements?page=1&pageSize=10`,
    );
    expect([401, 403, 404]).toContain(crossTenantAnnouncementsApi.status());

    const crossTenantEngagementApi = await page.request.get(
      `/t/${fixtures.secondaryTenantSlug}/api/admin/announcements/engagement?page=1&pageSize=10`,
    );
    expect([401, 403, 404]).toContain(crossTenantEngagementApi.status());

    const engagementApi = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/announcements/engagement?page=1&pageSize=10"),
    );
    expect(engagementApi.status()).toBe(200);
    const engagementPayload = await engagementApi.json();
    // Engagement response must remain aggregate-only (no announcement bodies/secrets).
    expect(JSON.stringify(engagementPayload)).not.toContain('"body"');
  });
});
