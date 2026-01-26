// Admin catalog CRUD test covering Subject/Level/Program creation and linkage.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { uniqueString } from "./helpers/data";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Catalog - CRUD", () => {
  test("Admin can create subject, level, and program", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const subjectName = uniqueString("E2E Subject");
    const levelName = uniqueString("E2E Level");
    const programName = uniqueString("E2E Program");

    await loginViaUI(page, { email, password, tenantSlug });

    // Create Subject.
    await page.goto(buildTenantPath(tenantSlug, "/admin/subjects"));
    await expect(page.getByTestId("subjects-page")).toBeVisible();

    await page.getByTestId("create-subject-button").click();
    await page.getByTestId("subject-name-input").fill(subjectName);
    await page.getByTestId("save-subject-button").click();

    await expect(page.getByTestId("subjects-table")).toContainText(subjectName);

    // Create Level.
    await page.goto(buildTenantPath(tenantSlug, "/admin/levels"));
    await expect(page.getByTestId("levels-page")).toBeVisible();

    await page.getByTestId("create-level-button").click();
    await page.getByTestId("level-name-input").fill(levelName);
    await page.getByTestId("level-sortorder-input").fill("10");
    await page.getByTestId("save-level-button").click();

    await expect(page.getByTestId("levels-table")).toContainText(levelName);

    // Create Program referencing the Subject.
    await page.goto(buildTenantPath(tenantSlug, "/admin/programs"));
    await expect(page.getByTestId("programs-page")).toBeVisible();

    await page.getByTestId("create-program-button").click();
    await page.getByTestId("program-name-input").fill(programName);
    await expect(page.getByTestId("program-subject-select")).toContainText(
      subjectName,
    );
    await page
      .getByTestId("program-subject-select")
      .selectOption({ label: subjectName });
    await page.getByTestId("save-program-button").click();

    await expect(page.getByTestId("programs-table")).toContainText(programName);
    await expect(page.getByTestId("programs-table")).toContainText(subjectName);
  });
});
