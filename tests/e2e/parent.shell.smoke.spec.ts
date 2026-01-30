// Parent portal shell smoke checks to ensure the foundation renders reliably.
import { expect, test } from "@playwright/test";

import { buildTenantPath } from "./helpers/tenant";

test.describe("Parent shell smoke", () => {
  test("Parent shell renders and locale toggle updates lang", async ({ page }) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";
    const parentPath = buildTenantPath(tenantSlug, "/parent");

    await page.goto(parentPath);

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
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";
    const parentPath = buildTenantPath(tenantSlug, "/parent");

    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(parentPath);

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
