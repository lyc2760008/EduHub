// Users CRUD test covering create, update, and persisted selections.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { uniqueString } from "..\/helpers/data";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Users - CRUD", () => {
  test("Admin can create and update a tutor user", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const unique = uniqueString("e2e-user");
    const userEmail = `e2e.tutor+${unique}@example.com`;
    const userName = `E2E Tutor ${unique}`;

    await loginViaUI(page, { email, password, tenantSlug });

    // Ensure at least one center exists so the user can be assigned during create.
    const centersResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/centers?includeInactive=true"),
    );
    expect(centersResponse.status()).toBe(200);

    const centersPayload = await centersResponse.json();
    if (Array.isArray(centersPayload) && centersPayload.length === 0) {
      const centerName = uniqueString("E2E Center");
      const createCenterResponse = await page.request.post(
        buildTenantApiPath(tenantSlug, "/api/centers"),
        {
          data: {
            name: centerName,
            timezone: "America/Edmonton",
          },
        },
      );

      expect(createCenterResponse.status()).toBe(201);
    }

    await page.goto(buildTenantPath(tenantSlug, "/admin/users"));
    await expect(page.getByTestId("users-page")).toBeVisible();

    await page.getByTestId("create-user-button").click();
    await expect(page.getByTestId("user-email-input")).toBeVisible();

    await page.getByTestId("user-email-input").fill(userEmail);
    await page.getByTestId("user-name-input").fill(userName);
    await page.getByTestId("user-roles-select").selectOption("Tutor");

    const createCenters = page
      .getByTestId("user-centers-select")
      .locator('input[type="checkbox"]');
    const centerCount = await createCenters.count();

    if (centerCount === 0) {
      throw new Error("E2E requires at least one center to assign staff.");
    }

    // Select the first center during create to ensure at least one assignment.
    await createCenters.nth(0).check();

    const saveButton = page.getByTestId("save-user-button");
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();
    await expect(page.getByTestId("save-user-button")).toHaveCount(0);
    await expect(page.getByTestId("users-table")).toBeVisible();
    await expect(page.getByTestId("users-table").getByText(userEmail)).toBeVisible();

    const editButton = page.locator(
      `[data-testid="edit-user-button"][data-user-email="${userEmail}"]`,
    );
    await editButton.click();
    await expect(page.getByTestId("user-roles-select")).toBeVisible();

    await page.getByTestId("user-roles-select").selectOption("Parent");

    const editCenters = page
      .getByTestId("user-centers-select")
      .locator('input[type="checkbox"]');

    // Add a second center when available to confirm center updates persist.
    if (centerCount > 1) {
      await editCenters.nth(1).check();
    }

    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();
    await expect(page.getByTestId("save-user-button")).toHaveCount(0);
    await expect(page.getByTestId("users-table")).toBeVisible();

    // Re-open edit to assert the updated selections persisted.
    await editButton.click();
    await expect(page.getByTestId("user-roles-select")).toHaveValue("Parent");
    await expect(editCenters.nth(0)).toBeChecked();

    if (centerCount > 1) {
      await expect(editCenters.nth(1)).toBeChecked();
    }
  });
});



