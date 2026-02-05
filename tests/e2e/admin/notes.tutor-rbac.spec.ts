// Session notes RBAC E2E coverage: assigned tutor allowed; other tutor blocked.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";
import {
  ensureSessionForTutorWithRoster,
  fetchUsers,
} from "..\/helpers/attendance";
import { uniqueString } from "..\/helpers/data";

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

// Tagged for Playwright suite filtering.
test.describe("[regression] Session notes - tutor RBAC", () => {
  test("Assigned tutor can save; other tutor is forbidden", async ({ page }) => {
    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    const tutor1Email = resolveTutor1Email();
    const tutor1Password = resolveTutor1Password();
    const tutor2Email = resolveTutor2Email();
    const tutor2Password = resolveTutor2Password();
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    test.skip(
      !tutor1Email || !tutor1Password || !tutor2Email || !tutor2Password,
      "Missing tutor credentials: set E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD and E2E_TUTOR2_EMAIL/E2E_TUTOR2_PASSWORD.",
    );

    // Admin discovers or creates a session assigned to Tutor1.
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

    const { session } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor1,
      1,
    );

    // Tutor1 can edit notes for their session.
    await loginViaUI(page, { email: tutor1Email, password: tutor1Password, tenantSlug });
    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`));
    await expect(page.getByTestId("notes-section")).toBeVisible();

    const tutorNote = uniqueString("E2E tutor1 internal");
    await page.getByTestId("notes-internal-input").fill(tutorNote);
    await page.getByTestId("notes-save-button").click();
    await expect(page.getByTestId("notes-saved-toast")).toBeVisible();

    // Tutor2 API access should be forbidden for Tutor1's session.
    await loginViaUI(page, { email: tutor2Email, password: tutor2Password, tenantSlug });
    const forbiddenResponse = await page.request.put(
      buildTenantApiPath(tenantSlug, `/api/sessions/${session.id}/notes`),
      { data: { internalNote: "Blocked" } },
    );
    expect(forbiddenResponse.status()).toBe(403);

    // Tutor2 UI should not expose the session detail content.
    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`));
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="session-detail-missing"]'),
    ).toBeVisible();

    // Switch back to Tutor1 to confirm notes were not overwritten.
    await loginViaUI(page, { email: tutor1Email, password: tutor1Password, tenantSlug });
    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`));
    await expect(page.getByTestId("notes-internal-input")).toHaveValue(tutorNote);
  });
});



