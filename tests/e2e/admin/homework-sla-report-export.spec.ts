// Step 23.2 admin SLA E2E covers deterministic metrics, URL-state persistence, CSV export parity, and empty dataset handling.
import { expect, test } from "@playwright/test";

import { findHomeworkLeakMatch, parseHomeworkCsv } from "../helpers/homework";
import { resolveStep232Fixtures } from "../helpers/step232";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type HomeworkDetailPayload = {
  session: {
    tutorId: string;
  };
};

type SlaReportPayload = {
  countsByStatus: {
    ASSIGNED: number;
    SUBMITTED: number;
    REVIEWED: number;
  };
  avgReviewHours: number | null;
  reviewedDurationCount: number;
  breakdownRows: Array<{
    assignedCount: number;
    submittedCount: number;
    reviewedCount: number;
  }>;
};

function parseFiltersFromUrl(urlValue: string) {
  const url = new URL(urlValue);
  const rawFilters = url.searchParams.get("filters");
  if (!rawFilters) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(rawFilters) as Record<string, string>;
    return parsed;
  } catch {
    return {} as Record<string, string>;
  }
}

test.describe("[regression] Step 23.2 admin homework SLA report + CSV", () => {
  test("SLA metrics and CSV export respect filters, persist URL state, and avoid URLs/leaks", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();

    // Resolve the "other tutor" id from deterministic homework detail to keep assertions env-agnostic.
    const detailResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/homework/${fixtures.homeworkItemIds.tutorOther}`,
      ),
    );
    expect(detailResponse.status()).toBe(200);
    const detailPayload = (await detailResponse.json()) as HomeworkDetailPayload;
    const otherTutorId = detailPayload.session.tutorId;

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/admin/reports/homework-sla"));
    await expect(page.getByTestId("homework-sla-report-page")).toBeVisible();

    await page.getByRole("button", { name: /filters/i }).click();
    await page.locator("#homework-sla-tutor").selectOption(otherTutorId);

    await expect
      .poll(() => parseFiltersFromUrl(page.url()).tutorId || "")
      .toBe(otherTutorId);

    const filteredReportResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/reports/homework-sla"),
      {
        params: {
          tutorId: otherTutorId,
        },
      },
    );
    expect(filteredReportResponse.status()).toBe(200);
    const filteredReport = (await filteredReportResponse.json()) as SlaReportPayload;

    expect(filteredReport.countsByStatus.ASSIGNED).toBe(
      fixtures.expectedSlaForOtherTutor.assigned,
    );
    expect(filteredReport.countsByStatus.SUBMITTED).toBe(
      fixtures.expectedSlaForOtherTutor.submitted,
    );
    expect(filteredReport.countsByStatus.REVIEWED).toBe(
      fixtures.expectedSlaForOtherTutor.reviewed,
    );
    expect(filteredReport.reviewedDurationCount).toBe(
      fixtures.expectedSlaForOtherTutor.reviewedDurationCount,
    );
    expect(Number(filteredReport.avgReviewHours?.toFixed(2) || 0)).toBe(
      fixtures.expectedSlaForOtherTutor.avgReviewHours,
    );

    await expect(page.getByTestId("homework-sla-report-page")).toContainText(
      String(fixtures.expectedSlaForOtherTutor.assigned),
    );
    await expect(page.getByTestId("homework-sla-report-page")).toContainText(
      String(fixtures.expectedSlaForOtherTutor.submitted),
    );
    await expect(page.getByTestId("homework-sla-report-page")).toContainText(
      String(fixtures.expectedSlaForOtherTutor.reviewed),
    );

    await page.reload();
    await expect
      .poll(() => parseFiltersFromUrl(page.url()).tutorId || "")
      .toBe(otherTutorId);

    const [csvRequest, csvResponse] = await Promise.all([
      page.waitForRequest((request) =>
        request.url().includes("/api/admin/reports/homework-sla.csv"),
      ),
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/reports/homework-sla.csv") &&
          response.request().method() === "GET",
      ),
      page.getByRole("button", { name: /export csv/i }).click(),
    ]);
    expect(csvResponse.status()).toBe(200);

    const csvProbe = await page.request.get(csvRequest.url());
    expect(csvProbe.status()).toBe(200);
    const csvText = await csvProbe.text();
    expect(findHomeworkLeakMatch(csvText)).toBeNull();

    const parsedCsv = parseHomeworkCsv(csvText);
    expect(parsedCsv.headers).toEqual(
      expect.arrayContaining([
        "center",
        "tutor",
        "assigned",
        "submitted",
        "reviewed",
        "reviewedDurationCount",
        "avgReviewHours",
      ]),
    );
    expect(parsedCsv.rows.length).toBe(1);
    expect(parsedCsv.rows[0]?.assigned).toBe(String(fixtures.expectedSlaForOtherTutor.assigned));
    expect(parsedCsv.rows[0]?.submitted).toBe(String(fixtures.expectedSlaForOtherTutor.submitted));
    expect(parsedCsv.rows[0]?.reviewed).toBe(String(fixtures.expectedSlaForOtherTutor.reviewed));

    await page.getByRole("button", { name: /filters/i }).click();
    // Use a very old end-date to force an empty dataset without relying on both date fields updating in lockstep.
    await page.locator("#homework-sla-to").fill("2000-01-01");

    await expect
      .poll(() => {
        const filters = parseFiltersFromUrl(page.url());
        return `${filters.to || ""}`;
      })
      .toBe("2000-01-01");

    await expect(
      page.getByTestId("homework-sla-report-table").getByTestId("admin-table-empty"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /export csv/i })).toBeDisabled();

    // Empty export is still validated via API so we can assert headers-only behavior even when UI button is disabled.
    const filtersParam = new URL(page.url()).searchParams.get("filters") || "{}";
    const emptyCsvResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/reports/homework-sla.csv"),
      {
        params: {
          filters: filtersParam,
        },
      },
    );
    expect(emptyCsvResponse.status()).toBe(200);
    const emptyCsvText = await emptyCsvResponse.text();
    expect(findHomeworkLeakMatch(emptyCsvText)).toBeNull();
    const emptyCsvParsed = parseHomeworkCsv(emptyCsvText);
    expect(emptyCsvParsed.headers.length).toBeGreaterThan(0);
    expect(emptyCsvParsed.rows.length).toBe(0);
  });
});
