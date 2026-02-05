// Playwright coverage for audit log entries on access code resets (Step 20.8C).
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { createStudentAndLinkParent, resetParentAccessCode } from "./helpers/parent-auth";
import { buildTenantPath } from "./helpers/tenant";

test.describe("Audit log access code reset", () => {
  test("Audit log shows access code reset without exposing the code", async ({
    page,
  }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `Audit log tests must target e2e-testing; got ${tenantSlug}.`,
      );
    }

    const { parentId } = await createStudentAndLinkParent(page, tenantSlug);
    const accessCode = await resetParentAccessCode(page, tenantSlug, parentId);

    const auditResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/audit") &&
        response.request().method() === "GET",
    );
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await auditResponsePromise;

    const filterResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/audit") &&
        response.request().method() === "GET",
    );
    await page.getByTestId("audit-category-filter").selectOption("auth");
    await filterResponsePromise;

    const actionCell = page.locator(
      '[data-testid="audit-row-action"][data-action="PARENT_ACCESS_CODE_RESET"]',
    );
    await expect(actionCell.first()).toBeVisible();

    const row = actionCell.first().locator("xpath=ancestor::tr");
    await row.click();

    const detailDrawer = page.getByTestId("audit-detail-drawer");
    await expect(detailDrawer).toBeVisible();
    await expect(detailDrawer).not.toContainText(accessCode);
  });
});
