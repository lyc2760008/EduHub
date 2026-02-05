// Admin student create + parent link flow to validate persistence and tenant-safe linking.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { uniqueString } from "..\/helpers/data";
import { buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Students - Admin create + parent link", () => {
  test("Admin can create a student, link a parent, and see data after reload", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const uniqueToken = uniqueString("e2e-student");
    const firstName = `Test${uniqueToken}`;
    const lastName = "ParentLink";
    const fullName = `${firstName} ${lastName}`;
    const parentEmail = `e2e.parent+${uniqueToken}@example.com`;

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/students"));
    await expect(page.getByTestId("students-page")).toBeVisible();

    await page.getByTestId("create-student-button").click();
    await page.getByTestId("student-first-name-input").fill(firstName);
    await page.getByTestId("student-last-name-input").fill(lastName);
    await page.getByTestId("save-student-button").click();

    await expect(page.getByTestId("students-table")).toBeVisible();
    await expect(page.getByText(fullName)).toBeVisible();

    const studentRow = page.locator('tr[data-testid^="students-row-"]', {
      hasText: fullName,
    });
    const rowTestId = await studentRow.getAttribute("data-testid");
    if (!rowTestId) {
      throw new Error("Expected a student row data-testid to be present.");
    }
    const studentId = rowTestId.replace("students-row-", "");

    // Navigate to edit mode so parent linking inputs are enabled.
    await page.goto(
      buildTenantPath(tenantSlug, `/admin/students/${studentId}?mode=edit`),
    );
    await expect(page.getByTestId("student-detail-page")).toBeVisible();

    await page.getByTestId("parent-link-email").fill(parentEmail);
    await page.getByTestId("parent-link-submit").click();
    await expect(page.getByTestId("parents-table")).toBeVisible();
    await expect(page.getByText(parentEmail)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByText(parentEmail)).toBeVisible();
  });
});



