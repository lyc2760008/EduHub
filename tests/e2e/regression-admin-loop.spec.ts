// End-to-end admin regression loop covering catalog -> students -> groups -> sessions -> reports.
import { expect, test, type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { loginAsAdmin } from "./helpers/auth";
import {
  assignTutorAndRoster,
  createGroup,
  createLevel,
  createOneOffSession,
  createProgram,
  createStudent,
  createSubject,
  createTestSuffix,
  generateRecurringSessions,
  linkParent,
  markAttendance,
  resolveCenterAndTutor,
  saveNotes,
} from "./helpers/data";
import { buildTenantPath } from "./helpers/tenant";

function seedFromString(value: string) {
  // Deterministic seed keeps time selections stable for the current test run.
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function formatExpectedStartLabel(timezone: string, localDateTime: string) {
  // UI formats session timestamps in locale time; mirror it for assertions.
  const startLocal = DateTime.fromFormat(localDateTime, "yyyy-LL-dd'T'HH:mm", {
    zone: timezone,
  });
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(startLocal.toJSDate());
}

function firstOccurrenceDate(
  startDate: string,
  endDate: string,
  timezone: string,
  weekday: number,
) {
  // Compute the first weekday occurrence in the generator range.
  let cursor = DateTime.fromISO(startDate, { zone: timezone }).startOf("day");
  const end = DateTime.fromISO(endDate, { zone: timezone }).startOf("day");

  while (cursor <= end) {
    if (cursor.weekday === weekday) {
      return cursor.toISODate();
    }
    cursor = cursor.plus({ days: 1 });
  }

  return null;
}

async function waitForSessionsRefresh(page: Page) {
  // Wait for the sessions list to refetch after filter changes.
  const response = await page.waitForResponse(
    (res) => res.url().includes("/api/sessions") && res.request().method() === "GET",
  );
  if (!response.ok()) {
    throw new Error(`Expected sessions refresh to succeed, got ${response.status()}.`);
  }
}

test.describe("Admin regression loop", () => {
  test("Admin end-to-end loop (catalog -> student/parent -> group -> sessions -> attendance/notes -> reports)", async ({
    page,
  }, testInfo) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    await loginAsAdmin(page, tenantSlug);

    const suffix = createTestSuffix(testInfo, "admin-loop");
    const subjectName = `E2E Subject ${suffix}`;
    const levelName = `E2E Level ${suffix}`;
    const programName = `E2E Program ${suffix}`;

    await createSubject(page, tenantSlug, subjectName);
    await createLevel(page, tenantSlug, levelName);
    await createProgram(page, tenantSlug, programName, subjectName);

    const studentFirstName = `E2E${suffix}`;
    const studentLastName = "Student";
    const student = await createStudent(page, tenantSlug, {
      firstName: studentFirstName,
      lastName: studentLastName,
      levelName,
    });

    const parentEmail = `e2e-parent+${suffix}@example.com`;
    await linkParent(page, tenantSlug, student.id, parentEmail);
    await page.reload();
    await expect(page.getByTestId("student-detail-page")).toBeVisible();
    await expect(page.getByText(parentEmail)).toBeVisible();

    const preferredTutorEmail =
      process.env.E2E_TUTOR_EMAIL || process.env.E2E_TUTOR1_EMAIL;
    const { tutor, center } = await resolveCenterAndTutor(
      page,
      tenantSlug,
      preferredTutorEmail,
    );

    const groupName = `E2E Group ${suffix}`;
    const group = await createGroup(page, tenantSlug, {
      name: groupName,
      programName,
      centerId: center.id,
      levelName,
      type: "GROUP",
    });

    await assignTutorAndRoster(page, tenantSlug, {
      groupId: group.id,
      tutorEmail: tutor.email,
      studentName: student.fullName,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));
    const groupRow = page.getByTestId("groups-table").locator("tr", {
      hasText: groupName,
    });
    await expect(groupRow.getByTestId("group-tutors-count")).toHaveText("1");
    await expect(groupRow.getByTestId("group-students-count")).toHaveText("1");

    const now = DateTime.now();
    const rangeStart = now.toISODate() ?? "";
    const rangeEnd = now.plus({ days: 7 }).toISODate() ?? "";
    const minuteSeed = seedFromString(suffix);

    const oneOffSession = await createOneOffSession(page, tenantSlug, {
      centerId: center.id,
      tutorId: tutor.id,
      studentId: student.id,
      minuteSeed,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();
    await page.getByTestId("sessions-filter-center").selectOption(center.id);
    await page.getByTestId("sessions-filter-tutor").selectOption(tutor.id);
    const sessionsFilterRefresh = waitForSessionsRefresh(page);
    await page.getByTestId("sessions-filter-from").fill(rangeStart);
    await page.getByTestId("sessions-filter-to").fill(rangeEnd);
    await sessionsFilterRefresh;

    const generatorStart = now.plus({ days: 1 }).toISODate() ?? "";
    const generatorEnd = now.plus({ days: 7 }).toISODate() ?? "";
    const minuteOffset = String((minuteSeed % 50) + 5).padStart(2, "0");
    const startTime = `08:${minuteOffset}`;
    const endTime = `09:${minuteOffset}`;

    await generateRecurringSessions(page, tenantSlug, {
      centerId: center.id,
      tutorId: tutor.id,
      studentId: student.id,
      startDate: generatorStart,
      endDate: generatorEnd,
      weekday: now.weekday,
      startTime,
      endTime,
    });

    const sessionsAfterGenerateRefresh = waitForSessionsRefresh(page);
    await page.getByTestId("sessions-filter-from").fill(rangeStart);
    await page.getByTestId("sessions-filter-to").fill(rangeEnd);
    await sessionsAfterGenerateRefresh;

    const timezone = center.timezone || "America/Edmonton";
    const occurrenceDate = firstOccurrenceDate(
      generatorStart,
      generatorEnd,
      timezone,
      now.weekday,
    );
    if (!occurrenceDate) {
      throw new Error("Could not find a matching weekday for generator range.");
    }
    const expectedStart = formatExpectedStartLabel(
      timezone,
      `${occurrenceDate}T${startTime}`,
    );

    const sessionsAfter = await page
      .locator('[data-testid^="sessions-row-"]')
      .count();
    expect(sessionsAfter).toBeGreaterThan(0);
    const rowWithStart = page.locator("tr", { hasText: expectedStart });
    await expect.poll(async () => rowWithStart.count()).toBeGreaterThan(0);

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${oneOffSession.id}`),
    );
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("attendance-section")).toBeVisible();

    await markAttendance(page, {
      studentId: student.id,
      status: "PRESENT",
      note: `E2E attendance ${suffix}`,
    });

    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(
      page.getByTestId(`attendance-status-select-${student.id}`),
    ).toHaveValue("PRESENT");

    const internalNote = `E2E internal ${suffix}`;
    const parentNote = `E2E parent ${suffix}`;
    await saveNotes(page, {
      internalNote,
      parentVisibleNote: parentNote,
    });

    await page.reload();
    await expect(page.getByTestId("notes-internal-input")).toHaveValue(
      internalNote,
    );
    await expect(page.getByTestId("notes-parent-visible-input")).toHaveValue(
      parentNote,
    );

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));
    await expect(page.getByTestId("report-upcoming-sessions")).toBeVisible();

    await page.getByTestId("upcoming-date-from").fill(rangeStart);
    await page.getByTestId("upcoming-date-to").fill(rangeEnd);
    await page.getByTestId("upcoming-center").selectOption(center.id);
    await page.getByTestId("upcoming-tutor").selectOption(tutor.id);

    const upcomingRows = page.locator('[data-testid^="reports-upcoming-"]');
    await expect.poll(async () => upcomingRows.count()).toBeGreaterThan(0);

    await page.getByTestId("weekly-week-start").fill(rangeStart);
    await page.getByTestId("weekly-center").selectOption(center.id);

    const weeklyRows = page.locator(
      '[data-testid^="reports-weekly-summary-"]',
    );
    await expect.poll(async () => weeklyRows.count()).toBeGreaterThan(0);

    await page.getByTestId("student-date-from").fill(rangeStart);
    await page.getByTestId("student-date-to").fill(rangeEnd);
    await page.getByTestId("student-center").selectOption(center.id);

    await expect(page.getByTestId("student-results")).toContainText(
      student.fullName,
    );
  });
});


