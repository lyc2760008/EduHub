// Step 22.8 admin announcements E2E coverage: lifecycle actions plus table toolkit URL-state behavior.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import { parsePageUrl, readFiltersFromUrl } from "../helpers/announcements";
import { STEP228_SEARCH_MARKER, STEP228_TITLES, resolveStep228Fixtures } from "../helpers/step228";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

test.describe("[regression] Step 22.8 Admin announcements", () => {
  test("Admin can create draft, edit, publish, and archive an announcement", async ({ page }) => {
    const fixtures = resolveStep228Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const createTitle = `E2E_ADMIN_CREATE_${Date.now()}`;
    const createBody = "E2E_ADMIN_CREATE_BODY";
    const editedTitle = `${createTitle}_EDITED`;
    const editedBody = `${createBody}_EDITED`;

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/admin/announcements/new"));
    await expect(page.getByTestId("admin-announcement-create-page")).toBeVisible();

    await page.getByTestId("admin-announcement-title").fill(createTitle);
    await page.getByTestId("admin-announcement-body").fill(createBody);
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/announcements") &&
        response.request().method() === "POST" &&
        response.status() === 201,
    );
    await page.getByTestId("admin-announcement-save").click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();

    await expect
      .poll(() => {
        const match = parsePageUrl(page).pathname.match(/\/admin\/announcements\/([^/]+)$/);
        if (!match || match[1] === "new") return "";
        return match[1];
      })
      .not.toBe("");
    const createdPathMatch = parsePageUrl(page).pathname.match(
      /\/admin\/announcements\/([^/]+)$/,
    );
    const createdAnnouncementId =
      createdPathMatch?.[1] && createdPathMatch[1] !== "new"
        ? createdPathMatch[1]
        : "";
    expect(createdAnnouncementId).not.toBe("");
    await expect(page.getByTestId("admin-announcement-title")).toHaveValue(createTitle);
    await expect(page.getByTestId("admin-announcement-body")).toHaveValue(createBody);

    await page.getByTestId("admin-announcement-title").fill(editedTitle);
    await page.getByTestId("admin-announcement-body").fill(editedBody);
    const editResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/admin/announcements/${createdAnnouncementId}`) &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
    );
    await page.getByTestId("admin-announcement-save").click();
    const editResponse = await editResponsePromise;
    expect(editResponse.ok()).toBeTruthy();
    const editedDetailResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/announcements/${createdAnnouncementId}`,
      ),
    );
    expect(editedDetailResponse.status()).toBe(200);
    const editedPayload = (await editedDetailResponse.json()) as {
      item?: { title?: string; body?: string };
    };
    expect(editedPayload.item?.title).toBe(editedTitle);
    expect(editedPayload.item?.body).toBe(editedBody);

    await page.reload();
    await expect(page.getByTestId("admin-announcement-title")).toHaveValue(editedTitle);
    await expect(page.getByTestId("admin-announcement-body")).toHaveValue(editedBody);

    await page.getByTestId("admin-announcement-publish").click();
    await page
      .locator("div.fixed.inset-0")
      .getByRole("button", { name: /Confirm|确认/i })
      .click();
    await expect(page.locator("span").filter({ hasText: /Published|已发布/i })).toBeVisible();

    await page.getByTestId("admin-announcement-archive").click();
    await page
      .locator("div.fixed.inset-0")
      .getByRole("button", { name: /Confirm|确认/i })
      .click();
    await expect(page.locator("span").filter({ hasText: /Archived|已归档/i })).toBeVisible();
  });

  test("Admin list supports search/filter/sort/pagination with URL state persistence", async ({
    page,
  }) => {
    const fixtures = resolveStep228Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    await page.goto(
      `${buildTenantPath(fixtures.tenantSlug, "/admin/announcements")}?sortField=createdAt&sortDir=desc&page=1&pageSize=25`,
    );
    await expect(page.getByTestId("admin-announcements-page")).toBeVisible();
    await expect(page.getByTestId("admin-announcements-table")).toBeVisible();

    const searchInput = page.getByTestId("announcements-list-search-input");
    await searchInput.fill(STEP228_SEARCH_MARKER);
    await page.waitForRequest(
      (request) =>
        request.url().includes("/api/admin/announcements") &&
        request.url().includes(`search=${encodeURIComponent(STEP228_SEARCH_MARKER)}`),
    );
    await expect.poll(() => parsePageUrl(page).searchParams.get("search") ?? "").toBe(
      STEP228_SEARCH_MARKER,
    );
    await expect(page.getByTestId("admin-announcements-table")).toContainText(
      STEP228_SEARCH_MARKER,
    );

    await searchInput.fill("");
    await page.waitForRequest((request) => request.url().includes("/api/admin/announcements"));
    await expect.poll(() => parsePageUrl(page).searchParams.get("search") ?? "").toBe("");

    await page.getByTestId("announcements-list-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("announcement-filter-status").selectOption("DRAFT");
    await page.getByTestId("admin-filters-sheet-close").click();
    await expect.poll(() => String(readFiltersFromUrl(page).status ?? "")).toBe("DRAFT");
    await expect(page.getByTestId("admin-announcements-table")).toContainText(
      STEP228_TITLES.draft1,
    );

    await page.getByTestId("admin-announcements-table-sort-createdAt").click();
    await expect.poll(() => parsePageUrl(page).searchParams.get("sortField") ?? "").toBe(
      "",
    );
    await expect.poll(() => parsePageUrl(page).searchParams.get("sortDir") ?? "").toBe("");

    await page.getByTestId("announcements-list-search-filters-clear-all").click();
    await expect.poll(() => String(readFiltersFromUrl(page).status ?? "")).toBe("");

    const firstRowBeforePageChange =
      (await page.locator('[data-testid^="announcement-row-"]').first().getAttribute("data-testid")) ||
      "";
    await page.getByTestId("admin-pagination-next").click();
    await expect.poll(() => parsePageUrl(page).searchParams.get("page") ?? "").toBe("2");
    const firstRowAfterPageChange =
      (await page.locator('[data-testid^="announcement-row-"]').first().getAttribute("data-testid")) ||
      "";
    expect(firstRowBeforePageChange).not.toBe("");
    expect(firstRowAfterPageChange).not.toBe("");
    expect(firstRowAfterPageChange).not.toBe(firstRowBeforePageChange);

    await page.reload();
    await expect.poll(() => parsePageUrl(page).searchParams.get("page") ?? "").toBe("2");
    await expect.poll(() => parsePageUrl(page).searchParams.get("sortField") ?? "").toBe(
      "createdAt",
    );
    await expect.poll(() => parsePageUrl(page).searchParams.get("sortDir") ?? "").toBe("desc");
  });
});
