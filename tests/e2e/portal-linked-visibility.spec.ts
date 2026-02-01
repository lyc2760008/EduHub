// Linked-data visibility checks for parents with students/sessions/attendance.
import { expect, test } from "@playwright/test";

import {
  buildPortalApiPath,
  buildPortalPath,
  loginParentWithAccessCode,
  resolveParent1Credentials,
  resolvePortalTenantSlug,
} from "./helpers/portal";

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type PortalStudentsResponse = {
  items: PortalStudent[];
};

type PortalSession = {
  id: string;
  studentId: string;
};

type PortalSessionsResponse = {
  items: PortalSession[];
};

type PortalAttendanceItem = {
  id: string;
};

type PortalAttendanceResponse = {
  items: PortalAttendanceItem[];
};

function buildRange(days: number) {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + days);
  return { from, to };
}

function buildLastRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from, to };
}

test.describe("Parent portal linked visibility", () => {
  test("Parent sees only linked students, sessions, and attendance", async ({ page }) => {
    const tenantSlug = resolvePortalTenantSlug();
    const credentials = await resolveParent1Credentials(page);

    await loginParentWithAccessCode(page, tenantSlug, credentials);

    const studentsResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, "/students?take=100&skip=0"),
    );
    expect(studentsResponse.status()).toBe(200);
    const studentsPayload =
      (await studentsResponse.json()) as PortalStudentsResponse;
    const linkedStudents = studentsPayload.items ?? [];

    if (linkedStudents.length === 0) {
      throw new Error("Expected linked students for ParentA1 seed data.");
    }

    const linkedStudentIds = linkedStudents.map((student) => student.id);

    await page.goto(buildPortalPath(tenantSlug, "/students"));
    await expect(page.getByTestId("portal-students-page")).toBeVisible();

    for (const studentId of linkedStudentIds) {
      await expect(
        page.getByTestId(`portal-student-card-${studentId}`),
      ).toBeVisible();
    }

    const primaryStudentId = linkedStudentIds[0];

    await page.goto(
      buildPortalPath(tenantSlug, `/students/${primaryStudentId}`),
    );
    await expect(page.getByTestId("portal-student-detail-page")).toBeVisible();

    const upcomingRange = buildRange(14);
    const sessionParams = new URLSearchParams({
      studentId: primaryStudentId,
      from: upcomingRange.from.toISOString(),
      to: upcomingRange.to.toISOString(),
      take: "3",
      skip: "0",
    });
    const sessionsResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/sessions?${sessionParams.toString()}`),
    );
    expect(sessionsResponse.status()).toBe(200);
    const sessionsPayload =
      (await sessionsResponse.json()) as PortalSessionsResponse;

    if (sessionsPayload.items.length === 0) {
      throw new Error("Expected upcoming sessions for linked student.");
    }

    for (const session of sessionsPayload.items) {
      await expect(
        page.getByTestId(`portal-session-row-${session.id}`),
      ).toBeVisible();
    }

    await page.getByTestId("portal-tab-attendance").click();
    await expect(page.getByTestId("portal-student-attendance")).toBeVisible();

    const attendanceRange = buildLastRange(30);
    const attendanceParams = new URLSearchParams({
      studentId: primaryStudentId,
      from: attendanceRange.from.toISOString(),
      to: attendanceRange.to.toISOString(),
      take: "100",
      skip: "0",
    });

    const attendanceResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/attendance?${attendanceParams.toString()}`),
    );
    expect(attendanceResponse.status()).toBe(200);
    const attendancePayload =
      (await attendanceResponse.json()) as PortalAttendanceResponse;

    if (attendancePayload.items.length === 0) {
      throw new Error("Expected attendance history for linked student.");
    }

    await expect(page.getByTestId("portal-attendance-list")).toBeVisible();
    await expect(
      page.getByTestId(`portal-attendance-row-${attendancePayload.items[0].id}`),
    ).toBeVisible();

    await page.goto(buildPortalPath(tenantSlug, "/sessions"));
    await expect(page.getByTestId("portal-sessions-page")).toBeVisible();

    const sessionsListRange = buildRange(7);
    const listParams = new URLSearchParams({
      from: sessionsListRange.from.toISOString(),
      to: sessionsListRange.to.toISOString(),
      take: "100",
      skip: "0",
    });
    const sessionsListResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/sessions?${listParams.toString()}`),
    );
    expect(sessionsListResponse.status()).toBe(200);
    const sessionsListPayload =
      (await sessionsListResponse.json()) as PortalSessionsResponse;

    for (const session of sessionsListPayload.items.slice(0, 5)) {
      await expect(
        page.getByTestId(`portal-session-row-${session.id}`),
      ).toBeVisible();
      expect(linkedStudentIds).toContain(session.studentId);
    }
  });
});
