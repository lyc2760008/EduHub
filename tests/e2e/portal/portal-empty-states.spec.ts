// Empty state coverage for parents with a linked student but no upcoming sessions.
import { expect, test } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent0Credentials,
  resolvePortalTenantSlug,
} from "..\/helpers/portal";

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent portal empty states", () => {
  test("Parent with no upcoming sessions sees empty sessions state", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const credentials = await resolveParent0Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    await page.goto(buildPortalPath(tenantSlug, "/sessions"));
    await expect(page.getByTestId("portal-empty-noUpcomingSessions")).toBeVisible();
  });
});


