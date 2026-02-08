// Reports toolkit coverage verifies URL-backed search/filter/sort/pagination behavior on report tables.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../../helpers/auth";
import { parsePageUrl, readFiltersFromUrl, openStudentsDirectoryReport, resolveTenantSlug } from "./_helpers";

test.describe("Admin Reports Toolkit URL State", () => {
  test("[regression][reports] debounced search + filters + sort + pagination persist in URL", async ({
    page,
  }) => {
    const tenantSlug = resolveTenantSlug();
    await loginAsAdmin(page, tenantSlug);
    await openStudentsDirectoryReport(page, tenantSlug);

    const searchInput = page.getByTestId("students-directory-search-input");
    const filtersButton = page.getByTestId("students-directory-search-filters-button");

    const searchTerm = `qa-${Date.now().toString().slice(-5)}`;
    await searchInput.fill(searchTerm);
    await page.waitForRequest(
      (request) =>
        request.url().includes("/api/admin/reports/students") &&
        request.url().includes(`search=${encodeURIComponent(searchTerm)}`),
    );
    await expect.poll(() => parsePageUrl(page).searchParams.get("search")).toBe(
      searchTerm,
    );

    await page.reload();
    await expect(searchInput).toHaveValue(searchTerm);
    await expect.poll(() => parsePageUrl(page).searchParams.get("search")).toBe(
      searchTerm,
    );

    await filtersButton.click();
    const levelSelect = page.locator("#students-directory-level");
    const levelOptionValue = await levelSelect
      .locator("option")
      .nth(1)
      .getAttribute("value");
    if (!levelOptionValue) {
      throw new Error("Expected at least one non-default level option.");
    }
    await page.getByTestId("admin-filters-sheet-close").click();

    // Apply a deterministic level filter through URL state to validate persistence behavior.
    const withLevelFilter = parsePageUrl(page);
    withLevelFilter.searchParams.set(
      "filters",
      JSON.stringify({ levelId: levelOptionValue, status: "ACTIVE" }),
    );
    await page.goto(withLevelFilter.toString());
    await expect
      .poll(() => readFiltersFromUrl(page).levelId)
      .toBe(levelOptionValue);

    await page.reload();
    await filtersButton.click();
    await expect(page.locator("#students-directory-level")).toHaveValue(
      levelOptionValue,
    );
    await page.getByTestId("admin-filters-sheet-close").click();

    const createdAtSort = page.getByTestId(
      "report-students-directory-table-sort-createdAt",
    );
    await createdAtSort.click();
    await expect
      .poll(() => parsePageUrl(page).searchParams.get("sortField"))
      .toBe("createdAt");
    await expect
      .poll(() => parsePageUrl(page).searchParams.get("sortDir"))
      .toBe("asc");

    await createdAtSort.click();
    await expect
      .poll(() => parsePageUrl(page).searchParams.get("sortDir"))
      .toBe("desc");

    await page.reload();
    await expect
      .poll(() => parsePageUrl(page).searchParams.get("sortField"))
      .toBe("createdAt");
    await expect
      .poll(() => parsePageUrl(page).searchParams.get("sortDir"))
      .toBe("desc");

    await expect(page.getByTestId("admin-pagination-range")).toBeVisible();
    await expect(page.getByTestId("admin-pagination-page-size")).toBeVisible();

    const nextButton = page.getByTestId("admin-pagination-next");
    if ((await nextButton.count()) === 0) {
      await expect(nextButton).toHaveCount(0);
    } else if (await nextButton.isEnabled()) {
      await nextButton.click();
      await expect.poll(() => parsePageUrl(page).searchParams.get("page")).toBe(
        "2",
      );
    } else {
      await expect(nextButton).toBeDisabled();
    }
  });
});
