// Step 22.6 admin audit E2E coverage: table state, drill-in redaction, CSV export, RBAC, and event coverage.
import { expect, test, type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { ensurePortalAbsenceRequest } from "../helpers/absence-requests";
import { parseAuditCsv, findSensitiveMatch, parseAuditFiltersFromUrl, waitForAuditTableReady } from "../helpers/audit";
import { fetchCenters, fetchUsers, uniqueString } from "../helpers/data";
import { loginAsAdmin, loginAsTutor } from "../helpers/auth";
import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveStep204Fixtures } from "../helpers/step204";
import { resolveStep224Fixtures } from "../helpers/step224";
import {
  STEP226_AUDIT_MARKER,
  STEP226_INTERNAL_ONLY_SENTINEL,
  resolveStep226Fixtures,
} from "../helpers/step226";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

type AuditListItem = {
  id: string;
  occurredAt: string;
  actorType: "USER" | "SYSTEM" | "PARENT";
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: "SUCCESS" | "FAILURE";
  metadata: Record<string, unknown> | null;
};

type AuditListResponse = {
  items: AuditListItem[];
};

type MeResponse = {
  user: { id: string; email: string };
  membership: { role: string };
};

type SessionCreateResponse = {
  session?: { id?: string };
};

function readDateRangeWindow() {
  const today = DateTime.utc().startOf("day");
  return {
    // Step 22.6 seed intentionally spans multiple weeks; keep this window wide so pagination assertions are stable.
    from: today.minus({ days: 45 }).toISODate() || "2026-01-01",
    to: today.plus({ days: 2 }).toISODate() || "2026-12-31",
  };
}

function toAuditListQuery(params: {
  from: string;
  to: string;
  action?: string;
  entityType?: string;
  search?: string;
  pageSize?: number;
}) {
  const query = new URLSearchParams({
    page: "1",
    pageSize: String(params.pageSize ?? 100),
    sortField: "occurredAt",
    sortDir: "desc",
  });
  const filters: Record<string, unknown> = {
    from: params.from,
    to: params.to,
  };
  if (params.action) filters.action = params.action;
  if (params.entityType) filters.entityType = params.entityType;
  query.set("filters", JSON.stringify(filters));
  if (params.search) query.set("search", params.search);
  return query.toString();
}

function unwrapRows<T>(payload: unknown) {
  // Admin APIs use the table contract (`rows`) but some older routes still use `items`.
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [] as T[];
  const rows = (payload as { rows?: unknown }).rows;
  if (Array.isArray(rows)) return rows as T[];
  const items = (payload as { items?: unknown }).items;
  if (Array.isArray(items)) return items as T[];
  return [] as T[];
}

async function fetchCurrentUser(page: Page, tenantSlug: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, "/api/me"),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as MeResponse;
}

async function fetchAuditItems(
  page: Page,
  tenantSlug: string,
  options: {
    action?: string;
    entityType?: string;
    search?: string;
  } = {},
) {
  const { from, to } = readDateRangeWindow();
  const query = toAuditListQuery({
    from,
    to,
    action: options.action,
    entityType: options.entityType,
    search: options.search,
  });
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, `/api/admin/audit?${query}`),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as AuditListResponse;
  return payload.items ?? [];
}

async function waitForAuditEvent(
  page: Page,
  tenantSlug: string,
  args: {
    action: string;
    entityType: string;
    entityId: string;
    actorId: string;
    startedAtMs: number;
  },
) {
  await expect
    .poll(async () => {
      const items = await fetchAuditItems(page, tenantSlug, {
        action: args.action,
        entityType: args.entityType,
      });
      const matched = items.find((item) => {
        const occurredAt = Date.parse(item.occurredAt);
        return (
          item.entityId === args.entityId &&
          item.actorId === args.actorId &&
          occurredAt >= args.startedAtMs - 5_000
        );
      });
      return matched ? JSON.stringify(matched) : "";
    })
    .not.toBe("");
}

