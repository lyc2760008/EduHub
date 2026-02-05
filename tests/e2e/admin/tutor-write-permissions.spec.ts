// Tutor write permission checks for parent-visible attendance notes.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { resolveStep203Fixtures } from "..\/helpers/step203";
import { buildTenantApiPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Tutor write permissions", () => {
  test("Tutor can write only their own session attendance", async ({ page }) => {
    const fixtures = resolveStep203Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginViaUI(page, {
      email: fixtures.tutorAEmail,
      password: fixtures.accessCode,
      tenantSlug,
    });

    const forbiddenResponse = await page.request.put(
      buildTenantApiPath(tenantSlug, `/api/sessions/${fixtures.tutorBSessionId}/attendance`),
      {
        data: {
          items: [
            {
              studentId: fixtures.studentId,
              status: "PRESENT",
              parentVisibleNote: "BLOCKED_NOTE",
            },
          ],
        },
      },
    );
    expect(forbiddenResponse.status()).toBe(403);

    const allowedResponse = await page.request.put(
      buildTenantApiPath(tenantSlug, `/api/sessions/${fixtures.pastSessionId}/attendance`),
      {
        data: {
          items: [
            {
              studentId: fixtures.studentId,
              status: "PRESENT",
              parentVisibleNote: "ALLOWED_NOTE",
            },
          ],
        },
      },
    );
    expect(allowedResponse.status()).toBe(200);
  });
});


