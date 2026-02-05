// Parent portal shell smoke checks to ensure the foundation renders reliably.
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "..\/helpers/auth";
import {
  loginAsParentWithAccessCode,
  prepareParentAccessCode,
} from "..\/helpers/parent-auth";
import { buildTenantPath } from "..\/helpers/tenant";

async function loginParentForShell(page: Page, tenantSlug?: string) {
  // Reuse the admin session to provision a parent before logging in as that parent.
  const { tenantSlug: resolvedTenant } = await loginAsAdmin(page, tenantSlug);
  const { parentEmail, accessCode } = await prepareParentAccessCode(
    page,
    resolvedTenant,
  );

  await page.context().clearCookies();
  await loginAsParentWithAccessCode(
    page,
    resolvedTenant,
    parentEmail,
    accessCode,
  );

  return resolvedTenant;
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent shell smoke", () => {
  test("Parent shell renders and locale toggle updates lang", async ({ page }) => {
    const tenantSlug = await loginParentForShell(page);
    // Parent portal entry point now lives under /portal.
    const portalPath = buildTenantPath(tenantSlug, "/portal");

    await page.goto(portalPath);

    await expect(page.getByTestId("parent-shell")).toBeVisible();
    await expect(page.getByTestId("parent-nav")).toBeVisible();
    await expect(page.getByTestId("parent-language-toggle")).toBeVisible();
    await expect(page.getByTestId("parent-content")).toBeVisible();

    // Prefer structural locale signals (html lang) over localized text assertions.
    const html = page.locator("html");
    const initialLang = await html.getAttribute("lang");
    if (initialLang) {
      await page.getByTestId("parent-language-toggle").click();
      await expect(html).not.toHaveAttribute("lang", initialLang);
    }
  });

  test("Parent shell stays usable on narrow viewports", async ({ page }) => {
    const tenantSlug = await loginParentForShell(page);
    // Parent portal entry point now lives under /portal.
    const portalPath = buildTenantPath(tenantSlug, "/portal");

    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(portalPath);

    await expect(page.getByTestId("parent-shell")).toBeVisible();

    // Mobile nav toggle is optional; assert visibility only if present.
    const navToggle = page.getByTestId("parent-nav-toggle");
    if (await navToggle.count()) {
      await expect(navToggle).toBeVisible();
    }

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBeFalsy();
  });
});