async function createResolveTargetSession(page: Page, tenantSlug: string, studentId: string) {
  const users = await fetchUsers(page, tenantSlug);
  const centers = await fetchCenters(page, tenantSlug);
  const tutor = users.find((entry) => entry.role === "Tutor" && entry.centers.length > 0);
  if (!tutor) {
    throw new Error("Expected at least one tutor with a center assignment for Step 22.6 tests.");
  }

  const center = centers.find((entry) => entry.id === tutor.centers[0]?.id) ?? centers[0];
  if (!center) {
    throw new Error("Expected at least one center for Step 22.6 tests.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const startAt = DateTime.now()
      .setZone(center.timezone || "America/Edmonton")
      .plus({ days: 4 + attempt, minutes: attempt * 7 })
      .set({ second: attempt, millisecond: 0 });
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
          timezone: center.timezone || "America/Edmonton",
        },
      },
    );
    if (response.status() === 201) {
      const payload = (await response.json()) as SessionCreateResponse;
      const sessionId = payload.session?.id;
      if (!sessionId) {
        throw new Error("Expected session id in Step 22.6 request-resolution setup.");
      }
      return { sessionId, centerId: center.id, tutorId: tutor.id };
    }
    if (response.status() !== 409) {
      throw new Error(`Unexpected create session status ${response.status()} in Step 22.6 setup.`);
    }
  }

  throw new Error("Unable to create a unique session for Step 22.6 request-resolution coverage.");
}

