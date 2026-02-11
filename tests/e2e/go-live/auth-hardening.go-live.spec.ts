// Go-live staging smoke: parent auth throttling/lockout messaging appears under repeated failures.
import { expect, test } from "@playwright/test";

import { buildTenantPath } from "../helpers/tenant";

function resolveGoLiveTenantSlug() {
  // Prefer an explicit go-live tenant slug, then fall back to the default e2e tenant.
  return (
    process.env.E2E_GO_LIVE_TENANT_SLUG ||
    process.env.E2E_TENANT_SLUG ||
    "e2e-testing"
  );
}

function resolveThrottleEmail() {
  // Use a dedicated throttle test email to avoid impacting real users.
  return process.env.E2E_THROTTLE_EMAIL || "throttle-test@example.com";
}

function resolveThrottleAttempts() {
  const raw = Number(process.env.E2E_THROTTLE_ATTEMPTS || 6);
  return Number.isFinite(raw) ? Math.max(3, raw) : 6;
}

// Tagged for go-live suite filtering (staging-only; not prod-safe).
test.describe("[go-live] Auth hardening", () => {
  test("[go-live] Parent magic-link request throttles after repeated sends", async ({ page }) => {
    const tenantSlug = resolveGoLiveTenantSlug();
    const email = resolveThrottleEmail();
    const attempts = resolveThrottleAttempts();

    await page.goto(buildTenantPath(tenantSlug, "/parent/login"));
    await expect(page.getByTestId("parent-login-page")).toBeVisible();

    await page.getByTestId("parent-login-email").fill(email);

    // First request may already be rate-limited in shared staging DBs; accept either state.
    await page.getByTestId("parent-login-submit").click();

    const rateLimitAlert = page.getByTestId("parent-login-rate-limit");
    const successView = page.getByTestId("parent-login-success");

    await Promise.race([
      rateLimitAlert.waitFor({ state: "visible" }),
      successView.waitFor({ state: "visible" }),
    ]);

    // If we weren't throttled immediately, repeatedly resend until the throttling UI appears.
    if ((await rateLimitAlert.count()) === 0) {
      const resendButton = page.getByTestId("parent-login-resend");
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        await resendButton.click();
        if ((await rateLimitAlert.count()) > 0) break;
      }
    }

    await expect(rateLimitAlert).toBeVisible();
  });
});
