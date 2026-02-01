// Empty state coverage for parents with zero linked students.
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent0Credentials,
  resolvePortalTenantSlug,
} from "./helpers/portal";

test.describe("Parent portal empty states", () => {
  test("Parent with no linked students sees empty states", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const credentials = await resolveParent0Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);
    await expect(page.getByTestId("portal-empty-noStudents")).toBeVisible();

    await page.goto(buildPortalPath(tenantSlug, "/students"));
    await expect(page.getByTestId("portal-empty-noStudents")).toBeVisible();

    await page.goto(buildPortalPath(tenantSlug, "/sessions"));
    await expect(page.getByTestId("portal-empty-noStudents")).toBeVisible();
  });
});
