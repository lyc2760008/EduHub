// Step 22.9 parent resource coverage validates linked visibility and unlinked/cross-tenant access denial.
import { expect, test } from "@playwright/test";

import { buildTenantUrl, resolveOtherTenantSlug } from "../helpers/parent-auth";
import { buildPortalApiPath, buildPortalPath } from "../helpers/portal";
import { resolveStep229Fixtures } from "../helpers/step229";

const NOT_FOUND_STATUSES = [403, 404];

test.describe("[regression] Step 22.9 portal session resources", () => {
  test("Parent sees linked-session resources and cannot access unlinked sessions", async ({
    page,
  }) => {
    const fixtures = resolveStep229Fixtures();

    await page.goto(
      buildPortalPath(fixtures.tenantSlug, `/sessions/${fixtures.sessionIds.tutorAFirst}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    const resourcesSection = page.getByTestId("portal-session-resources");
    await expect(resourcesSection).toBeVisible();
    await expect(resourcesSection).toContainText("E2E_RESOURCE_EXISTING");
    await expect(
      resourcesSection
        .locator("li")
        .filter({ hasText: "E2E_RESOURCE_EXISTING" })
        .getByRole("link", { name: /open link|打开链接/i }),
    ).toHaveAttribute("href", "https://example.com/e2e-resource");
    await expect(
      resourcesSection.getByRole("button", { name: /add resource|添加资料/i }),
    ).toHaveCount(0);
    await expect(
      resourcesSection.getByRole("button", { name: /edit|编辑/i }),
    ).toHaveCount(0);
    await expect(
      resourcesSection.getByRole("button", { name: /delete|删除/i }),
    ).toHaveCount(0);

    await page.goto(
      buildPortalPath(fixtures.tenantSlug, `/sessions/${fixtures.sessionIds.unlinked}`),
    );
    await expect(page.getByTestId("portal-session-detail-not-found")).toBeVisible();
    await expect(page.getByTestId("portal-session-detail-page")).toHaveCount(0);

    const unlinkedResponse = await page.request.get(
      buildPortalApiPath(fixtures.tenantSlug, `/sessions/${fixtures.sessionIds.unlinked}`),
    );
    expect(NOT_FOUND_STATUSES).toContain(unlinkedResponse.status());

    const otherTenantSlug = resolveOtherTenantSlug(fixtures.tenantSlug);
    const crossTenantResponse = await page.request.get(
      buildTenantUrl(
        otherTenantSlug,
        `/api/portal/sessions/${fixtures.sessionIds.tutorAFirst}`,
      ),
      {
        headers: {
          "x-tenant-slug": otherTenantSlug,
        },
      },
    );
    expect(NOT_FOUND_STATUSES).toContain(crossTenantResponse.status());
  });
});
