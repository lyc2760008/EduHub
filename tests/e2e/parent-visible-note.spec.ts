// Parent-visible note coverage for portal attendance history and session detail.
import { expect, test } from "@playwright/test";

import { loginViaUI, requireEnv } from "./helpers/auth";
import {
  buildPortalApiPath,
  buildPortalPath,
  loginParentWithAccessCode,
} from "./helpers/portal";
import { resolveStep203Fixtures } from "./helpers/step203";
import { buildTenantPath } from "./helpers/tenant";

type PortalAttendanceItem = {
  id: string;
  sessionId: string;
  parentVisibleNote?: string | null;
};

type PortalAttendanceResponse = {
  items: PortalAttendanceItem[];
};

type PortalSessionDetailResponse = {
  students: Array<{
    attendance: { parentVisibleNote?: string | null } | null;
  }>;
};

const PARENT_NOTE = "PARENT_NOTE_OK_123";
const INTERNAL_NOTE = "INTERNAL_DO_NOT_LEAK_123";

function buildLastRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from, to };
}

test.describe("Parent-visible notes", () => {
  test("Parent sees parent-visible note in attendance and session detail without internal notes", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    // Guardrail: Step 20.3 tests only target the dedicated e2e tenant.
    if (tenantSlug !== "e2e-testing") {
      throw new Error(`Unexpected tenant slug ${tenantSlug} for Step 20.3 tests.`);
    }

    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    const staffPassword = fixtures.accessCode;

    await loginViaUI(page, { email: adminEmail, password: adminPassword, tenantSlug });

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${fixtures.pastSessionId}`),
    );
    await expect(page.getByTestId("attendance-section")).toBeVisible();

    await page
      .getByTestId(`attendance-status-select-${fixtures.studentId}`)
      .selectOption("PRESENT");
    await page
      .getByTestId(`attendance-note-${fixtures.studentId}`)
      .fill(INTERNAL_NOTE);
    await page
      .getByTestId(`attendance-parent-note-${fixtures.studentId}`)
      .fill(PARENT_NOTE);
    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    // Clear staff session cookies before switching to the parent portal.
    await page.context().clearCookies();

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: staffPassword,
    });

    await page.goto(
      buildPortalPath(tenantSlug, `/students/${fixtures.studentId}`),
    );
    await expect(page.getByTestId("portal-student-detail-page")).toBeVisible();
    await page.getByTestId("portal-tab-attendance").click();
    await expect(page.getByTestId("portal-student-attendance")).toBeVisible();

    const range = buildLastRange(30);
    const params = new URLSearchParams({
      studentId: fixtures.studentId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      take: "100",
      skip: "0",
    });

    const attendanceResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/attendance?${params.toString()}`),
    );
    expect(attendanceResponse.status()).toBe(200);
    const attendancePayload =
      (await attendanceResponse.json()) as PortalAttendanceResponse;

    const attendanceItem = attendancePayload.items.find(
      (item) => item.sessionId === fixtures.pastSessionId,
    );
    if (!attendanceItem) {
      throw new Error("Expected attendance record for seeded past session.");
    }

    await expect(
      page.getByTestId(`portal-attendance-note-preview-${attendanceItem.id}`),
    ).toContainText(PARENT_NOTE);

    await page.goto(
      buildPortalPath(tenantSlug, `/sessions/${fixtures.pastSessionId}`),
    );
    await expect(page.getByTestId("portal-session-detail-page")).toBeVisible();
    await expect(page.getByTestId("portal-session-parent-note-body")).toContainText(
      PARENT_NOTE,
    );

    await expect(page.getByText(INTERNAL_NOTE)).toHaveCount(0);

    // Portal attendance payload should not expose internal staff notes.
    for (const item of attendancePayload.items) {
      expect(Object.prototype.hasOwnProperty.call(item, "note")).toBeFalsy();
      expect(Object.prototype.hasOwnProperty.call(item, "internalNote")).toBeFalsy();
    }

    const sessionResponse = await page.request.get(
      buildPortalApiPath(tenantSlug, `/sessions/${fixtures.pastSessionId}`),
    );
    expect(sessionResponse.status()).toBe(200);
    const sessionPayload =
      (await sessionResponse.json()) as PortalSessionDetailResponse;

    for (const entry of sessionPayload.students) {
      if (!entry.attendance) continue;
      expect(Object.prototype.hasOwnProperty.call(entry.attendance, "note")).toBeFalsy();
      expect(
        Object.prototype.hasOwnProperty.call(entry.attendance, "internalNote"),
      ).toBeFalsy();
      expect(entry.attendance.parentVisibleNote ?? "").toContain(PARENT_NOTE);
    }
  });
});
