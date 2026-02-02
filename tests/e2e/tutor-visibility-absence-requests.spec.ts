// Tutor visibility checks for absence requests (assigned vs unassigned sessions).
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import { ensurePortalAbsenceRequest } from "./helpers/absence-requests";
import { loginParentWithAccessCode } from "./helpers/portal";
import { resolveStep205Fixtures } from "./helpers/step205";
import { buildTenantPath } from "./helpers/tenant";

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

test.describe("Tutor visibility for absence requests", () => {
  test("Assigned tutor sees request; other tutor is blocked", async ({ page }) => {
    const fixtures = resolveStep205Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const sessionId = fixtures.absenceStaffSessionIds.pending;
    const studentId = fixtures.studentId;

    const tutor1Email = resolveTutor1Email();
    const tutor1Password = resolveTutor1Password();
    const tutor2Email = resolveTutor2Email();
    const tutor2Password = resolveTutor2Password();

    test.skip(
      !tutor1Email ||
        !tutor1Password ||
        !tutor2Email ||
        !tutor2Password,
      "Missing tutor credentials: set E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD and E2E_TUTOR2_EMAIL/E2E_TUTOR2_PASSWORD.",
    );

    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId,
      reasonCode: "ILLNESS",
      message: "Tutor visibility check.",
    });
    if (request.status !== "PENDING") {
      throw new Error(
        "Tutor visibility test expects a pending request. Run pnpm e2e:seed to reset fixtures.",
      );
    }

    await page.context().clearCookies();
    await loginViaUI(page, {
      email: tutor1Email,
      password: tutor1Password,
      tenantSlug,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    const tutorRow = page.getByTestId(`sessions-row-${sessionId}`);
    await expect(tutorRow).toBeVisible();
    await expect(tutorRow.getByTestId(`absence-badge-${sessionId}`)).toBeVisible();

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expect(page.getByTestId("absence-request-panel")).toBeVisible();

    await page.context().clearCookies();
    await loginViaUI(page, {
      email: tutor2Email,
      password: tutor2Password,
      tenantSlug,
    });

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId(`sessions-row-${sessionId}`)).toHaveCount(0);

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${sessionId}`));
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="session-detail-missing"]'),
    ).toBeVisible();
  });
});
