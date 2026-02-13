// Step 22.4 tutor regression coverage: My Sessions + Run Session (+ RBAC/tenant/i18n/mobile).
import { expect, test } from "@playwright/test";

import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";
import {
  STEP224_INTERNAL_ONLY_SENTINEL,
  STEP224_NOTE_1,
  STEP224_NOTE_2,
  resolveStep224Fixtures,
} from "../helpers/step224";

type TutorRunPayload = {
  session?: { sessionId?: string };
  roster?: Array<Record<string, unknown>>;
};

function buildRawKeyPattern() {
  // Reject unresolved translation keys in rendered tutor pages.
  return /(tutorSessions|tutorRunSession)\.[a-z0-9_.-]+/i;
}

test.describe("[regression] Step 22.4 Tutor session execution", () => {
  test("My Sessions shows only assigned tutor sessions", async ({ page }) => {
    const fixtures = resolveStep224Fixtures();
    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/sessions"));
    await expect(page.getByTestId("tutor-sessions-page")).toBeVisible();

    // Deterministic seed IDs keep this assertion stable across date formatting/timezone changes.
    await expect(
      page.getByTestId(`tutor-session-row-${fixtures.tutorSessionIds.tutorAFirst}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`tutor-session-row-${fixtures.tutorSessionIds.tutorASecond}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`tutor-session-row-${fixtures.tutorSessionIds.tutorBOther}`),
    ).toHaveCount(0);
  });

  test("Run Session saves attendance + parent-visible notes and persists after refresh", async ({
    page,
  }) => {
    const fixtures = resolveStep224Fixtures();
    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/sessions/${fixtures.tutorSessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByTestId("tutor-run-session-page")).toBeVisible();

    const rows = page.locator('[data-testid^="tutor-run-session-row-"]');
    await expect(rows).toHaveCount(2);

    const firstRowTestId = await rows.nth(0).getAttribute("data-testid");
    const secondRowTestId = await rows.nth(1).getAttribute("data-testid");
    if (!firstRowTestId || !secondRowTestId) {
      throw new Error("Expected deterministic roster row test ids.");
    }
    const firstStudentId = firstRowTestId.replace("tutor-run-session-row-", "");
    const secondStudentId = secondRowTestId.replace("tutor-run-session-row-", "");

    await page
      .getByTestId(`tutor-run-session-status-${firstStudentId}`)
      .selectOption("ABSENT");
    await page
      .getByTestId(`tutor-run-session-status-${secondStudentId}`)
      .selectOption("LATE");
    await page.getByTestId(`tutor-run-session-note-${firstStudentId}`).fill(STEP224_NOTE_1);
    await page.getByTestId(`tutor-run-session-note-${secondStudentId}`).fill(STEP224_NOTE_2);

    await page.getByTestId("tutor-run-session-save").click();
    await expect(page.getByTestId("tutor-run-session-toast")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("tutor-run-session-page")).toBeVisible();
    await expect(
      page.getByTestId(`tutor-run-session-status-${firstStudentId}`),
    ).toHaveValue("ABSENT");
    await expect(
      page.getByTestId(`tutor-run-session-status-${secondStudentId}`),
    ).toHaveValue("LATE");
    await expect(
      page.getByTestId(`tutor-run-session-note-${firstStudentId}`),
    ).toHaveValue(STEP224_NOTE_1);
    await expect(
      page.getByTestId(`tutor-run-session-note-${secondStudentId}`),
    ).toHaveValue(STEP224_NOTE_2);
  });

  test("Tutor UI/API payloads do not leak internal notes or staff-only fields", async ({
    page,
  }) => {
    const fixtures = resolveStep224Fixtures();
    const detailResponsePromise = page.waitForResponse(
      (response) => {
        if (response.request().method() !== "GET") return false;
        const url = new URL(response.url());
        // Match the session-detail endpoint exactly so `/resources` fetches don't satisfy this waiter.
        return (
          url.pathname.endsWith(
            `/api/tutor/sessions/${fixtures.tutorSessionIds.tutorAFirst}`,
          ) && !url.pathname.endsWith("/resources")
        );
      },
    );

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/sessions/${fixtures.tutorSessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByTestId("tutor-run-session-page")).toBeVisible();

    const detailResponse = await detailResponsePromise;
    expect(detailResponse.status()).toBe(200);
    const detailPayload = (await detailResponse.json()) as TutorRunPayload;
    const roster = detailPayload.roster ?? [];
    expect(roster.length).toBeGreaterThan(0);

    // Detail payload contract must stay minimal to prevent leaking internal/staff-only fields.
    for (const row of roster) {
      const keys = Object.keys(row).sort();
      expect(keys).toEqual([
        "attendanceStatus",
        "displayName",
        "parentVisibleNote",
        "studentId",
      ]);
      expect(Object.prototype.hasOwnProperty.call(row, "note")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(row, "internalNote")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(row, "staffOnlyNote")).toBeFalsy();
    }

    const domText = await page.locator("body").innerText();
    const htmlText = await page.content();
    expect(domText).not.toContain(STEP224_INTERNAL_ONLY_SENTINEL);
    expect(htmlText).not.toContain(STEP224_INTERNAL_ONLY_SENTINEL);
    expect(JSON.stringify(detailPayload)).not.toContain(STEP224_INTERNAL_ONLY_SENTINEL);
  });

  test("Tutor is denied for another tutor session and another tenant session", async ({
    page,
  }) => {
    const fixtures = resolveStep224Fixtures();

    const sameTenantDenied = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/tutor/sessions/${fixtures.tutorSessionIds.tutorBOther}`,
      ),
      {
        headers: {
          "x-tenant-slug": fixtures.tenantSlug,
        },
      },
    );
    expect(sameTenantDenied.status()).toBe(404);

    const crossTenantDenied = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/tutor/sessions/${fixtures.crossTenantSessionId}`,
      ),
      {
        headers: {
          "x-tenant-slug": fixtures.tenantSlug,
        },
      },
    );
    expect(crossTenantDenied.status()).toBe(404);
  });

  test("i18n renders EN + zh-CN copy without raw keys on tutor pages", async ({
    page,
  }) => {
    const fixtures = resolveStep224Fixtures();
    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/sessions"));
    await page.evaluate(() => {
      document.cookie = "locale=en; path=/; max-age=31536000";
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "My sessions" })).toBeVisible();
    expect(buildRawKeyPattern().test(await page.locator("body").innerText())).toBeFalsy();

    // Cookie-based locale switching mirrors the app's request-scoped i18n behavior.
    await page.evaluate(() => {
      document.cookie = "locale=zh-CN; path=/; max-age=31536000";
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "我的课程" })).toBeVisible();
    expect(buildRawKeyPattern().test(await page.locator("body").innerText())).toBeFalsy();

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/sessions/${fixtures.tutorSessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByRole("heading", { name: "开始上课" })).toBeVisible();
    expect(buildRawKeyPattern().test(await page.locator("body").innerText())).toBeFalsy();
  });
});

test.describe("[regression] Step 22.4 Tutor mobile sanity", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("No horizontal scroll and primary actions remain reachable", async ({
    page,
  }) => {
    const fixtures = resolveStep224Fixtures();
    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/sessions"));
    await expect(page.getByTestId("tutor-sessions-page")).toBeVisible();

    const listHasNoHorizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(listHasNoHorizontalScroll).toBeTruthy();

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/sessions/${fixtures.tutorSessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByTestId("tutor-run-session-page")).toBeVisible();

    const runHasNoHorizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(runHasNoHorizontalScroll).toBeTruthy();

    const saveButton = page.getByTestId("tutor-run-session-save");
    await saveButton.scrollIntoViewIfNeeded();
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });
});
