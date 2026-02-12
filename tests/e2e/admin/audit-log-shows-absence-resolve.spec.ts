// Regression coverage that request resolution writes a redacted audit event in the admin log.
import { expect, test } from "@playwright/test";

import { ensurePortalAbsenceRequest } from "../helpers/absence-requests";
import { loginAsAdmin } from "../helpers/auth";
import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveStep204Fixtures } from "../helpers/step204";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type AuditItem = {
  id: string;
  action: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
};

type AuditListResponse = {
  items: AuditItem[];
};

test.describe("[regression] Audit log absence request resolve", () => {
  test("Audit log captures request.resolved without leaking request text", async ({
    page,
  }) => {
    const fixtures = resolveStep204Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const requestMessage = "Please excuse this absence.";

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      fixtures.parentA1Email,
      fixtures.accessCode,
    );
    const pendingRequest = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: fixtures.absenceSessionIds.resolve,
      studentId: fixtures.studentId,
      reasonCode: "ILLNESS",
      message: requestMessage,
    });
    expect(pendingRequest.status).toBe("PENDING");

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);
    const resolveResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, `/api/requests/${pendingRequest.id}/resolve`),
      { data: { status: "APPROVED" } },
    );
    expect(resolveResponse.status()).toBe(200);

    const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const query = new URLSearchParams({
      page: "1",
      pageSize: "100",
      sortField: "occurredAt",
      sortDir: "desc",
      filters: JSON.stringify({ from, to, action: "request.resolved" }),
    });
    const auditResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, `/api/admin/audit?${query.toString()}`),
    );
    expect(auditResponse.status()).toBe(200);
    const payload = (await auditResponse.json()) as AuditListResponse;
    const matched = payload.items.find((item) => item.entityId === pendingRequest.id);
    expect(matched).toBeTruthy();
    expect(matched?.action).toBe("request.resolved");
    expect(JSON.stringify(matched?.metadata ?? {})).not.toContain(requestMessage);

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expect(page.getByTestId("audit-log-page")).toBeVisible();
    await page.getByTestId("audit-log-search-input").fill("request.resolved");
    await expect(page.locator('tr[data-testid^="audit-row-"]').first()).toBeVisible();
  });
});
