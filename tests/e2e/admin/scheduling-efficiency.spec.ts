// Step 22.7 admin E2E coverage: preview/commit consistency, bulk cancel, roster sync, and cross-tenant blocking.
import { expect, test, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import * as pg from "pg";

import { loginAsAdmin } from "../helpers/auth";
import { buildTenantUrl } from "../helpers/parent-auth";
import { expectNoSensitivePayloadContent } from "../helpers/security";
import {
  resolveStep227Fixtures,
  STEP227_INTERNAL_ONLY_SENTINEL,
  STEP227_ZOOM_LINK,
} from "../helpers/step227";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

// The repo uses CJS-compatible `pg` imports in E2E scripts, so keep this constructor access minimal.
const PoolCtor = (pg as unknown as { Pool?: unknown }).Pool as {
  new (input: { connectionString: string }): {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
    end: () => Promise<void>;
  };
} | null;

let sharedPool: {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  end: () => Promise<void>;
} | null = null;

type SessionsGeneratePreviewResponse = {
  range: { from: string; to: string };
  wouldCreateCount: number;
  wouldSkipDuplicateCount: number;
  wouldConflictCount: number;
  duplicatesSummary: { count: number; sample: Array<{ date: string; reason: string }> };
  conflictsSummary: { count: number; sample: Array<{ date: string; reason: string }> };
  zoomLinkApplied: boolean;
};

type SessionsGenerateCommitResponse = {
  createdCount: number;
  skippedDuplicateCount: number;
  conflictCount: number;
  range: { from: string; to: string };
  createdSampleIds?: string[];
};

type SessionDetailResponse = {
  session?: {
    id: string;
    centerId: string;
    tutorId: string;
    startAt: string;
    zoomLink: string | null;
  };
};

type AttendanceDetailResponse = {
  roster: Array<{
    student: { id: string };
  }>;
};

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for Step 22.7 DB persistence assertions.");
  }
  return value;
}

function getPool() {
  if (!PoolCtor) {
    throw new Error("pg Pool constructor is unavailable in this environment.");
  }
  if (!sharedPool) {
    sharedPool = new PoolCtor({ connectionString: requireDatabaseUrl() });
  }
  return sharedPool;
}

async function readCanceledSessions(sessionIds: string[]) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT "id", "cancelReasonCode", "canceledAt"
     FROM "Session"
     WHERE "id" = ANY($1::text[])`,
    [sessionIds],
  );

  return result.rows as Array<{
    id: string;
    cancelReasonCode: string | null;
    canceledAt: string | null;
  }>;
}

async function fetchSessionDetail(page: Page, tenantSlug: string, sessionId: string) {
  const response = await page.request.get(buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}`));
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as SessionDetailResponse;
  expect(payload.session?.id).toBe(sessionId);
  expectNoSensitivePayloadContent(payload, {
    internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
  });

  return payload.session!;
}

