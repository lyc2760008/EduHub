// Step 22.9 admin bulk-apply/report coverage validates duplicate skips, URL-state report behavior, CSV, and RBAC.
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin, loginAsTutorViaApi } from "../helpers/auth";
import {
  findSessionResourcesLeakMatch,
  parseMissingResourcesUrlState,
  parseSessionResourcesCsv,
} from "../helpers/sessionResources";
import {
  STEP229_INTERNAL_LEAK_SENTINEL,
  STEP229_RESOURCE_TITLES,
  STEP229_RESOURCE_URLS,
  resolveStep229Fixtures,
} from "../helpers/step229";
import { buildTenantUrl, loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type MissingResourcesResponse = {
  rows: Array<{ sessionId: string }>;
  totalCount: number;
};

function dateOnlyOffset(daysFromToday: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + daysFromToday);
  return value.toISOString().slice(0, 10);
}

function buildMissingResourcesQuery(from: string, to: string, search?: string) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "100",
    sortField: "startAt",
    sortDir: "asc",
    filters: JSON.stringify({ from, to }),
  });
  if (search) {
    params.set("search", search);
  }
  return params.toString();
}

async function fetchMissingResourcesRows(page: Page, tenantSlug: string, query: string) {
  const response = await page.request.get(
    buildTenantApiPath(
      tenantSlug,
      `/api/admin/reports/sessions-missing-resources?${query}`,
    ),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as MissingResourcesResponse;
}

function resolveBaseUrl() {
  return process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000";
}

async function checkRow(page: Page, sessionId: string) {
  const row = page.getByTestId(`sessions-row-${sessionId}`);
  await expect(row).toBeVisible();
  await row.locator('input[type="checkbox"]').first().check();
}

test.describe("[regression] Step 22.9 bulk apply + missing-resources report", () => {
  test("Bulk apply skips duplicates and removes S2 from the missing-resources report", async ({
    page,
  }) => {
    const fixtures = resolveStep229Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const from = dateOnlyOffset(-1);
    const to = dateOnlyOffset(21);
    const reportQuery = buildMissingResourcesQuery(from, to);

    const preReport = await fetchMissingResourcesRows(page, fixtures.tenantSlug, reportQuery);
    const preIds = new Set(preReport.rows.map((row) => row.sessionId));
    expect(preIds.has(fixtures.sessionIds.tutorASecond)).toBeTruthy();
    expect(preIds.has(fixtures.sessionIds.tutorAFirst)).toBeFalsy();

    const sessionsListUrl = buildTenantPath(
      fixtures.tenantSlug,
      `/admin/sessions?page=1&pageSize=100&sortField=startAt&sortDir=asc&filters=${encodeURIComponent(
        JSON.stringify({ from, to }),
      )}`,
    );
    await page.goto(sessionsListUrl);
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();

    await checkRow(page, fixtures.sessionIds.tutorAFirst);
    await checkRow(page, fixtures.sessionIds.tutorASecond);
    await page.getByTestId("sessions-bulk-apply-action").click();

    const modal = page.getByRole("heading", {
      name: /bulk apply resources|批量添加资料/i,
    }).locator("..").locator("..");
    await expect(modal).toBeVisible();
    await modal.getByLabel(/type|类型/i).selectOption("HOMEWORK");
    await modal.getByLabel(/title|标题/i).fill(STEP229_RESOURCE_TITLES.duplicateSeed);
    await modal.getByLabel(/url|链接/i).fill(STEP229_RESOURCE_URLS.duplicateSeed);

    const bulkResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/sessions/resources/bulk-apply") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("sessions-bulk-apply-confirm").click();
    const bulkResponse = await bulkResponsePromise;
    expect(bulkResponse.status()).toBe(200);
    const summary = (await bulkResponse.json()) as {
      sessionsProcessed: number;
      sessionsUpdated: number;
      resourcesAttempted: number;
      resourcesCreated: number;
      duplicatesSkipped: number;
    };
    expect(summary.sessionsProcessed).toBe(2);
    expect(summary.sessionsUpdated).toBe(1);
    expect(summary.resourcesAttempted).toBe(2);
    expect(summary.resourcesCreated).toBe(1);
    expect(summary.duplicatesSkipped).toBe(1);

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/admin/sessions/${fixtures.sessionIds.tutorASecond}`,
      ),
    );
    await expect(page.getByTestId("session-resources-list")).toBeVisible();
    await expect(
      page
        .locator('[data-testid="session-resources-list"] li')
        .filter({ hasText: STEP229_RESOURCE_TITLES.duplicateSeed }),
    ).toHaveCount(1);

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/admin/sessions/${fixtures.sessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByTestId("session-resources-list")).toBeVisible();
    await expect(
      page
        .locator('[data-testid="session-resources-list"] li')
        .filter({ hasText: STEP229_RESOURCE_TITLES.duplicateSeed }),
    ).toHaveCount(1);

    const postReport = await fetchMissingResourcesRows(page, fixtures.tenantSlug, reportQuery);
    const postIds = new Set(postReport.rows.map((row) => row.sessionId));
    expect(postIds.has(fixtures.sessionIds.tutorASecond)).toBeFalsy();
  });

  test("Missing-resources report keeps URL state, exports CSV safely, and handles empty datasets", async ({
    page,
  }) => {
    const fixtures = resolveStep229Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    await page.goto(
      buildTenantPath(fixtures.tenantSlug, "/admin/reports/sessions-missing-resources"),
    );
    await expect(page.getByTestId("report-missing-resources")).toBeVisible();

    const searchInput = page.getByTestId("missing-resources-search-input");
    await searchInput.fill("E2E");
    await page.waitForRequest((request) =>
      request.url().includes("/api/admin/reports/sessions-missing-resources"),
    );
    await page.getByTestId("missing-resources-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("admin-filters-sheet-close").click();

    await expect
      .poll(() => parseMissingResourcesUrlState(page).search)
      .toBe("E2E");
    await expect
      .poll(() =>
        String(parseMissingResourcesUrlState(page).filters.to ?? ""),
      )
      .not.toBe("");

    await page.reload();
    await expect(searchInput).toHaveValue("E2E");
    await expect
      .poll(() =>
        String(parseMissingResourcesUrlState(page).filters.to ?? ""),
      )
      .not.toBe("");

    const [exportRequest, exportResponse] = await Promise.all([
      page.waitForRequest((request) =>
        request.url().includes("/api/admin/reports/sessions-missing-resources.csv"),
      ),
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/reports/sessions-missing-resources.csv") &&
          response.request().method() === "GET",
      ),
      page.getByTestId("missing-resources-search-export-csv").click(),
    ]);
    expect(exportResponse.ok()).toBeTruthy();

    const currentUrl = new URL(page.url());
    const exportUrl = new URL(exportRequest.url());
    expect(exportUrl.searchParams.get("search") ?? "").toBe(
      currentUrl.searchParams.get("search") ?? "",
    );
    expect(exportUrl.searchParams.get("sortField") ?? "").toBe(
      currentUrl.searchParams.get("sortField") ?? "",
    );
    expect(exportUrl.searchParams.get("sortDir") ?? "").toBe(
      currentUrl.searchParams.get("sortDir") ?? "",
    );
    expect(exportUrl.searchParams.get("filters") ?? "").toBe(
      currentUrl.searchParams.get("filters") ?? "",
    );

    const csvProbe = await page.request.get(exportRequest.url());
    expect(csvProbe.status()).toBe(200);
    const csvContent = await csvProbe.text();
    const parsedCsv = parseSessionResourcesCsv(csvContent);
    expect(parsedCsv.headers).toEqual(
      expect.arrayContaining([
        "sessionDateTime",
        "context",
        "tutor",
        "hasResources",
        "resourceCount",
      ]),
    );
    expect(
      findSessionResourcesLeakMatch(csvContent, {
        forbiddenSentinel: STEP229_INTERNAL_LEAK_SENTINEL,
      }),
    ).toBeNull();

    const jsonProbe = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/reports/sessions-missing-resources?${currentUrl.searchParams.toString()}`,
      ),
    );
    expect(jsonProbe.status()).toBe(200);
    const jsonPayload = await jsonProbe.json();
    const jsonSerialized = JSON.stringify(jsonPayload);
    expect(
      findSessionResourcesLeakMatch(jsonSerialized, {
        forbiddenSentinel: STEP229_INTERNAL_LEAK_SENTINEL,
      }),
    ).toBeNull();

    await searchInput.fill(fixtures.reportNoMatchSearch);
    await page.waitForRequest((request) =>
      request.url().includes("/api/admin/reports/sessions-missing-resources"),
    );
    await expect(
      page
        .locator('[data-testid="report-missing-resources-table"] [data-testid="admin-table-empty"]')
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId("missing-resources-search-export-csv")).toBeDisabled();

    const emptyQuery = new URL(page.url()).searchParams.toString();
    const emptyCsvResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/reports/sessions-missing-resources.csv?${emptyQuery}`,
      ),
    );
    expect(emptyCsvResponse.status()).toBe(200);
    const parsedEmptyCsv = parseSessionResourcesCsv(await emptyCsvResponse.text());
    expect(parsedEmptyCsv.headers.length).toBeGreaterThanOrEqual(1);
    expect(parsedEmptyCsv.rows.length).toBe(0);
  });

  test("Security: cross-tenant requests and non-admin report/bulk endpoints are blocked", async ({
    page,
    browser,
  }) => {
    const fixtures = resolveStep229Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const crossTenantResourcesResponse = await page.request.get(
      buildTenantUrl(
        fixtures.secondaryTenantSlug,
        `/api/admin/sessions/${fixtures.sessionIds.crossTenant}/resources`,
      ),
      {
        headers: {
          "x-tenant-slug": fixtures.secondaryTenantSlug,
        },
      },
    );
    expect([403, 404]).toContain(crossTenantResourcesResponse.status());

    const tutorContext = await browser.newContext({ baseURL: resolveBaseUrl() });
    const tutorPage = await tutorContext.newPage();
    try {
      await loginAsTutorViaApi(tutorPage, fixtures.tenantSlug);
      const tutorReportResponse = await tutorPage.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          "/api/admin/reports/sessions-missing-resources",
        ),
      );
      expect([401, 403]).toContain(tutorReportResponse.status());
      const tutorBulkResponse = await tutorPage.request.post(
        buildTenantApiPath(
          fixtures.tenantSlug,
          "/api/admin/sessions/resources/bulk-apply",
        ),
        {
          data: {
            sessionIds: [fixtures.sessionIds.tutorAFirst],
            resources: [
              {
                title: "E2E_TUTOR_FORBIDDEN_BULK",
                type: "HOMEWORK",
                url: "https://example.com/e2e-tutor-forbidden-bulk",
              },
            ],
          },
        },
      );
      expect([401, 403]).toContain(tutorBulkResponse.status());
    } finally {
      await tutorContext.close();
    }

    const parentContext = await browser.newContext({ baseURL: resolveBaseUrl() });
    const parentPage = await parentContext.newPage();
    try {
      await loginAsParentWithAccessCode(
        parentPage,
        fixtures.tenantSlug,
        fixtures.parentA1Email,
        fixtures.accessCode,
      );
      const parentReportResponse = await parentPage.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          "/api/admin/reports/sessions-missing-resources",
        ),
      );
      expect([401, 403]).toContain(parentReportResponse.status());
      const parentBulkResponse = await parentPage.request.post(
        buildTenantApiPath(
          fixtures.tenantSlug,
          "/api/admin/sessions/resources/bulk-apply",
        ),
        {
          data: {
            sessionIds: [fixtures.sessionIds.tutorAFirst],
            resources: [
              {
                title: "E2E_PARENT_FORBIDDEN_BULK",
                type: "HOMEWORK",
                url: "https://example.com/e2e-parent-forbidden-bulk",
              },
            ],
          },
        },
      );
      expect([401, 403]).toContain(parentBulkResponse.status());
    } finally {
      await parentContext.close();
    }
  });
});
