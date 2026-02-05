// Tutor write permission checks for parent-visible attendance notes.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { resolveStep203Fixtures } from "..\/helpers/step203";
import { buildTenantApiPath } from "..\/helpers/tenant";

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|ECONNREFUSED|socket hang up/i.test(error.message);
}

async function putWithRetry(
  page: Parameters<typeof loginViaUI>[0],
  url: string,
  options: Parameters<Parameters<typeof loginViaUI>[0]["request"]["put"]>[1],
  attempts = 2,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.request.put(url, options);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

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

    const forbiddenResponse = await putWithRetry(
      page,
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

    const allowedResponse = await putWithRetry(
      page,
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


