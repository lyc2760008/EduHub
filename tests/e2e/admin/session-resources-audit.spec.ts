// Step 22.9 audit coverage verifies create/update/delete/bulk events and safe metadata redaction.
import { expect, test, type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { AUDIT_ACTIONS } from "../../../src/lib/audit/constants";
import { loginAsAdmin } from "../helpers/auth";
import { findSessionResourcesLeakMatch } from "../helpers/sessionResources";
import {
  STEP229_INTERNAL_LEAK_SENTINEL,
  resolveStep229Fixtures,
} from "../helpers/step229";
import { buildTenantApiPath } from "../helpers/tenant";

type AuditListItem = {
  occurredAt: string;
  action: string;
  actorId: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
};

type AuditListResponse = {
  items: AuditListItem[];
};

type MeResponse = {
  user: { id: string };
};

function buildAuditQuery(action: string, from: string, to: string) {
  return new URLSearchParams({
    page: "1",
    pageSize: "100",
    sortField: "occurredAt",
    sortDir: "desc",
    filters: JSON.stringify({
      from,
      to,
      action,
    }),
  }).toString();
}

async function fetchCurrentUserId(page: Page, tenantSlug: string) {
  const meResponse = await page.request.get(buildTenantApiPath(tenantSlug, "/api/me"));
  expect(meResponse.status()).toBe(200);
  const mePayload = (await meResponse.json()) as MeResponse;
  return mePayload.user.id;
}

async function fetchAuditItems(
  page: Page,
  tenantSlug: string,
  action: string,
  from: string,
  to: string,
) {
  const response = await page.request.get(
    buildTenantApiPath(
      tenantSlug,
      `/api/admin/audit?${buildAuditQuery(action, from, to)}`,
    ),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as AuditListResponse;
  return payload.items ?? [];
}

async function waitForAuditEvent(
  page: Page,
  input: {
    tenantSlug: string;
    action: string;
    entityId: string;
    actorId: string;
    startedAtMs: number;
    from: string;
    to: string;
  },
) {
  await expect
    .poll(async () => {
      const items = await fetchAuditItems(
        page,
        input.tenantSlug,
        input.action,
        input.from,
        input.to,
      );
      const matched = items.find((item) => {
        const occurredAt = Date.parse(item.occurredAt);
        return (
          item.entityId === input.entityId &&
          item.actorId === input.actorId &&
          occurredAt >= input.startedAtMs - 5_000
        );
      });
      return matched ? JSON.stringify(matched) : "";
    })
    .not.toBe("");

  const items = await fetchAuditItems(
    page,
    input.tenantSlug,
    input.action,
    input.from,
    input.to,
  );
  const event = items.find(
    (item) => item.entityId === input.entityId && item.actorId === input.actorId,
  );
  if (!event) {
    throw new Error(`Expected audit event ${input.action} for entity ${input.entityId}.`);
  }
  return event;
}

test.describe("[regression] Step 22.9 session resource audit coverage", () => {
  test("Create/update/delete/bulk resource actions emit audit events with safe metadata", async ({
    page,
  }) => {
    const fixtures = resolveStep229Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);
    const actorId = await fetchCurrentUserId(page, fixtures.tenantSlug);
    const startedAtMs = Date.now();
    const from = DateTime.utc().minus({ days: 2 }).toISODate() || "2026-01-01";
    const to = DateTime.utc().plus({ days: 2 }).toISODate() || "2026-12-31";

    const createResponse = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/sessions/${fixtures.sessionIds.tutorAFirst}/resources`,
      ),
      {
        data: {
          title: "E2E_STEP229_AUDIT_CREATE",
          type: "VIDEO",
          url: "https://example.com/e2e-step229-audit-create",
        },
      },
    );
    expect(createResponse.status()).toBe(201);
    const createdPayload = (await createResponse.json()) as {
      item: { id: string; sessionId: string };
    };
    const createdResourceId = createdPayload.item.id;

    const updateResponse = await page.request.patch(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/resources/${createdResourceId}`,
      ),
      {
        data: {
          title: "E2E_STEP229_AUDIT_UPDATED",
          type: "WORKSHEET",
          url: "https://example.com/e2e-step229-audit-updated",
        },
      },
    );
    expect(updateResponse.status()).toBe(200);

    const deleteResponse = await page.request.delete(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/resources/${createdResourceId}`,
      ),
    );
    expect(deleteResponse.status()).toBe(200);

    const bulkResponse = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        "/api/admin/sessions/resources/bulk-apply",
      ),
      {
        data: {
          // Keep S2 untouched here so bulk-report tests can assert its pre-apply missing state.
          sessionIds: [fixtures.sessionIds.tutorAFirst, fixtures.sessionIds.tutorBOther],
          resources: [
            {
              title: "E2E_STEP229_AUDIT_BULK",
              type: "OTHER",
              url: "https://example.com/e2e-step229-audit-bulk",
            },
          ],
        },
      },
    );
    expect(bulkResponse.status()).toBe(200);

    const createdEvent = await waitForAuditEvent(page, {
      tenantSlug: fixtures.tenantSlug,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_CREATED,
      entityId: createdResourceId,
      actorId,
      startedAtMs,
      from,
      to,
    });
    expect(createdEvent.metadata).toEqual(
      expect.objectContaining({
        sessionId: fixtures.sessionIds.tutorAFirst,
        type: "VIDEO",
      }),
    );

    const updatedEvent = await waitForAuditEvent(page, {
      tenantSlug: fixtures.tenantSlug,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_UPDATED,
      entityId: createdResourceId,
      actorId,
      startedAtMs,
      from,
      to,
    });
    expect(updatedEvent.metadata).toEqual(
      expect.objectContaining({
        resourceId: createdResourceId,
        sessionId: fixtures.sessionIds.tutorAFirst,
      }),
    );

    const deletedEvent = await waitForAuditEvent(page, {
      tenantSlug: fixtures.tenantSlug,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_DELETED,
      entityId: createdResourceId,
      actorId,
      startedAtMs,
      from,
      to,
    });
    expect(deletedEvent.metadata).toEqual(
      expect.objectContaining({
        resourceId: createdResourceId,
        sessionId: fixtures.sessionIds.tutorAFirst,
      }),
    );

    const bulkEvent = await waitForAuditEvent(page, {
      tenantSlug: fixtures.tenantSlug,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_BULK_APPLIED,
      entityId: "bulk",
      actorId,
      startedAtMs,
      from,
      to,
    });
    expect(bulkEvent.metadata).toEqual(
      expect.objectContaining({
        sessionCount: 2,
        resourcesAttempted: 2,
      }),
    );

    for (const event of [createdEvent, updatedEvent, deletedEvent, bulkEvent]) {
      const serialized = JSON.stringify(event);
      expect(
        findSessionResourcesLeakMatch(serialized, {
          forbiddenSentinel: STEP229_INTERNAL_LEAK_SENTINEL,
        }),
      ).toBeNull();
      // Step 22.9 audit safety contract: event metadata must never contain full resource URLs.
      expect(serialized.includes("http://")).toBeFalsy();
      expect(serialized.includes("https://")).toBeFalsy();
    }
  });
});
