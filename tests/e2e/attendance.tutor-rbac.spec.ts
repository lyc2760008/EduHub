// Attendance RBAC E2E coverage: assigned tutor allowed; other tutor blocked.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { buildTenantApiPath, buildTenantPath } from "./helpers/tenant";
import {
  ensureSessionForTutorWithRoster,
  fetchAttendance,
  fetchUsers,
} from "./helpers/attendance";

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

function resolveTutor2Email() {
  return process.env.E2E_TUTOR2_EMAIL || "";
}

function resolveTutor2Password() {
  return process.env.E2E_TUTOR2_PASSWORD || "";
}

test.describe("Attendance - tutor RBAC", () => {
  test("Assigned tutor can save; other tutor is forbidden", async ({ page }) => {
    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    const tutor1Email = resolveTutor1Email();
    const tutor1Password = resolveTutor1Password();
    const tutor2Email = resolveTutor2Email();
    const tutor2Password = resolveTutor2Password();
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    test.skip(
      !tutor1Email || !tutor1Password || !tutor2Email || !tutor2Password,
      "Missing tutor credentials: set E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD and E2E_TUTOR2_EMAIL/E2E_TUTOR2_PASSWORD.",
    );

    // Admin discovers a session assigned to Tutor1 with at least one roster entry.
    await loginViaUI(page, { email: adminEmail, password: adminPassword, tenantSlug });
    const users = await fetchUsers(page, tenantSlug);
    const tutor1 = users.find((user) => user.email === tutor1Email);
    const tutor2 = users.find((user) => user.email === tutor2Email);

    if (!tutor1) {
      throw new Error(`Tutor1 ${tutor1Email} not found in tenant ${tenantSlug}.`);
    }
    if (!tutor2) {
      throw new Error(`Tutor2 ${tutor2Email} not found in tenant ${tenantSlug}.`);
    }
    if (tutor1.id === tutor2.id) {
      throw new Error("Tutor1 and Tutor2 must be different users.");
    }

    const { session, attendance } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor1,
      1,
    );
    const rosterEntry = attendance.roster[0];
    if (!rosterEntry) {
      throw new Error("Attendance roster must contain at least one student.");
    }

    // Tutor1 can save attendance for their session.
    await loginViaUI(page, { email: tutor1Email, password: tutor1Password, tenantSlug });
    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`),
    );
    await expect(page.getByTestId("attendance-section")).toBeVisible();

    await page
      .getByTestId(`attendance-status-select-${rosterEntry.student.id}`)
      .selectOption("EXCUSED");
    await page.getByTestId("attendance-save-button").click();
    await expect(page.getByTestId("attendance-save-success")).toBeVisible();

    // Tutor2 is forbidden from saving attendance for Tutor1's session.
    await loginViaUI(page, { email: tutor2Email, password: tutor2Password, tenantSlug });
    const forbiddenResponse = await page.request.put(
      buildTenantApiPath(tenantSlug, `/api/sessions/${session.id}/attendance`),
      {
        data: {
          items: [
            {
              studentId: rosterEntry.student.id,
              status: "ABSENT",
              note: "Should be blocked",
            },
          ],
        },
      },
    );
    expect(forbiddenResponse.status()).toBe(403);

    // Tutor2 UI should not expose the attendance section for this session.
    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`),
    );
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="session-detail-missing"]'),
    ).toBeVisible();

    // Switch back to admin context to verify data was not changed.
    await loginViaUI(page, { email: adminEmail, password: adminPassword, tenantSlug });
    const refreshed = await fetchAttendance(page, tenantSlug, session.id);
    const updated = refreshed.roster.find(
      (entry) => entry.student.id === rosterEntry.student.id,
    );
    expect(updated?.attendance?.status).toBe("EXCUSED");
  });
});