test.describe("[regression] [step22.6] Admin audit log + CSV export", () => {
  test("Audit table supports search/filter/sort/pagination and URL state persistence", async ({ page }) => {
    const fixtures = resolveStep226Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const dateRange = readDateRangeWindow();
    const initialParams = new URLSearchParams({
      page: "1",
      pageSize: "10",
      sortField: "occurredAt",
      sortDir: "desc",
      filters: JSON.stringify({ from: dateRange.from, to: dateRange.to }),
    });

    await loginAsAdmin(page, tenantSlug);
    // Start with a deterministic range/page size so pagination assertions are meaningful against seeded data.
    await page.goto(buildTenantPath(tenantSlug, `/admin/audit?${initialParams.toString()}`));
    await waitForAuditTableReady(page);

    const searchInput = page.getByTestId("audit-log-search-input");
    await searchInput.fill("step226");
    await expect.poll(() => new URL(page.url()).searchParams.get("search") ?? "").toBe("step226");

    await page.getByTestId("audit-table-sort-action").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("sortField") ?? "").toBe("action");
    await expect.poll(() => new URL(page.url()).searchParams.get("sortDir") ?? "").toBe("asc");

    await page.getByTestId("admin-pagination-next").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("page") ?? "").toBe("2");
    await waitForAuditTableReady(page);

    await page.reload();
    await waitForAuditTableReady(page);
    await expect(searchInput).toHaveValue("step226");
    await expect.poll(() => new URL(page.url()).searchParams.get("sortField") ?? "").toBe("action");
    await expect.poll(() => new URL(page.url()).searchParams.get("sortDir") ?? "").toBe("asc");
    await expect.poll(() => new URL(page.url()).searchParams.get("page") ?? "").toBe("2");
    // Persisted URL state is the contract; exact row identity can vary when multiple rows tie on sortable values.
    const reloadedFirstRowId =
      (await page.locator('tr[data-testid^="audit-row-"]').first().getAttribute("data-testid")) || "";
    expect(reloadedFirstRowId).not.toBe("");

    await page.getByTestId("audit-log-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("audit-filter-action-type").selectOption("sessions");
    await page.getByTestId("admin-filters-sheet-close").click();
    await expect(page.getByTestId("audit-log-search-filter-chip-actionType")).toBeVisible();
    await expect
      .poll(() => String(parseAuditFiltersFromUrl(page).actionType ?? ""))
      .toBe("sessions");

    // Clear the action-type filter so the marker search does not depend on category mapping.
    await page.getByTestId("audit-log-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("audit-filter-action-type").selectOption("all");
    await page.getByTestId("admin-filters-sheet-close").click();
    await expect(page.getByTestId("audit-log-search-filter-chip-actionType")).toHaveCount(0);

    await searchInput.fill(STEP226_AUDIT_MARKER);
    await expect.poll(() => new URL(page.url()).searchParams.get("search") ?? "").toBe(STEP226_AUDIT_MARKER);
    await waitForAuditTableReady(page);
    await expect(page.getByTestId("audit-table")).toContainText(STEP226_AUDIT_MARKER);
  });

  test("Audit detail drill-in shows expected fields and omits sensitive/internal values", async ({ page }) => {
    const fixtures = resolveStep226Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await loginAsAdmin(page, tenantSlug);
    await page.goto(buildTenantPath(tenantSlug, `/admin/audit?search=${encodeURIComponent(STEP226_AUDIT_MARKER)}`));
    await waitForAuditTableReady(page);

    const [detailResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/audit/") &&
          response.request().method() === "GET",
      ),
      page.locator('tr[data-testid^="audit-row-"]').first().click(),
    ]);

    const detailDrawer = page.getByTestId("audit-detail-drawer");
    await expect(detailDrawer).toBeVisible();
    await expect(detailDrawer).toContainText(/Audit event|审计事件/i);
    await expect(detailDrawer).toContainText(/Details|详情/i);

    const drawerText = await detailDrawer.innerText();
    expect(findSensitiveMatch(drawerText)).toBeNull();
    expect(drawerText).not.toContain(STEP226_INTERNAL_ONLY_SENTINEL);

    const detailPayload = await detailResponse.json();
    const serialized = JSON.stringify(detailPayload);
    expect(findSensitiveMatch(serialized)).toBeNull();
    expect(serialized).not.toContain(STEP226_INTERNAL_ONLY_SENTINEL);
  });

  test("CSV export respects current filters and parses correctly", async ({ page }) => {
    const fixtures = resolveStep226Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const dateRange = readDateRangeWindow();

    await loginAsAdmin(page, tenantSlug);
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await waitForAuditTableReady(page);

    await page.getByTestId("audit-log-search-input").fill(STEP226_AUDIT_MARKER);
    await expect.poll(() => new URL(page.url()).searchParams.get("search") ?? "").toBe(STEP226_AUDIT_MARKER);
    await page.getByTestId("audit-log-search-filters-button").click();
    await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();
    await page.getByTestId("audit-filter-start-date").fill(dateRange.from);
    await page.getByTestId("audit-filter-end-date").fill(dateRange.to);
    await page.getByTestId("admin-filters-sheet-close").click();
    // Filter UIs may normalize/clamp start dates, so assertions should follow applied URL state.
    await expect.poll(() => String(parseAuditFiltersFromUrl(page).to ?? "")).toBe(dateRange.to);
    const appliedFilters = parseAuditFiltersFromUrl(page);
    const appliedFrom = String(appliedFilters.from ?? "");
    const appliedTo = String(appliedFilters.to ?? "");
    expect(appliedFrom).not.toBe("");
    expect(appliedTo).toBe(dateRange.to);

    const downloadPromise = page.waitForEvent("download", { timeout: 8_000 }).catch(() => null);
    const [exportRequest, exportResponse] = await Promise.all([
      page.waitForRequest((request) => request.url().includes("/api/admin/audit/export")),
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/admin/audit/export") &&
          response.request().method() === "GET",
      ),
      page.getByTestId("audit-log-export-csv").click(),
    ]);

    const maybeDownload = await downloadPromise;
    if (maybeDownload) {
      // Suggested filename assertion is best-effort because blob-based downloads can vary by browser.
      expect(maybeDownload.suggestedFilename().toLowerCase()).toContain("audit");
    }

    expect(exportResponse.ok()).toBeTruthy();
    const csvProbeResponse = await page.request.get(exportRequest.url());
    expect(csvProbeResponse.ok()).toBeTruthy();
    const csvContent = await csvProbeResponse.text();

    const parsed = parseAuditCsv(csvContent);
    expect(parsed.headers).toEqual(
      expect.arrayContaining([
        "timestamp",
        "action",
        "result",
        "entityType",
        "entityId",
        "actorId",
        "correlationId",
        "metadata_summary",
      ]),
    );
    expect(parsed.rows.length).toBeGreaterThanOrEqual(1);

    for (const row of parsed.rows) {
      expect(row.entityId).toContain(STEP226_AUDIT_MARKER);
      const parsedTimestamp = DateTime.fromISO(row.timestamp, { zone: "utc" });
      expect(parsedTimestamp.isValid).toBeTruthy();
      expect(parsedTimestamp.toISODate()! >= appliedFrom).toBeTruthy();
      expect(parsedTimestamp.toISODate()! <= appliedTo).toBeTruthy();
    }

    expect(findSensitiveMatch(csvContent)).toBeNull();
    expect(csvContent).not.toContain(STEP226_INTERNAL_ONLY_SENTINEL);
  });

  test("CSV export handles empty dataset gracefully", async ({ page }) => {
    const fixtures = resolveStep226Fixtures();
    const tenantSlug = fixtures.tenantSlug;
    const noMatch = "E2E_NO_MATCH_999";

    await loginAsAdmin(page, tenantSlug);
    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await waitForAuditTableReady(page);

    await page.getByTestId("audit-log-search-input").fill(noMatch);
    await expect.poll(() => new URL(page.url()).searchParams.get("search") ?? "").toBe(noMatch);
    await expect(page.getByTestId("audit-table").getByTestId("admin-table-empty")).toBeVisible();
    await expect(page.getByTestId("audit-log-export-csv")).toBeDisabled();

    const query = new URL(page.url()).searchParams.toString();
    const response = await page.request.get(
      buildTenantApiPath(tenantSlug, `/api/admin/audit/export?${query}`),
    );
    expect(response.ok()).toBeTruthy();
    const parsed = parseAuditCsv(await response.text());
    expect(parsed.headers.length).toBeGreaterThanOrEqual(1);
    expect(parsed.rows.length).toBe(0);
  });

  test("Audit UI/API enforce RBAC and cross-tenant isolation", async ({ page }) => {
    const fixtures = resolveStep226Fixtures();
    const tenantSlug = fixtures.tenantSlug;

    await page.context().clearCookies();
    await loginAsTutor(page, tenantSlug);

    await page.goto(buildTenantPath(tenantSlug, "/admin/audit"));
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="login-page"]'),
    ).toBeVisible();

    const tutorApiResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/admin/audit?page=1&pageSize=5"),
    );
    expect([401, 403]).toContain(tutorApiResponse.status());

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await page.goto(buildTenantPath(fixtures.secondaryTenantSlug, "/admin/audit"));
    await expect(
      page.locator('[data-testid="access-denied"], [data-testid="login-page"]'),
    ).toBeVisible();

    const crossTenantApiResponse = await page.request.get(
      `/t/${fixtures.secondaryTenantSlug}/api/admin/audit?page=1&pageSize=5`,
    );
    expect([401, 403, 404]).toContain(crossTenantApiResponse.status());
  });

  test("Key mutation routes emit expected Step 22.6 audit events with safe payloads", async ({ page }) => {
    const step204 = resolveStep204Fixtures();
    const step226 = resolveStep226Fixtures();
    const step224 = resolveStep224Fixtures();
    const tenantSlug = step226.tenantSlug;

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);
    const adminMe = await fetchCurrentUser(page, tenantSlug);
    const adminId = adminMe.user.id;

    const setupSession = await createResolveTargetSession(page, tenantSlug, step204.studentId);
    const groupsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/groups?page=1&pageSize=25"),
    );
    expect(groupsResponse.ok()).toBeTruthy();
    const groupsPayload = await groupsResponse.json();
    const groups = unwrapRows<{ id: string }>(groupsPayload);
    const group = groups[0];
    if (!group?.id) {
      throw new Error("Expected at least one group for Step 22.6 sync coverage.");
    }

    await page.context().clearCookies();
    await loginAsParentWithAccessCode(
      page,
      tenantSlug,
      step204.parentA1Email,
      step204.accessCode,
    );
    const pendingRequest = await ensurePortalAbsenceRequest(page, {
      tenantSlug,
      sessionId: setupSession.sessionId,
      studentId: step204.studentId,
      reasonCode: "ILLNESS",
      message: uniqueString("step226-request"),
    });
    expect(pendingRequest.id).toBeTruthy();
    expect(pendingRequest.status).toBe("PENDING");

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);
    const adminMutationStart = Date.now();

    const resolveResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, `/api/requests/${pendingRequest.id}/resolve`),
      { data: { status: "APPROVED" } },
    );
    expect(resolveResponse.status()).toBe(200);

    const generateDate = DateTime.now().setZone("America/Edmonton").plus({ days: 40 });
    const generateStartDate = generateDate.toISODate();
    if (!generateStartDate) {
      throw new Error("Unable to resolve generate start date for Step 22.6.");
    }
    const generateResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      {
        data: {
          centerId: setupSession.centerId,
          tutorId: setupSession.tutorId,
          sessionType: "ONE_ON_ONE",
          studentId: step204.studentId,
          startDate: generateStartDate,
          endDate: generateStartDate,
          weekdays: [generateDate.weekday],
          startTime: "10:00",
          endTime: "11:00",
          timezone: "America/Edmonton",
          dryRun: false,
        },
      },
    );
    expect(generateResponse.status()).toBe(200);

    const syncResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, `/api/groups/${group.id}/sync-future-sessions`),
      { data: {} },
    );
    expect(syncResponse.status()).toBe(200);

    await page.context().clearCookies();
    await loginAsTutor(page, tenantSlug);
    const tutorMe = await fetchCurrentUser(page, tenantSlug);
    const tutorId = tutorMe.user.id;
    const tutorMutationStart = Date.now();

    const rosterResponse = await page.request.get(
      buildTenantApiPath(
        tenantSlug,
        `/api/sessions/${step224.tutorSessionIds.tutorAFirst}/attendance`,
      ),
    );
    expect(rosterResponse.status()).toBe(200);
    const rosterPayload = (await rosterResponse.json()) as {
      roster?: Array<{ student: { id: string } }>;
    };
    const rosterStudent = rosterPayload.roster?.[0]?.student.id;
    if (!rosterStudent) {
      throw new Error("Expected a roster student for tutor attendance Step 22.6 coverage.");
    }

    const attendanceResponse = await page.request.put(
      buildTenantApiPath(
        tenantSlug,
        `/api/sessions/${step224.tutorSessionIds.tutorAFirst}/attendance`,
      ),
      {
        data: {
          items: [
            {
              studentId: rosterStudent,
              status: "LATE",
              note: STEP226_INTERNAL_ONLY_SENTINEL,
              parentVisibleNote: uniqueString("step226-parent-visible"),
            },
          ],
        },
      },
    );
    expect(attendanceResponse.status()).toBe(200);

    const notesResponse = await page.request.put(
      buildTenantApiPath(
        tenantSlug,
        `/api/sessions/${step224.tutorSessionIds.tutorAFirst}/notes`,
      ),
      {
        data: {
          parentVisibleNote: uniqueString("step226-notes"),
        },
      },
    );
    expect(notesResponse.status()).toBe(200);

    await page.context().clearCookies();
    await loginAsAdmin(page, tenantSlug);

    await waitForAuditEvent(page, tenantSlug, {
      action: "request.resolved",
      entityType: "REQUEST",
      entityId: pendingRequest.id,
      actorId: adminId,
      startedAtMs: adminMutationStart,
    });
    await waitForAuditEvent(page, tenantSlug, {
      action: "sessions.generated",
      entityType: "SESSION",
      entityId: setupSession.centerId,
      actorId: adminId,
      startedAtMs: adminMutationStart,
    });
    await waitForAuditEvent(page, tenantSlug, {
      action: "group.futureSessions.synced",
      entityType: "GROUP",
      entityId: group.id,
      actorId: adminId,
      startedAtMs: adminMutationStart,
    });
    await waitForAuditEvent(page, tenantSlug, {
      action: "attendance.updated",
      entityType: "SESSION",
      entityId: step224.tutorSessionIds.tutorAFirst,
      actorId: tutorId,
      startedAtMs: tutorMutationStart,
    });
    await waitForAuditEvent(page, tenantSlug, {
      action: "notes.updated",
      entityType: "SESSION",
      entityId: step224.tutorSessionIds.tutorAFirst,
      actorId: tutorId,
      startedAtMs: tutorMutationStart,
    });

    const notesEvents = await fetchAuditItems(page, tenantSlug, {
      action: "notes.updated",
      entityType: "SESSION",
    });
    const notesEvent = notesEvents.find(
      (item) =>
        item.entityId === step224.tutorSessionIds.tutorAFirst &&
        item.actorId === tutorId &&
        Date.parse(item.occurredAt) >= tutorMutationStart - 5_000,
    );
    expect(notesEvent).toBeTruthy();
    const notesMetadata = JSON.stringify(notesEvent?.metadata ?? {});
    expect(notesMetadata).toContain("rowsUpdatedCount");
    expect(notesMetadata.toLowerCase()).not.toContain("internalnote");
    expect(notesMetadata).not.toContain(STEP226_INTERNAL_ONLY_SENTINEL);

    const recentAudit = await fetchAuditItems(page, tenantSlug, { search: "step226" });
    const serialized = JSON.stringify(recentAudit);
    expect(findSensitiveMatch(serialized)).toBeNull();
    expect(serialized).not.toContain(STEP226_INTERNAL_ONLY_SENTINEL);
  });
});
