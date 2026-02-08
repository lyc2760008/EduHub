// Reports CSV export coverage validates query propagation, row cap, and secret-safe payloads.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../../helpers/auth";
import { buildTenantPath } from "../../helpers/tenant";
import { parsePageUrl, resolveTenantSlug, containsForbiddenSecret } from "./_helpers";

test.describe("Admin Reports CSV Export", () => {
  test("[regression][reports] CSV export respects current query state and omits sensitive fields", async ({
    page,
  }) => {
    const tenantSlug = resolveTenantSlug();
    await loginAsAdmin(page, tenantSlug);
    await page.goto(
      `${buildTenantPath(
        tenantSlug,
        "/admin/reports/students-directory",
      )}?sortField=createdAt&sortDir=desc&page=1&pageSize=25`,
    );
    await expect(page.getByTestId("report-students-directory")).toBeVisible();
    await expect(page.getByTestId("report-students-directory-table")).toBeVisible();

    const searchInput = page.getByTestId("students-directory-search-input");
    const exportButton = page.getByTestId("students-directory-search-export-csv");

    let token = "";
    if ((await page.getByTestId("admin-table-empty").count()) === 0) {
      const firstCell = page
        .locator('[data-testid="report-students-directory-table"] tbody tr')
        .first()
        .locator("td")
        .first();
      const raw = (await firstCell.innerText()).trim();
      token = raw.split(/\s+/)[0]?.slice(0, 3) ?? "";
    }

    if (token.length >= 2) {
      await searchInput.fill(token);
      await page.waitForRequest(
        (request) =>
          request.url().includes("/api/admin/reports/students") &&
          request.url().includes(`search=${encodeURIComponent(token)}`),
      );
      await expect.poll(() => parsePageUrl(page).searchParams.get("search")).toBe(
        token,
      );
    }

    const listUrlBeforeExport = parsePageUrl(page);
    const [exportRequest, exportResponse] = await Promise.all([
      page.waitForRequest((request) =>
        request.url().includes("/api/admin/reports/students/export"),
      ),
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/reports/students/export") &&
          response.request().method() === "GET",
      ),
      exportButton.click(),
    ]);

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

    expect(exportResponse.ok()).toBeTruthy();
    // Re-fetch via API client for deterministic body assertions across blob-based download flows.
    const csvProbeResponse = await page.request.get(exportRequest.url());
    expect(csvProbeResponse.ok()).toBeTruthy();
    const csvContent = await csvProbeResponse.text();

    expect(csvContent).toContain(",");

    const normalizedLines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const rowCount = Math.max(0, normalizedLines.length - 1);
    expect(rowCount).toBeLessThanOrEqual(5000);

    const forbiddenMatch = containsForbiddenSecret(csvContent);
    expect(forbiddenMatch).toBeUndefined();

    if (token.length >= 2 && rowCount > 0) {
      expect(csvContent.toLowerCase()).toContain(token.toLowerCase());
    }
  });
});
