// Step 22.3 E2E coverage for parent student-detail progress notes (feature + RBAC + tenant isolation).
import { expect, test, type Page } from "@playwright/test";

import { buildPortalPath } from "../helpers/portal";
import {
  STEP223_INTERNAL_ONLY_SENTINEL,
  STEP223_PROGRESS_NOTE_COUNT,
  STEP223_PROGRESS_PAGE_SIZE,
  resolveStep203Fixtures,
} from "../helpers/step203";

type ProgressNotesResponse = {
  items?: Array<Record<string, unknown>>;
  nextCursor?: string | null;
};

function resolveProgressNotesApiMatcher(studentId: string) {
  // Match both direct and tenant-prefixed routes while avoiding brittle full-URL assertions.
  return (url: string) =>
    url.includes(`/api/portal/students/${studentId}/progress-notes`);
}

function buildRawKeyPattern() {
  // Guard against leaking unresolved i18n keys in rendered markup.
  return /(^|\s)(portal|parent|parentStudentProgress)\.[a-z0-9_.-]+/i;
}

async function openStudentDetailAndWaitNotes(
  page: Page,
  tenantSlug: string,
  studentId: string,
) {
  const waitForNotesResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      resolveProgressNotesApiMatcher(studentId)(response.url()),
  );
  await page.goto(buildPortalPath(tenantSlug, `/students/${studentId}`));
  const notesResponse = await waitForNotesResponse;
  await expect(page.getByTestId("portal-student-detail-page")).toBeVisible();
  await expect(page.getByTestId("portal-student-progress-notes")).toBeVisible();
  return notesResponse;
}

async function readRenderedProgressNotes(page: Page) {
  // Read each note body from the timeline cards in visual order (newest first).
  const cards = page.locator('[data-testid^="portal-progress-note-"]');
  const count = await cards.count();
  const values: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const text = await cards.nth(index).locator("p").last().innerText();
    values.push(text.trim());
  }
  return values;
}

async function assertStudentAccessBlocked(
  page: Page,
  tenantSlug: string,
  studentId: string,
) {
  const waitForStudentResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/portal/students/${studentId}`) &&
      !response.url().includes("/progress-notes"),
  );
  await page.goto(buildPortalPath(tenantSlug, `/students/${studentId}`));
  const response = await waitForStudentResponse;
  expect([403, 404]).toContain(response.status());
  await expect(page.getByTestId("portal-student-not-found")).toBeVisible();
  await expect(page.getByTestId("portal-student-detail-page")).toHaveCount(0);
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Parent portal progress notes", () => {
  test("Linked student renders Progress Notes section", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    await openStudentDetailAndWaitNotes(page, fixtures.tenantSlug, fixtures.studentId);
    await expect(page.getByText("Progress Notes")).toBeVisible();
    await expect(page.getByTestId("portal-progress-notes-list")).toBeVisible();
  });

  test("Parent-visible-only payload and DOM never leak staff-only note content", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    const notesResponse = await openStudentDetailAndWaitNotes(
      page,
      fixtures.tenantSlug,
      fixtures.studentId,
    );

    expect(notesResponse.status()).toBe(200);
    const payload = (await notesResponse.json()) as ProgressNotesResponse;
    const items = payload.items ?? [];

    // Sentinel internal note must never appear in UI text or serialized portal payload.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(STEP223_INTERNAL_ONLY_SENTINEL);
    expect(JSON.stringify(payload)).not.toContain(STEP223_INTERNAL_ONLY_SENTINEL);

    for (const item of items) {
      expect(item.note).toBeTruthy();
      // Denylist guards against accidental DTO expansion with staff-only/private fields.
      expect(Object.prototype.hasOwnProperty.call(item, "internalNote")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(item, "staffOnly")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(item, "staffComments")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(item, "createdByStaffId")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(item, "noteInternal")).toBeFalsy();
    }
  });

  test("Progress notes render newest-first with deterministic seeded labels", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    await openStudentDetailAndWaitNotes(page, fixtures.tenantSlug, fixtures.studentId);

    const rendered = await readRenderedProgressNotes(page);
    expect(rendered.length).toBe(STEP223_PROGRESS_PAGE_SIZE);

    const expectedDescending = [...fixtures.progressVisibleNotes]
      .slice()
      .reverse()
      .slice(0, STEP223_PROGRESS_PAGE_SIZE);
    expect(rendered).toEqual(expectedDescending);
    expect(rendered[0]).toContain("STEP223_NOTE_12_NEWEST");
  });

  test("Load more appends next page and preserves order", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    await openStudentDetailAndWaitNotes(page, fixtures.tenantSlug, fixtures.studentId);

    await expect(page.getByTestId("portal-progress-notes-load-more")).toBeVisible();
    await page.getByTestId("portal-progress-notes-load-more").click();

    const expectedDescending = [...fixtures.progressVisibleNotes].slice().reverse();
    // Wait for append completion until the oldest seeded Step 22.3 note is rendered.
    await expect.poll(async () => {
      const rendered = await readRenderedProgressNotes(page);
      return rendered.includes(expectedDescending[expectedDescending.length - 1]);
    }).toBeTruthy();

    const rendered = await readRenderedProgressNotes(page);
    let cursor = -1;
    for (const expectedLabel of expectedDescending) {
      cursor = rendered.indexOf(expectedLabel, cursor + 1);
      expect(cursor).toBeGreaterThanOrEqual(0);
    }
    expect(rendered.length).toBeGreaterThanOrEqual(STEP223_PROGRESS_NOTE_COUNT);
  });

  test("Linked student with no parent-visible notes shows empty state", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();
    await openStudentDetailAndWaitNotes(
      page,
      fixtures.tenantSlug,
      fixtures.progressEmptyStudentId,
    );

    await expect(page.getByTestId("portal-progress-notes-empty")).toBeVisible();
    await expect(page.getByTestId("portal-progress-notes-list")).toHaveCount(0);
  });

  test("i18n sanity for EN and zh-CN without raw key leaks", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    await openStudentDetailAndWaitNotes(page, fixtures.tenantSlug, fixtures.studentId);

    await expect(page.getByRole("heading", { name: "Progress Notes" })).toBeVisible();
    await page.getByTestId("parent-language-toggle").click();
    await expect(page.getByRole("heading", { name: "学习进度备注" })).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(buildRawKeyPattern().test(bodyText)).toBeFalsy();
  });

  test("Unlinked and cross-tenant student probes are blocked without note leakage", async ({
    page,
  }) => {
    const fixtures = resolveStep203Fixtures();

    await assertStudentAccessBlocked(page, fixtures.tenantSlug, fixtures.unlinkedStudentId);
    await assertStudentAccessBlocked(page, fixtures.tenantSlug, fixtures.crossTenantStudentId);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("STEP223_NOTE_");
    expect(bodyText).not.toContain(STEP223_INTERNAL_ONLY_SENTINEL);
  });
});
