// Sorting and timestamp smoke checks for portal sessions, attendance, and requests.
import { expect, test, type Page } from "@playwright/test";

import { ensurePortalAbsenceRequest } from "./helpers/absence-requests";
import {
  buildPortalPath,
  ensurePortalSortingFixtures,
  loginParentWithAccessCode,
} from "./helpers/portal";

async function readIsoTimes(page: Page, selector: string, attribute: string) {
  // Pull ISO timestamps from data attributes for deterministic ordering checks.
  const values = await page.locator(selector).evaluateAll((nodes, attr) =>
    nodes.map((node) => node.getAttribute(attr as string)),
    attribute,
  );
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
}

function assertNonDecreasing(values: number[]) {
  // Ascending order allows ties for sessions with identical start times.
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
  }
}

function assertNonIncreasing(values: number[]) {
  // Descending order allows ties for items created at the same instant.
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]).toBeLessThanOrEqual(values[index - 1]);
  }
}

test.describe("Parent portal sorting + time smoke", () => {
  test("Sessions ascending, attendance + requests descending", async ({ page }) => {
    const fixtures = await ensurePortalSortingFixtures(page);

    await loginParentWithAccessCode(page, fixtures.tenantSlug, fixtures.parent);

    const [firstUpcoming, secondUpcoming] = fixtures.upcomingSessions;
    await ensurePortalAbsenceRequest(page, {
      tenantSlug: fixtures.tenantSlug,
      sessionId: firstUpcoming.sessionId,
      studentId: fixtures.studentId,
      reasonCode: "ILLNESS",
      message: "Family illness.",
    });
    await ensurePortalAbsenceRequest(page, {
      tenantSlug: fixtures.tenantSlug,
      sessionId: secondUpcoming.sessionId,
      studentId: fixtures.studentId,
      reasonCode: "FAMILY",
      message: "Family conflict.",
    });

    await page.goto(buildPortalPath(fixtures.tenantSlug, "/sessions"));
    await expect(page.getByTestId("portal-sessions-list")).toBeVisible();

    const sessionTimes = await readIsoTimes(
      page,
      '[data-testid^="portal-session-row-"]',
      "data-start-at",
    );
    expect(sessionTimes.length).toBeGreaterThan(1);
    assertNonDecreasing(sessionTimes);

    await page.goto(
      buildPortalPath(fixtures.tenantSlug, `/students/${fixtures.studentId}`),
    );
    await expect(page.getByTestId("portal-student-detail-page")).toBeVisible();
    await page.getByTestId("portal-tab-attendance").click();
    await expect(page.getByTestId("portal-attendance-list")).toBeVisible();

    const attendanceTimes = await readIsoTimes(
      page,
      '[data-testid^="portal-attendance-row-"]',
      "data-date-time",
    );
    expect(attendanceTimes.length).toBeGreaterThan(1);
    assertNonIncreasing(attendanceTimes);

    await page.goto(buildPortalPath(fixtures.tenantSlug, "/requests"));
    await expect(page.getByTestId("portal-requests-page")).toBeVisible();

    const requestTimes = await readIsoTimes(
      page,
      '[data-testid^="portal-request-row-"]',
      "data-updated-at",
    );
    expect(requestTimes.length).toBeGreaterThan(1);
    assertNonIncreasing(requestTimes);
  });
});
