// Setup navigation smoke test ensures the modern sidebar routes to core setup pages.
import { expect, test, type Page } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { assertTenantContext, buildTenantPath } from "..\/helpers/tenant";

async function ensureGroupOpen(page: Page, groupId: string) {
  const toggle = page.getByTestId(`admin-nav-group-${groupId}`);
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
  await expect(page.getByTestId(`admin-nav-group-${groupId}-items`)).toBeVisible();
}

// Tagged for Playwright suite filtering.
test.describe("Setup navigation", () => {
  test("[regression][nav] Admin can open Programs and navigate to Subjects/Levels", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    // Tenant context check ensures the session is scoped to the expected tenant.
    await assertTenantContext(page, tenantSlug);

    const programsPath = buildTenantPath(tenantSlug, "/admin/programs");
    const subjectsPath = buildTenantPath(tenantSlug, "/admin/subjects");
    const levelsPath = buildTenantPath(tenantSlug, "/admin/levels");

    await page.goto(buildTenantPath(tenantSlug, "/admin"));
    await ensureGroupOpen(page, "setup");

    // Navigate to Programs from the setup group to exercise active-state logic.
    await page.getByTestId("nav-link-programs").click();
    await page.waitForURL((url) => url.pathname.startsWith(programsPath));
    await expect(page.getByTestId("programs-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-programs")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Navigate to Subjects without relying on text labels.
    await page.getByTestId("nav-link-subjects").click();
    await page.waitForURL((url) => url.pathname.startsWith(subjectsPath));
    await expect(page.getByTestId("subjects-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-subjects")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Navigate to Levels and confirm the active state updates.
    await page.getByTestId("nav-link-levels").click();
    await page.waitForURL((url) => url.pathname.startsWith(levelsPath));
    await expect(page.getByTestId("levels-page")).toBeVisible();
    await expect(page.getByTestId("nav-link-levels")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});