async function fetchSessionRosterStudentIds(page: Page, tenantSlug: string, sessionId: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}/attendance`),
  );
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as AttendanceDetailResponse;
  expectNoSensitivePayloadContent(payload, {
    internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
  });

  return payload.roster.map((entry) => entry.student.id).sort();
}

function buildDeterministicGeneratorInput(input: {
  centerId: string;
  tutorId: string;
  studentId: string;
}) {
  const timezone = "America/Edmonton";
  const target = DateTime.now().setZone(timezone).plus({ days: 32 }).startOf("day");

  return {
    centerId: input.centerId,
    tutorId: input.tutorId,
    sessionType: "ONE_ON_ONE" as const,
    studentId: input.studentId,
    startDate: target.toISODate(),
    endDate: target.toISODate(),
    weekdays: [target.weekday],
    startTime: "07:35",
    endTime: "08:35",
    timezone,
    zoomLink: STEP227_ZOOM_LINK,
  };
}

async function openGeneratorAndPreview(
  page: Page,
  tenantSlug: string,
  payload: ReturnType<typeof buildDeterministicGeneratorInput>,
) {
  await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
  await expect(page.getByTestId("sessions-list-page")).toBeVisible();
  await page.getByTestId("sessions-generate-button").click();

  const modalHeading = page.getByRole("heading", {
    name: /generate recurring sessions/i,
  });
  await expect(modalHeading).toBeVisible();
  const modal = modalHeading.locator("..").locator("..");

  // Stable ids avoid locale-coupled selectors in staged EN/zh-CN runs.
  await modal.locator("#sessions-generator-center").selectOption(payload.centerId);
  await modal.locator("#sessions-generator-tutor").selectOption(payload.tutorId);
  await modal.locator("#sessions-generator-type").selectOption(payload.sessionType);
  await modal.locator("#sessions-generator-student").selectOption(payload.studentId);
  await modal.locator("#sessions-generator-start-date").fill(payload.startDate ?? "");
  await modal.locator("#sessions-generator-end-date").fill(payload.endDate ?? "");
  await modal.locator("#sessions-generator-start-time").fill(payload.startTime);
  await modal.locator("#sessions-generator-end-time").fill(payload.endTime);
  await modal.locator("#sessions-generator-zoom-link").fill(payload.zoomLink);
  await modal.getByRole("checkbox").nth(payload.weekdays[0] - 1).check();

  const previewResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/sessions/generate/preview") &&
      response.request().method() === "POST",
  );

  await modal.getByTestId("generator-preview-button").click();

  const previewResponse = await previewResponsePromise;
  expect(previewResponse.status()).toBe(200);
  const previewPayload = (await previewResponse.json()) as SessionsGeneratePreviewResponse;

  expect(previewPayload.wouldCreateCount).toBeGreaterThan(0);
  expect(previewPayload.wouldSkipDuplicateCount).toBeGreaterThanOrEqual(0);
  expect(previewPayload.wouldConflictCount).toBeGreaterThanOrEqual(0);
  expect(previewPayload.zoomLinkApplied).toBeTruthy();
  expectNoSensitivePayloadContent(previewPayload, {
    internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
  });

  // Preview must not echo the full URL value.
  expect(JSON.stringify(previewPayload).includes(STEP227_ZOOM_LINK)).toBeFalsy();

  // Response-level assertions above verify preview counts/warnings without relying on locale-specific copy.
  await expect(modal.getByTestId("generator-confirm-button")).toBeEnabled();

  return { modal, modalHeading, previewPayload };
}

test.afterAll(async () => {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = null;
  }
});

test.describe("[slow] [regression] [step22.7] Scheduling efficiency + ZoomLink", () => {
  test("Generator preview -> commit is consistent and stores zoom link", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const anchorSession = await fetchSessionDetail(page, fixtures.tenantSlug, fixtures.zoomSessionId);
    const payload = buildDeterministicGeneratorInput({
      centerId: anchorSession.centerId,
      tutorId: anchorSession.tutorId,
      studentId: fixtures.studentId,
    });

    const { modal, modalHeading, previewPayload } = await openGeneratorAndPreview(
      page,
      fixtures.tenantSlug,
      payload,
    );

    const commitResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/sessions/generate") &&
        !response.url().includes("/preview") &&
        response.request().method() === "POST",
    );

    await modal.getByTestId("generator-confirm-button").click();

    const commitResponse = await commitResponsePromise;
    expect(commitResponse.status()).toBe(200);

    const commitPayload = (await commitResponse.json()) as SessionsGenerateCommitResponse;
    expectNoSensitivePayloadContent(commitPayload, {
      internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
    });

    expect(commitPayload.createdCount).toBe(previewPayload.wouldCreateCount);
    expect(commitPayload.skippedDuplicateCount).toBe(previewPayload.wouldSkipDuplicateCount);
    expect(commitPayload.conflictCount).toBe(previewPayload.wouldConflictCount);

    await expect(modalHeading).toHaveCount(0);

    const sampleIds = commitPayload.createdSampleIds ?? [];
    expect(sampleIds.length).toBeGreaterThan(0);
    for (const createdSessionId of sampleIds.slice(0, 3)) {
      const detail = await fetchSessionDetail(page, fixtures.tenantSlug, createdSessionId);
      expect(detail.centerId).toBe(payload.centerId);
      expect(detail.tutorId).toBe(payload.tutorId);
      expect(detail.zoomLink).toBe(STEP227_ZOOM_LINK);
    }
  });

  test("Bulk cancel requires reason and persists reasonCode safely", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    // Server-side validation is the source of truth for required reason enforcement.
    const missingReasonResponse = await page.request.post(
      buildTenantApiPath(fixtures.tenantSlug, "/api/sessions/bulk-cancel"),
      {
        data: {
          sessionIds: [fixtures.bulkCancelSessionIds[0]],
        },
      },
    );
    expect(missingReasonResponse.status()).toBe(400);

    const cancelResponse = await page.request.post(
      buildTenantApiPath(fixtures.tenantSlug, "/api/sessions/bulk-cancel"),
      {
        data: {
          sessionIds: fixtures.bulkCancelSessionIds,
          reasonCode: "WEATHER",
        },
      },
    );
    expect(cancelResponse.status()).toBe(200);

    const cancelPayload = (await cancelResponse.json()) as {
      ok: boolean;
      canceledCount: number;
    };

    expect(cancelPayload.ok).toBeTruthy();
    expect(cancelPayload.canceledCount).toBe(fixtures.bulkCancelSessionIds.length);
    expectNoSensitivePayloadContent(cancelPayload, {
      internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
    });

    const canceledRows = await readCanceledSessions(fixtures.bulkCancelSessionIds);
    expect(canceledRows).toHaveLength(fixtures.bulkCancelSessionIds.length);
    for (const row of canceledRows) {
      expect(row.cancelReasonCode).toBe("WEATHER");
      expect(row.canceledAt).not.toBeNull();
    }

    // Audit metadata should remain aggregate/safe and omit large entity id dumps.
    const auditFilters = {
      from: DateTime.now().minus({ days: 2 }).toISODate(),
      to: DateTime.now().plus({ days: 1 }).toISODate(),
      action: "sessions.bulkCanceled",
    };
    const auditResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/audit?${new URLSearchParams({
          page: "1",
          pageSize: "25",
          sortField: "occurredAt",
          sortDir: "desc",
          filters: JSON.stringify(auditFilters),
        }).toString()}`,
      ),
    );

    expect(auditResponse.status()).toBe(200);
    const auditPayload = (await auditResponse.json()) as {
      items?: Array<{ action?: string; metadata?: Record<string, unknown> | null }>;
    };

    expectNoSensitivePayloadContent(auditPayload, {
      internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
    });

    const bulkCancelAudit = (auditPayload.items ?? []).find(
      (item) => item.action === "sessions.bulkCanceled",
    );
    expect(bulkCancelAudit).toBeTruthy();

    const metadataText = JSON.stringify(bulkCancelAudit?.metadata ?? {});
    expect(metadataText.includes(fixtures.bulkCancelSessionIds[0])).toBeFalsy();
  });

  test("Group roster sync entry point aligns future session snapshots", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const replaceStudentsResponse = await page.request.put(
      buildTenantApiPath(fixtures.tenantSlug, `/api/groups/${fixtures.groupId}/students`),
      {
        data: {
          studentIds: [fixtures.studentId, fixtures.missingEmailStudentId, fixtures.unlinkedStudentId],
        },
      },
    );
    expect(replaceStudentsResponse.status()).toBe(200);

    await page.goto(buildTenantPath(fixtures.tenantSlug, `/admin/groups/${fixtures.groupId}`));
    await expect(page.getByTestId("group-detail-page")).toBeVisible();

    await page.getByTestId("sync-group-future-sessions-button").click();
    const syncDialog = page.locator("div.fixed.inset-0");
    await expect(syncDialog).toBeVisible();

    const syncResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/groups/${fixtures.groupId}/sync-future-sessions`) &&
        response.request().method() === "POST",
    );

    await syncDialog.getByRole("button", { name: /sync/i }).click();

    const syncResponse = await syncResponsePromise;
    expect(syncResponse.status()).toBe(200);

    const syncPayload = (await syncResponse.json()) as {
      totalFutureSessions: number;
      sessionsUpdated: number;
      studentsAdded: number;
    };

    expect(syncPayload.sessionsUpdated).toBeGreaterThanOrEqual(2);
    expect(syncPayload.studentsAdded).toBeGreaterThanOrEqual(2);
    expectNoSensitivePayloadContent(syncPayload, {
      internalSentinel: STEP227_INTERNAL_ONLY_SENTINEL,
    });

    const expectedRosterIds = [
      fixtures.studentId,
      fixtures.missingEmailStudentId,
      fixtures.unlinkedStudentId,
    ].sort();

    for (const sessionId of fixtures.groupSessionIds.slice(0, 2)) {
      const rosterIds = await fetchSessionRosterStudentIds(page, fixtures.tenantSlug, sessionId);
      expect(rosterIds).toEqual(expectedRosterIds);
    }
  });

  test("Cross-tenant access is blocked for Step 22.7 admin endpoints", async ({ page }) => {
    const fixtures = resolveStep227Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    const anchorSession = await fetchSessionDetail(page, fixtures.tenantSlug, fixtures.zoomSessionId);
    const crossTenantGenerateInput = buildDeterministicGeneratorInput({
      centerId: anchorSession.centerId,
      tutorId: anchorSession.tutorId,
      studentId: fixtures.studentId,
    });

    const crossPreviewResponse = await page.request.post(
      buildTenantUrl(fixtures.secondaryTenantSlug, "/api/sessions/generate/preview"),
      { data: crossTenantGenerateInput },
    );
    expect([401, 403, 404]).toContain(crossPreviewResponse.status());

    const crossBulkCancelResponse = await page.request.post(
      buildTenantUrl(fixtures.secondaryTenantSlug, "/api/sessions/bulk-cancel"),
      {
        data: {
          sessionIds: fixtures.bulkCancelSessionIds,
          reasonCode: "WEATHER",
        },
      },
    );
    expect([401, 403, 404]).toContain(crossBulkCancelResponse.status());

    const crossSyncResponse = await page.request.post(
      buildTenantUrl(
        fixtures.secondaryTenantSlug,
        `/api/groups/${fixtures.groupId}/sync-future-sessions`,
      ),
    );
    expect([401, 403, 404]).toContain(crossSyncResponse.status());

    const crossSessionDetailResponse = await page.request.get(
      buildTenantUrl(fixtures.secondaryTenantSlug, `/api/sessions/${fixtures.zoomSessionId}`),
    );
    expect([401, 403, 404]).toContain(crossSessionDetailResponse.status());
  });
});
