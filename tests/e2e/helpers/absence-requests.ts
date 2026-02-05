// Helpers for staff absence request E2E setup (create, resolve, and attendance reset).
import { expect, type Page } from "@playwright/test";

import { buildPortalApiPath } from "./portal";
import { buildTenantApiPath } from "./tenant";

export type PortalRequestItem = {
  id: string;
  sessionId: string;
  studentId: string;
  status: string;
  reasonCode?: string;
  message?: string | null;
};

type PortalRequestsResponse = {
  items: PortalRequestItem[];
};

type EnsureRequestInput = {
  tenantSlug: string;
  sessionId: string;
  studentId: string;
  reasonCode: string;
  message: string;
};

function isTransientNetworkError(error: unknown) {
  // Treat connection resets as transient so request helpers can retry once.
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|socket hang up|ECONNREFUSED/i.test(error.message);
}

async function postWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page["request"]["post"]>[1],
  attempts = 2,
) {
  // Retry a single time on transient network errors seen during E2E runs.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.request.post(url, options);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function fetchPortalRequests(page: Page, tenantSlug: string) {
  // Portal requests fetch must run under a parent session.
  const response = await page.request.get(
    buildPortalApiPath(tenantSlug, "/requests?take=100&skip=0"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as PortalRequestsResponse;
  return payload.items ?? [];
}

export async function ensurePortalAbsenceRequest(
  page: Page,
  input: EnsureRequestInput,
) {
  // Ensure a single request exists for the session/student without duplicating rows.
  const existing = (await fetchPortalRequests(page, input.tenantSlug)).find(
    (item) =>
      item.sessionId === input.sessionId && item.studentId === input.studentId,
  );
  if (existing) return existing;

  const createResponse = await postWithRetry(
    page,
    buildPortalApiPath(input.tenantSlug, "/requests"),
    {
      data: {
        sessionId: input.sessionId,
        studentId: input.studentId,
        reasonCode: input.reasonCode,
        message: input.message,
      },
    },
  );

  if (createResponse.status() === 201) {
    const payload = (await createResponse.json()) as {
      request?: PortalRequestItem;
    };
    if (!payload.request) {
      throw new Error("Expected request payload after portal absence create.");
    }
    return payload.request;
  }

  if (createResponse.status() === 409) {
    // Conflict means another test created the request; re-read the list.
    const refreshed = await fetchPortalRequests(page, input.tenantSlug);
    const request = refreshed.find(
      (item) =>
        item.sessionId === input.sessionId &&
        item.studentId === input.studentId,
    );
    if (!request) {
      throw new Error(
        "Expected to find an existing absence request after 409 response.",
      );
    }
    return request;
  }

  throw new Error(
    `Unexpected create status ${createResponse.status()} for absence request.`,
  );
}

export async function withdrawPortalAbsenceRequest(
  page: Page,
  tenantSlug: string,
  requestId: string,
) {
  // Withdraw uses the portal endpoint to preserve parent-scoped behavior.
  const response = await postWithRetry(
    page,
    buildPortalApiPath(tenantSlug, `/requests/${requestId}/withdraw`),
    { data: {} },
  );
  return response;
}

export async function resubmitPortalAbsenceRequest(
  page: Page,
  input: {
    tenantSlug: string;
    requestId: string;
    reasonCode: string;
    message: string;
  },
) {
  // Resubmit uses the portal endpoint so the request stays linked to the parent.
  const response = await postWithRetry(
    page,
    buildPortalApiPath(input.tenantSlug, `/requests/${input.requestId}/resubmit`),
    {
      data: {
        reasonCode: input.reasonCode,
        message: input.message,
      },
    },
  );
  return response;
}

export async function resolveAbsenceRequest(
  page: Page,
  tenantSlug: string,
  requestId: string,
  status: "APPROVED" | "DECLINED",
) {
  // Admin resolve uses the staff request endpoint directly for deterministic setup.
  const resolveResponse = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, `/api/requests/${requestId}/resolve`),
    { data: { status } },
  );
  if (![200, 409].includes(resolveResponse.status())) {
    throw new Error(
      `Unexpected resolve status ${resolveResponse.status()} for absence request.`,
    );
  }
}

export async function clearAttendanceForStudent(
  page: Page,
  tenantSlug: string,
  sessionId: string,
  studentId: string,
) {
  // Clear attendance so auto-assist prefill can be validated without auto-saving.
  const response = await page.request.put(
    buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}/attendance`),
    { data: { items: [{ studentId, status: null }] } },
  );
  if (![200, 400].includes(response.status())) {
    throw new Error(
      `Unexpected attendance clear status ${response.status()} for session ${sessionId}.`,
    );
  }
}
