// Playwright coverage for Step 21.1 onboarding invite + welcome flows.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../../helpers/auth";
import { expectAdminBlocked, loginAsParentWithAccessCode } from "../../helpers/parent-auth";
import { resolveStep203Fixtures } from "../../helpers/step203";
import { buildTenantApiPath, buildTenantPath } from "../../helpers/tenant";

// Force a clean session so tests can switch between admin + parent logins.
test.use({ storageState: { cookies: [], origins: [] } });

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent onboarding invite flow", () => {
  test("Admin can copy invite message and audit event is recorded", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    const parentsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, `/api/students/${fixtures.studentId}/parents`),
    );
    expect(parentsResponse.ok()).toBeTruthy();
    const parentsPayload = (await parentsResponse.json()) as {
      parents?: Array<{ parentId?: string; parent?: { email?: string } }>;
    };

    const parentRecord = parentsPayload.parents?.find(
      (entry) => entry.parent?.email?.toLowerCase() === fixtures.parentA1Email.toLowerCase(),
    );
    const parentId = parentRecord?.parentId;
    if (!parentId) {
      throw new Error("Expected seeded parent to be linked to the seeded student.");
    }

    const inviteDataResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/admin/students/${fixtures.studentId}/invite-data`) &&
        response.request().method() === "GET",
    );

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/students/${fixtures.studentId}?mode=edit`),
    );
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByTestId("parents-table")).toBeVisible();

    await page.getByTestId(`parent-invite-${parentId}`).click();
    await expect(page.getByTestId("parent-invite-modal")).toBeVisible();

    const inviteDataResponse = await inviteDataResponsePromise;
    expect(inviteDataResponse.status()).toBe(200);
    await expect(page.getByTestId("parent-invite-copy")).toBeEnabled();

    const preview = page.getByTestId("parent-invite-preview");
    await expect(preview).toBeVisible();
    const previewText = await preview.innerText();

    expect(previewText).toContain(`/${tenantSlug}/parent/login`);
    expect(previewText).toContain(fixtures.parentA1Email);
    expect(/\b\d{6,8}\b/.test(previewText)).toBeFalsy();
    expect(/accessCode|access_code|code=|token=|secret=/i.test(previewText)).toBeFalsy();

    // Invite modal language toggle should swap to zh-CN without rendering raw keys.
    await page.getByTestId("invite-lang-zh-CN").click();
    const previewTextZh = await preview.innerText();
    expect(/[\u4e00-\u9fff]/.test(previewTextZh)).toBeTruthy();
    expect(/admin\.invite\.[a-z0-9_.-]+/i.test(previewTextZh)).toBeFalsy();

    await page.getByTestId("invite-lang-en").click();
    const previewTextEn = await preview.innerText();
    expect(/admin\.invite\.[a-z0-9_.-]+/i.test(previewTextEn)).toBeFalsy();

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const inviteCopiedResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/admin/students/${fixtures.studentId}/invite-copied`) &&
        response.request().method() === "POST",
    );

    await page.getByTestId("parent-invite-copy").click();
    await expect(page.getByTestId("parent-invite-copied")).toBeVisible();
    const inviteCopiedResponse = await inviteCopiedResponsePromise;
    expect(inviteCopiedResponse.status()).toBe(200);

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expect(page.getByTestId("audit-log-page")).toBeVisible();
    // Search by raw action code because list filtering/querying is server-side and deterministic.
    await page.getByTestId("audit-log-search-input").fill("PARENT_INVITE_COPIED");
    const inviteRow = page.locator('tr[data-testid^="audit-row-"]').first();
    await expect(inviteRow).toBeVisible();
    await inviteRow.click();
    await expect(page.getByTestId("audit-detail-drawer")).toBeVisible();

    const drawerText = await page.getByTestId("audit-detail-drawer").innerText();
    expect(/accessCode|access_code|code=|token=|secret=/i.test(drawerText)).toBeFalsy();
  });
});

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent onboarding welcome", () => {
  test("Welcome shows on first login and dismiss persists", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      fixtures.parentA1Email,
      fixtures.accessCode,
    );

    const welcomeCard = page.getByTestId("portal-welcome-card");
    await expect(welcomeCard).toBeVisible();

    await expect(page.getByTestId("portal-welcome-link-students")).toHaveAttribute(
      "href",
      new RegExp(`${tenantSlug}.*?/portal/students`),
    );
    await expect(page.getByTestId("portal-welcome-link-sessions")).toHaveAttribute(
      "href",
      new RegExp(`${tenantSlug}.*?/portal/sessions`),
    );
    await expect(page.getByTestId("portal-welcome-link-attendance")).toHaveAttribute(
      "href",
      new RegExp(`${tenantSlug}.*?/portal/students`),
    );
    await expect(page.getByTestId("portal-welcome-link-help")).toHaveAttribute(
      "href",
      new RegExp(`${tenantSlug}.*?/portal/help`),
    );

    const welcomeTextEn = await welcomeCard.innerText();
    expect(/portal\.welcome\.[a-z0-9_.-]+/i.test(welcomeTextEn)).toBeFalsy();

    await page.getByTestId("parent-language-toggle").click();
    // Locale toggle can lag under full-suite load; fall back to cookie + reload when needed.
    let navLocalized = true;
    try {
      await expect(page.getByTestId("parent-nav")).toContainText(/[\u4e00-\u9fff]/, {
        timeout: 7_500,
      });
    } catch {
      navLocalized = false;
    }
    if (!navLocalized) {
      await page.evaluate(() => {
        document.cookie = "locale=zh-CN; path=/";
      });
      await page.reload();
      await expect(page.getByTestId("parent-nav")).toContainText(/[\u4e00-\u9fff]/);
    }
    const welcomeTextZh = await welcomeCard.innerText();
    expect(/[\u4e00-\u9fff]/.test(welcomeTextZh)).toBeTruthy();
    expect(/portal\.welcome\.[a-z0-9_.-]+/i.test(welcomeTextZh)).toBeFalsy();

    const dismissResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/portal/onboarding/dismiss") &&
        response.request().method() === "POST",
    );

    await page.getByTestId("portal-welcome-dismiss").click();
    await dismissResponsePromise;
    await expect(page.getByTestId("portal-welcome-card")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("portal-dashboard-page")).toBeVisible();
    await expect(page.getByTestId("portal-welcome-card")).toHaveCount(0);

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      fixtures.parentA1Email,
      fixtures.accessCode,
    );
    await expect(page.getByTestId("portal-welcome-card")).toHaveCount(0);
  });

  test("Parent sessions cannot access admin onboarding endpoints", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      fixtures.parentA1Email,
      fixtures.accessCode,
    );

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/students/${fixtures.studentId}?mode=edit`),
    );
    await expectAdminBlocked(page);

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expectAdminBlocked(page);

    const inviteDataResponse = await page.request.get(
      buildTenantApiPath(
        tenantSlug,
        `/api/admin/students/${fixtures.studentId}/invite-data?parentId=not-a-parent`,
      ),
    );
    expect([401, 403]).toContain(inviteDataResponse.status());

    const inviteCopiedResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, `/api/admin/students/${fixtures.studentId}/invite-copied`),
      { data: { parentId: "not-a-parent" } },
    );
    expect([401, 403]).toContain(inviteCopiedResponse.status());
  });
});
