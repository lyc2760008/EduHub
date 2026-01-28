// Session notes admin E2E coverage: save/persist, tenant context, and cross-tenant guard.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import {
  assertTenantContext,
  buildTenantPath,
} from "./helpers/tenant";
import {
  buildOtherTenantApiUrl,
  ensureSessionForTutorWithRoster,
  fetchUsers,
} from "./helpers/attendance";
import { uniqueString } from "./helpers/data";

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

test.describe("Session notes - admin", () => {
  test("Admin can save notes and see them after reload", async ({ page }) => {
    const adminEmail = requireEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requireEnv("E2E_ADMIN_PASSWORD");
    const tutorEmail = resolveTutor1Email();
    const tutorPassword = resolveTutor1Password();
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!tutorEmail || !tutorPassword) {
      throw new Error(
        "Missing E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD (or legacy E2E_TUTOR_EMAIL/E2E_TUTOR_PASSWORD) env vars.",
      );
    }

    await loginViaUI(page, { email: adminEmail, password: adminPassword, tenantSlug });
    await assertTenantContext(page, tenantSlug);

    const users = await fetchUsers(page, tenantSlug);
    const tutor = users.find((user) => user.email === tutorEmail);
    if (!tutor) {
      throw new Error(`Tutor ${tutorEmail} not found in tenant ${tenantSlug}.`);
    }

    const { session } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor,
      1,
    );

    await page.goto(buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`));
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("attendance-section")).toBeVisible();
    await expect(page.getByTestId("notes-section")).toBeVisible();

    const internalValue = uniqueString("E2E internal");
    const parentValue = uniqueString("E2E parent");

    await page.getByTestId("notes-internal-input").fill(internalValue);
    await page.getByTestId("notes-parent-visible-input").fill(parentValue);

    await page.getByTestId("notes-save-button").click();
    await expect(page.getByTestId("notes-saved-toast")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("notes-internal-input")).toHaveValue(internalValue);
    await expect(page.getByTestId("notes-parent-visible-input")).toHaveValue(parentValue);

    // Cross-tenant attempt should be blocked (404 preferred, 403 acceptable).
    const otherTenantSlug = tenantSlug === "demo" ? "qa" : "demo";
    const crossTenantResponse = await page.request.get(
      buildOtherTenantApiUrl(
        otherTenantSlug,
        `/api/sessions/${session.id}/notes`,
      ),
    );
    expect([403, 404]).toContain(crossTenantResponse.status());
  });
});
