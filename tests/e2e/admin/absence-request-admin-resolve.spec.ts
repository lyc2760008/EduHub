// Admin resolves a pending absence request from the requests inbox (Step 20.4C).
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

import { ensurePortalAbsenceRequest } from "..\/helpers/absence-requests";
import { loginAsAdmin } from "..\/helpers/auth";
import { resolveCenterAndTutor, uniqueString } from "..\/helpers/data";
import { loginParentWithAccessCode } from "..\/helpers/portal";
import { resolveStep204Fixtures } from "..\/helpers/step204";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

type SessionCreateResponse = {
  session?: { id?: string };
};

async function createUpcomingSession(
  page: Parameters<typeof loginAsAdmin>[0],
  tenantSlug: string,
  studentId: string,
) {
  // Create a unique upcoming session so this test doesn't race other resolve specs.
  const { tutor, center } = await resolveCenterAndTutor(page, tenantSlug);
  const timezone = center.timezone || "America/Edmonton";
  const seed = uniqueString("resolve-session");
  const seedValue = Array.from(seed).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const startAt = DateTime.now()
      .setZone(timezone)
      .plus({ days: 3 + attempt })
      .set({
        hour: 9 + (attempt % 4),
        minute: (seedValue + attempt * 11) % 55,
        second: (seedValue + attempt * 7) % 60,
        millisecond: (seedValue * 37 + attempt * 53) % 1000,
      });
    const endAt = startAt.plus({ hours: 1 });

    const response = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions"),
      {
        data: {
          centerId: center.id,
          tutorId: tutor.id,
          sessionType: "ONE_ON_ONE",
          studentId,
          startAt: startAt.toISO(),
          endAt: endAt.toISO(),
          timezone,
        },
      },
    );

    if (response.status() === 201) {
      const payload = (await response.json()) as SessionCreateResponse;
      const sessionId = payload.session?.id;
      if (!sessionId) {
        throw new Error("Expected session id in session create response.");
      }
      return sessionId;
    }

    if (response.status() !== 409) {
      const details = await response.text();
      throw new Error(
        `Unexpected session create status ${response.status()}: ${details}`,
      );
    }
  }

  throw new Error("Unable to create a unique session for resolve test.");
}

// Tagged for Playwright suite filtering.
test.describe("[regression] Admin resolves absence request", () => {
  test("Admin approves a pending request from the inbox", async ({ page }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    // Create a unique session as admin before the parent submits the request.
    await loginAsAdmin(page, tenantSlug);
    const sessionId = await createUpcomingSession(
      page,
      tenantSlug,
      fixtures.studentId,
    );

    await page.context().clearCookies();
    await loginParentWithAccessCode(page, tenantSlug, {
      email: fixtures.parentA1Email,
      accessCode: fixtures.accessCode,
    });

    const request = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId,
      studentId: fixtures.studentId,
      reasonCode: "ILLNESS",
      message: "Please excuse the absence.",
    });

    if (request.status !== "PENDING") {
      throw new Error(
        `Expected pending status for admin resolve test, got ${request.status}.`,
      );
    }

    // Clear parent session cookies before switching to admin.
    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/requests"));
    await expect(page.getByTestId("requests-page")).toBeVisible();

    // Requests status filter now lives in the shared filter sheet.
    await page.getByTestId("requests-list-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();

    // Switch to ALL to guard against pending filter edge cases.
    await page.getByTestId("admin-requests-status-filter").selectOption("ALL");
    await page.getByTestId("admin-filters-sheet-close").click();

    const rowTestId = `request-row-${request.id}`;
    await expect(page.getByTestId(rowTestId)).toBeVisible({ timeout: 20_000 });

    await page.getByTestId(rowTestId).click();
    await expect(page.getByTestId("requests-drawer")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("requests-approve-button").click();

    await expect(page.getByTestId("requests-drawer")).toHaveCount(0);

    // Switch back to PENDING so approved requests no longer appear in the inbox.
    await page.getByTestId("requests-list-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("admin-requests-status-filter").selectOption("PENDING");
    await page.getByTestId("admin-filters-sheet-close").click();

    await expect(page.getByTestId(rowTestId)).toHaveCount(0, { timeout: 20_000 });
  });
});


