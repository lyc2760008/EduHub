// Friendly error states should render for unlinked portal resources.
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
  resolveUnlinkedStudentId,
} from "./helpers/portal";

test.describe("Parent portal friendly errors", () => {
  test("Unlinked student detail renders not-available template", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `Portal error tests must target the e2e-testing tenant; got ${tenantSlug}.`,
      );
    }
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    const unlinkedStudentId = await resolveUnlinkedStudentId(page);
    await page.goto(buildPortalPath(tenantSlug, `/students/${unlinkedStudentId}`));

    await expect(page.getByTestId("portal-student-not-found")).toBeVisible();
    await expect(page.getByTestId("portal-student-detail-page")).toHaveCount(0);
  });
});
