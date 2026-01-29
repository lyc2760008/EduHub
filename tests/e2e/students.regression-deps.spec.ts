// Regression smoke to ensure groups roster, 1:1 student select, and reports still load.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Students - Regression dependencies", () => {
  test("Groups roster, sessions 1:1 student select, and reports load", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));
    await expect(page.getByTestId("groups-page")).toBeVisible();
    await page.getByTestId("manage-group-link").first().click();
    await expect(page.getByTestId("group-roster-student-select")).toBeVisible();

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();
    await page.getByTestId("sessions-create-button").click();
    await expect(page.getByTestId("one-to-one-student-select")).toBeVisible();

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));
    await expect(page.getByTestId("reports-page")).toBeVisible();
  });
});
