// Attendance admin E2E coverage: persistence, roster stability, and tenant context.
import { expect, test, type Page } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";
import {
  buildOtherTenantApiUrl,
  ensureSessionForTutorWithRoster,
  fetchAttendance,
  fetchUsers,
} from "..\/helpers/attendance";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} env var.`);
  }
  return value;
}

function resolveTutor1Email() {
  return process.env.E2E_TUTOR1_EMAIL || process.env.E2E_TUTOR_EMAIL || "";
}

function resolveTutor1Password() {
  return process.env.E2E_TUTOR1_PASSWORD || process.env.E2E_TUTOR_PASSWORD || "";
}

async function assertTenantContext(page: Page, tenantSlug: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, "/api/me"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    membership?: { tenantId?: string; role?: string };
    tenant?: { tenantSlug?: string };
  };
  expect(payload.tenant?.tenantSlug).toBe(tenantSlug);
  expect(payload.membership?.tenantId).toBeTruthy();
  expect(payload.membership?.role).toBeTruthy();
}

async function selectStatus(page: Page, studentId: string, status: AttendanceStatus) {
  const selector = page.getByTestId(`attendance-status-select-${studentId}`);
  await selector.selectOption(status);
}

async function fillNote(page: Page, studentId: string, note: string) {
  await page.getByTestId(`attendance-note-${studentId}`).fill(note);
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Attendance - admin", () => {
  test("Admin can mark attendance and it persists after reload", async ({ page }) => {
    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    const tutorEmail = resolveTutor1Email();
    const tutorPassword = resolveTutor1Password();
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!tutorEmail || !tutorPassword) {
      throw new Error(
        "Missing E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD (or legacy E2E_TUTOR_EMAIL/E2E_TUTOR_PASSWORD) env vars.",
      );
    }

    await loginViaUI(page, { email: adminEmail, password: adminPassword, tenantSlug });
    await assertTenantContext(page, tenantSlug);

    // Regression smoke: sessions list and groups page still load.
    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();
    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));
    await expect(page.getByTestId("groups-page")).toBeVisible();

    const users = await fetchUsers(page, tenantSlug);
    const tutor = users.find((user) => user.email === tutorEmail);
    if (!tutor) {
      throw new Error(`Tutor ${tutorEmail} not found in tenant ${tenantSlug}.`);
    }

    const { session, attendance } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor,
      2,
    );

    const rosterIds = attendance.roster
      .map((entry) => entry.student.id)
      .sort();
    const [firstStudent, secondStudent] = attendance.roster;
    if (!firstStudent || !secondStudent) {
      throw new Error("Attendance roster must contain at least two students.");
    }

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`),
    );
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("attendance-section")).toBeVisible();

    await selectStatus(page, firstStudent.student.id, "PRESENT");
    await fillNote(page, firstStudent.student.id, "On time");
    await selectStatus(page, secondStudent.student.id, "LATE");
    await fillNote(page, secondStudent.student.id, "Late arrival");

    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(
      page.getByTestId(`attendance-status-select-${firstStudent.student.id}`),
    ).toHaveValue("PRESENT");
    await expect(
      page.getByTestId(`attendance-status-select-${secondStudent.student.id}`),
    ).toHaveValue("LATE");

    const refreshed = await fetchAttendance(page, tenantSlug, session.id);
    expect(refreshed.roster.map((entry) => entry.student.id).sort()).toEqual(
      rosterIds,
    );
  });

  test("Attendance API blocks tampered roster updates", async ({ page }) => {
    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    const tutorEmail = resolveTutor1Email();
    const tutorPassword = resolveTutor1Password();
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!tutorEmail || !tutorPassword) {
      throw new Error(
        "Missing E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD (or legacy E2E_TUTOR_EMAIL/E2E_TUTOR_PASSWORD) env vars.",
      );
    }

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
    const rosterEntry = attendance.roster[0];
    if (!rosterEntry) {
      throw new Error("Attendance roster must contain at least one student.");
    }

    const tamperedStudentId = `${rosterEntry.student.id}-tamper`;
    const response = await page.request.put(
      buildTenantApiPath(tenantSlug, `/api/sessions/${session.id}/attendance`),
      {
        data: {
          items: [
            {
              studentId: tamperedStudentId,
              status: "PRESENT",
              note: "Tampered",
            },
          ],
        },
      },
    );
    expect([400, 403]).toContain(response.status());

    // Prefer a configured secondary slug so cross-tenant checks stay within e2e tenants.
    const otherTenantSlug =
      process.env.E2E_SECOND_TENANT_SLUG ||
      (tenantSlug.toLowerCase().startsWith("e2e")
        ? `${tenantSlug}-secondary`
        : process.env.SEED_SECOND_TENANT_SLUG || "acme");
    const crossTenantResponse = await page.request.get(
      buildOtherTenantApiUrl(
        otherTenantSlug,
        `/api/sessions/${session.id}/attendance`,
      ),
    );
    expect([403, 404]).toContain(crossTenantResponse.status());
  });
});



