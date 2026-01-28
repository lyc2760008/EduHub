// Reports filter coverage: adjust upcoming date range and assert a known session row changes.
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

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

test.describe("Reports - filters", () => {
  test("Upcoming Sessions updates when date range changes", async ({ page }) => {
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
        "Missing E2E_TUTOR1_EMAIL (or E2E_TUTOR_EMAIL) for reports filter test.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });
    await assertTenantContext(page, tenantSlug);

    const users = await fetchUsers(page, tenantSlug);
    const tutor = users.find((user) => user.email === tutorEmail);
    if (!tutor) {
      throw new Error(`Tutor ${tutorEmail} not found in tenant ${tenantSlug}.`);
    }

    // Ensure we have at least one upcoming session with a roster to target.
    const { session } = await ensureSessionForTutorWithRoster(
      page,
      tenantSlug,
      tutor as UserSummary,
      1,
    );

    const sessionDate = DateTime.fromISO(session.startAt).toISODate();
    if (!sessionDate) {
      throw new Error("Unable to derive session date for report filters.");
    }
    const excludeDate = DateTime.fromISO(session.startAt)
      .plus({ days: 1 })
      .toISODate();
    if (!excludeDate) {
      throw new Error("Unable to derive exclusion date for report filters.");
    }

    await page.goto(buildTenantPath(tenantSlug, "/admin/reports"));
    await expect(page.getByTestId("report-upcoming-sessions")).toBeVisible();

    // Apply a tight range that should include the known session.
    await page.getByTestId("upcoming-date-from").fill(sessionDate);
    await page.getByTestId("upcoming-date-to").fill(sessionDate);

    const sessionRow = page.getByTestId(`reports-upcoming-${session.id}`);
    // Auto-refetch is debounced, so poll until the row appears.
    await expect.poll(async () => sessionRow.count()).toBeGreaterThan(0);

    // Shift the range to exclude the known session and assert it disappears.
    await page.getByTestId("upcoming-date-from").fill(excludeDate);
    await page.getByTestId("upcoming-date-to").fill(excludeDate);

    // Auto-refetch is debounced, so poll until the row disappears.
    await expect.poll(async () => sessionRow.count()).toBe(0);
  });
});
