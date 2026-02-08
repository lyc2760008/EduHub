// Release gate E2E spec covering MVP critical path and core RBAC checks.
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

import { loginAsAdmin, loginViaUI, requireEnv } from "..\/helpers/auth";
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
} from "..\/helpers/data";
import { ensureSessionForTutorWithRoster, fetchUsers } from "..\/helpers/attendance";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[slow] [regression] Release gate", () => {
  test("Admin critical path (students, sessions, attendance/notes, reports)", async ({
    page,
  }, testInfo) => {
    // This flow touches multiple modules end-to-end and can exceed 60s under parallel full-suite load.
    test.setTimeout(180_000);
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    await loginAsAdmin(page, tenantSlug);

    const suffix = createTestSuffix(testInfo, "release-gate");
    const subjectName = `E2E Subject ${suffix}`;
    const levelName = `E2E Level ${suffix}`;
    const programName = `E2E Program ${suffix}`;

    await createSubject(page, tenantSlug, subjectName);
    await createLevel(page, tenantSlug, levelName);
    await createProgram(page, tenantSlug, programName, subjectName);

    const studentFirstName = `E2E${suffix}`;
    const studentLastName = "Release";
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

    const preferredTutorEmail = process.env.E2E_TUTOR1_EMAIL;
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

    const now = DateTime.now();
    const rangeStart = now.toISODate() ?? "";
    const rangeEnd = now.plus({ days: 7 }).toISODate() ?? "";

    const oneOffSession = await createOneOffSession(page, tenantSlug, {
      centerId: center.id,
      tutorId: tutor.id,
      studentId: student.id,
      minuteSeed: now.toMillis(),
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();
    // Sessions filters are rendered in a sheet under the shared admin table toolkit.
    await page.getByTestId("sessions-list-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("sessions-filter-center").selectOption(center.id);
    await page.getByTestId("sessions-filter-tutor").selectOption(tutor.id);
    await page.getByTestId("sessions-filter-from").fill(rangeStart);
    await page.getByTestId("sessions-filter-to").fill(rangeEnd);
    await page.getByTestId("admin-filters-sheet-close").click();
    await page.waitForLoadState("networkidle");

    const generatorStart = now.plus({ days: 1 }).toISODate() ?? "";
    const generatorEnd = now.plus({ days: 7 }).toISODate() ?? "";
    const startTime = "08:30";
    const endTime = "09:30";

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

    await page.waitForLoadState("networkidle");

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${oneOffSession.id}`),
    );
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("attendance-section")).toBeVisible();
    await expect(page.getByTestId("notes-section")).toBeVisible();

    await markAttendance(page, {
      studentId: student.id,
      status: "PRESENT",
      note: `E2E attendance ${suffix}`,
    });
    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    const internalNote = `E2E internal ${suffix}`;
    const parentNote = `E2E parent ${suffix}`;
    await saveNotes(page, {
      internalNote,
      parentVisibleNote: parentNote,
    });

    await page.reload();
    // Notes panel can hydrate after attendance on slower CI-like runs; wait for editability first.
    await expect(page.getByTestId("notes-internal-input")).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.getByTestId("notes-parent-visible-input")).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.getByTestId("notes-internal-input")).toHaveValue(internalNote, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("notes-parent-visible-input")).toHaveValue(parentNote, {
      timeout: 30_000,
    });
    await expect(
      page.getByTestId(`attendance-status-select-${student.id}`),
    ).toHaveValue("PRESENT");

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));
    await expect(page.getByTestId("reports-page")).toBeVisible();

    await page.goto(
      buildTenantPath(tenantSlug, "/admin/reports/upcoming-sessions"),
    );
    await expect(page.getByTestId("report-upcoming-sessions")).toBeVisible();

    await page.getByTestId("upcoming-sessions-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.locator("#upcoming-center").selectOption(center.id);
    await page.locator("#upcoming-tutor").selectOption(tutor.id);
    await page.locator("#upcoming-preset").selectOption("14d");
    await page.getByTestId("admin-filters-sheet-close").click();

    const upcomingRows = page.locator('[data-testid^="report-upcoming-"]');
    await expect.poll(async () => upcomingRows.count()).toBeGreaterThan(0);
  });

  test("Tutor RBAC (blocked admin module + assigned session edits)", async ({
    page,
  }, testInfo) => {
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";
    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    // Fall back to legacy tutor envs when Tutor1 vars are not set.
    const tutorEmail =
      process.env.E2E_TUTOR1_EMAIL || process.env.E2E_TUTOR_EMAIL;
    const tutorPassword =
      process.env.E2E_TUTOR1_PASSWORD || process.env.E2E_TUTOR_PASSWORD;
    const tutor2Email = process.env.E2E_TUTOR2_EMAIL;
    const tutor2Password = process.env.E2E_TUTOR2_PASSWORD;

    if (!tutorEmail || !tutorPassword) {
      test.skip(true, "Missing tutor credentials for release gate RBAC check.");
      return;
    }

    // Admin creates or finds an assigned session for Tutor1 to validate edits.
    await loginViaUI(page, { email: adminEmail, password: adminPassword, tenantSlug });
    const users = await fetchUsers(page, tenantSlug);
    const tutor = users.find((user) => user.email === tutorEmail);
    if (!tutor) {
      throw new Error(`Tutor ${tutorEmail} not found in tenant ${tenantSlug}.`);
    }
    const { session, attendance } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor,
      1,
    );

    let otherTutorSessionId: string | null = null;
    if (tutor2Email && tutor2Password) {
      const tutor2 = users.find((user) => user.email === tutor2Email);
      if (tutor2) {
        const otherSession = await ensureSessionForTutorWithRoster(
          page,
          tenantSlug,
          tutor2,
          1,
        );
        otherTutorSessionId = otherSession.session.id;
      }
    }

    // Tutor login validates RBAC restrictions and assigned session edits.
    await loginViaUI(page, { email: tutorEmail, password: tutorPassword, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/students"));
    await expect(page.getByTestId("access-denied")).toBeVisible();

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`));
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("attendance-section")).toBeVisible();
    await expect(page.getByTestId("notes-section")).toBeVisible();

    const rosterEntry = attendance.roster[0];
    if (!rosterEntry) {
      throw new Error("Expected a roster entry for tutor attendance.");
    }

    const suffix = createTestSuffix(testInfo, "release-gate-tutor");
    await markAttendance(page, {
      studentId: rosterEntry.student.id,
      status: "PRESENT",
      note: `E2E tutor note ${suffix}`,
    });
    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    await saveNotes(page, {
      internalNote: `E2E internal ${suffix}`,
      parentVisibleNote: `E2E parent ${suffix}`,
    });

    if (otherTutorSessionId) {
      // Assigned tutor should not read other tutor session attendance.
      const response = await page.request.get(
        buildTenantApiPath(tenantSlug, `/api/sessions/${otherTutorSessionId}/attendance`),
      );
      expect([403, 404]).toContain(response.status());
    }
  });
});



