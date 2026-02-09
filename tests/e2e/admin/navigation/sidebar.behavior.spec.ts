// Admin navigation tests validate sidebar behavior, active state, and responsive drawer.
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "..\/..\/helpers\/auth";
import { assertTenantContext, buildTenantPath } from "..\/..\/helpers\/tenant";

async function ensureGroupOpen(page: Page, groupId: string) {
  const toggle = page.getByTestId(`admin-nav-group-${groupId}`);
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
  await expect(page.getByTestId(`admin-nav-group-${groupId}-items`)).toBeVisible();
}

test.describe("Admin navigation sidebar", () => {
  test("[regression][nav] sidebar groups expand and collapse", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    await assertTenantContext(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin"));
    await expect(page.getByTestId("admin-sidebar")).toBeVisible();

    const groupId = "setup";
    const toggle = page.getByTestId(`admin-nav-group-${groupId}`);
    await ensureGroupOpen(page, groupId);

    await toggle.click();
    await expect(page.getByTestId(`admin-nav-group-${groupId}-items`)).toHaveCount(0);

    await toggle.click();
    await expect(page.getByTestId(`admin-nav-group-${groupId}-items`)).toBeVisible();
  });

  test("[regression][nav] active state highlights major sections", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    await assertTenantContext(page, tenantSlug);

    const cases = [
      { groupId: null, navId: "dashboard", path: "/admin", testId: "admin-dashboard-page" },
      { groupId: "people", navId: "students", path: "/admin/students", testId: "students-page" },
      { groupId: "people", navId: "parents", path: "/admin/parents", testId: "parents-page" },
      { groupId: "people", navId: "staff", path: "/admin/users", testId: "users-page" },
      { groupId: "setup", navId: "groups", path: "/admin/groups", testId: "groups-page" },
      { groupId: "setup", navId: "programs", path: "/admin/programs", testId: "programs-page" },
      { groupId: "setup", navId: "subjects", path: "/admin/subjects", testId: "subjects-page" },
      { groupId: "setup", navId: "levels", path: "/admin/levels", testId: "levels-page" },
      { groupId: "operations", navId: "sessions", path: "/admin/sessions", testId: "sessions-list-page" },
      { groupId: "operations", navId: "requests", path: "/admin/requests", testId: "requests-page" },
      { groupId: "operations", navId: "audit", path: "/admin/audit", testId: "audit-log-page" },
      { groupId: "reports", navId: "reports", path: "/admin/reports", testId: "reports-page" },
    ];

    for (const entry of cases) {
      if (entry.groupId) {
        await ensureGroupOpen(page, entry.groupId);
      }
      await page.getByTestId(`nav-link-${entry.navId}`).click();
      await page.waitForURL((url) =>
        url.pathname.startsWith(buildTenantPath(tenantSlug, entry.path)),
      );
      await expect(page.getByTestId(entry.testId)).toBeVisible();
      await expect(page.getByTestId(`nav-link-${entry.navId}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
    }

    await ensureGroupOpen(page, "reports");
    await page.getByTestId("nav-link-reports-upcoming").click();
    await page.waitForURL((url) =>
      url.pathname.startsWith(
        buildTenantPath(tenantSlug, "/admin/reports/upcoming-sessions"),
      ),
    );
    await expect(page.getByTestId("report-upcoming-sessions")).toBeVisible();
    await expect(page.getByTestId("nav-link-reports-upcoming")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("[regression][nav] mobile drawer opens and closes at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    const { tenantSlug } = await loginAsAdmin(page);

    await page.goto(buildTenantPath(tenantSlug, "/admin"));
    await page.getByTestId("admin-topbar-menu").click();
    await expect(page.getByTestId("admin-mobile-drawer")).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.body.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBeFalsy();

    await page.getByTestId("admin-mobile-drawer-close").click();
    await expect(page.getByTestId("admin-mobile-drawer")).toHaveCount(0);
  });

  test("[regression][nav] keyboard focus reaches nav controls", async ({ page }) => {
    const { tenantSlug } = await loginAsAdmin(page);
    await page.goto(buildTenantPath(tenantSlug, "/admin"));

    await page.getByTestId("admin-topbar-menu").focus();
    await expect(page.getByTestId("admin-topbar-menu")).toBeFocused();

    await page.getByTestId("nav-link-dashboard").focus();
    await expect(page.getByTestId("nav-link-dashboard")).toBeFocused();
  });
});
