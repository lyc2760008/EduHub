// Reports regression smoke: ensure sessions list and detail sections still render.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/auth";
import {
  ensureSessionForTutorWithRoster,
  fetchUsers,
  type UserSummary,
} from "./helpers/attendance";
import { assertTenantContext, buildTenantPath } from "./helpers/tenant";

function resolveTutorEmail() {
  return process.env.E2E_TUTOR1_EMAIL || process.env.E2E_TUTOR_EMAIL || "";
}

test.describe("Reports - regression smoke", () => {
  test("Sessions list and detail sections render", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";
    const tutorEmail = resolveTutorEmail();

    if (!email || !password) {
      throw new Error(
        "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.",
      );
    }

    if (!tutorEmail) {
      throw new Error(
        "Missing E2E_TUTOR1_EMAIL (or E2E_TUTOR_EMAIL) for regression smoke.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });
    await assertTenantContext(page, tenantSlug);

    const users = await fetchUsers(page, tenantSlug);
    const tutor = users.find((user) => user.email === tutorEmail);
    if (!tutor) {
      throw new Error(`Tutor ${tutorEmail} not found in tenant ${tenantSlug}.`);
    }

    // Ensure a session exists before opening list/detail pages.
    const { session } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor as UserSummary,
      1,
    );

    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    await expect(page.getByTestId("sessions-list-page")).toBeVisible();

    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${session.id}`),
    );
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("attendance-section")).toBeVisible();
    await expect(page.getByTestId("notes-section")).toBeVisible();
  });
});
