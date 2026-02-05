// i18n smoke coverage for account/help pages in EN + zh-CN.
import { expect, test, type Page } from "@playwright/test";

import {
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "..\/helpers/portal";

const RAW_KEY_PATTERN = /(^|\s)(portal|parent|nav|common)\.[a-z0-9_.-]+/i;

async function assertNoRawKeys(page: Page) {
  // Guard against raw translation keys leaking into UI text.
  const bodyText = await page.locator("body").innerText();
  expect(RAW_KEY_PATTERN.test(bodyText)).toBeFalsy();
}

async function toggleLanguage(page: Page) {
  // Toggle locale and wait for the html lang attribute to update.
  const currentLang = await page.evaluate(() => document.documentElement.lang || "");
  await page.getByTestId("parent-language-toggle").click();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang || ""))
    .not.toBe(currentLang);
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent portal account/help i18n", () => {
  test("Account + help render in EN and zh-CN without raw keys", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    if (tenantSlug !== "e2e-testing") {
      throw new Error(
        `Portal i18n tests must target the e2e-testing tenant; got ${tenantSlug}.`,
      );
    }
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    await page.goto(buildPortalPath(tenantSlug, "/account"));
    await expect(page.getByTestId("portal-account-page")).toBeVisible();
    await assertNoRawKeys(page);

    await toggleLanguage(page);
    await expect(page.getByTestId("portal-account-page")).toBeVisible();
    await assertNoRawKeys(page);

    await page.goto(buildPortalPath(tenantSlug, "/help"));
    await expect(page.getByTestId("portal-help-page")).toBeVisible();
    await expect(page.getByTestId("portal-help-accordion")).toBeVisible();
    await assertNoRawKeys(page);

    await toggleLanguage(page);
    await expect(page.getByTestId("portal-help-page")).toBeVisible();
    await assertNoRawKeys(page);
  });
});


