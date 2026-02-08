// Reports RBAC coverage ensures non-admin roles cannot access admin reports routes or APIs.
import { expect, test, type Page } from "@playwright/test";

import { loginAsParent, loginAsTutor } from "../../helpers/auth";
import { expectAdminBlocked } from "../../helpers/parent-auth";
import { buildTenantApiPath, buildTenantPath } from "../../helpers/tenant";
import { resolveTenantSlug } from "./_helpers";

function isTransientRequestError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ECONNREFUSED|socket hang up/i.test(error.message);
}

async function getWithRetry(
  page: Page,
  url: string,
  attempts = 3,
) {
  // Retry a few times so transient local server socket resets do not fail RBAC assertions.
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.request.get(url);
    } catch (error) {
      if (!isTransientRequestError(error) || attempt === attempts - 1) {
        throw error;
      }
      await page.waitForTimeout(250 * (attempt + 1));
    }
  }
  throw new Error("Unexpected request retry flow.");
}

test.describe("Admin Reports RBAC", () => {
  test("[regression][reports] parent is blocked from reports UI and endpoints", async ({
    page,
  }) => {
    const tenantSlug = resolveTenantSlug();

    await loginAsParent(page, tenantSlug);
    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));

    await expectAdminBlocked(page);
    await expect(page.getByTestId("reports-page")).toHaveCount(0);

    const response = await getWithRetry(
      page,
      buildTenantApiPath(tenantSlug, "/api/admin/reports/students"),
    );
    expect([401, 403]).toContain(response.status());
  });

  test("[regression][reports] tutor is blocked from reports UI and endpoints", async ({
    page,
  }) => {
    const tenantSlug = resolveTenantSlug();

    await loginAsTutor(page, tenantSlug);
    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));

    await expect(page.getByTestId("access-denied")).toBeVisible();
    await expect(page.getByTestId("reports-page")).toHaveCount(0);

    const response = await getWithRetry(
      page,
      buildTenantApiPath(tenantSlug, "/api/admin/reports/students"),
    );
    expect([401, 403]).toContain(response.status());
  });
});
