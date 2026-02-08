// Shared helpers for reports E2E specs to keep URL/filter assertions consistent.
import { expect, type Page } from "@playwright/test";
import { buildTenantPath } from "../../helpers/tenant";

export function resolveTenantSlug() {
  return process.env.E2E_TENANT_SLUG || "e2e-testing";
}

export function parsePageUrl(page: Page) {
  return new URL(page.url());
}

export function readFiltersFromUrl(page: Page) {
  const filtersRaw = parsePageUrl(page).searchParams.get("filters");
  if (!filtersRaw) return {};
  try {
    const parsed = JSON.parse(filtersRaw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function expectReportsPageLoaded(page: Page) {
  // Reports index card shell should be visible before running report-level checks.
  await expect(page.getByTestId("reports-page")).toBeVisible();
}

export async function openStudentsDirectoryReport(page: Page, tenantSlug: string) {
  await page.goto(buildTenantPath(tenantSlug, "/admin/reports/students-directory"));
  await expect(page.getByTestId("report-students-directory")).toBeVisible();
  await expect(page.getByTestId("report-students-directory-table")).toBeVisible();
}

export function containsForbiddenSecret(csvContent: string) {
  const forbidden = ["accesscode", "reset", "token", "cookie", "password"];
  const normalized = csvContent.toLowerCase();
  return forbidden.find((needle) => normalized.includes(needle));
}
