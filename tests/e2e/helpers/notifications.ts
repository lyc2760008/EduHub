// Step 23.3 helpers centralize notification API polling, CSV parsing, and leak checks for E2E specs.
import { expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

import { findSensitiveMatch } from "./audit";
import { buildTenantApiPath } from "./tenant";

type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

type NotificationInboxItem = {
  id: string;
  type: "ANNOUNCEMENT" | "HOMEWORK" | "REQUEST";
  title: string;
  bodyPreview: string | null;
  readAt: string | null;
  targetType: string | null;
  targetId: string | null;
  targetUrl: string | null;
};

type NotificationInboxResponse = {
  items: NotificationInboxItem[];
  pageInfo?: {
    nextCursor?: string | null;
  };
};

type NotificationUnreadCountResponse = {
  unreadCount: number;
  countsByType?: {
    announcement?: number;
    homework?: number;
    request?: number;
  };
};

function normalizeCsvCell(value: unknown) {
  // Normalize BOM and wrapper quotes so CSV assertions stay stable across runtimes.
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1");
}

export function parseNotificationsCsv(csvContent: string): ParsedCsv {
  // XLSX parser safely handles quoted commas/newlines in CSV exports.
  const workbook = XLSX.read(csvContent, { type: "string", raw: false, dense: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return { headers: [], rows: [] };
  }

  const rowsAsArrays = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });
  const headers =
    rowsAsArrays.length > 0
      ? rowsAsArrays[0].map((entry) => normalizeCsvCell(entry))
      : [];
  const rows = rowsAsArrays
    .slice(1)
    .map((rowValues) => {
      const row: Record<string, string> = {};
      for (let index = 0; index < headers.length; index += 1) {
        const key = headers[index];
        if (!key) continue;
        row[key] = normalizeCsvCell(rowValues[index] ?? "");
      }
      return row;
    })
    .filter((row) => Object.keys(row).length > 0);

  return { headers, rows };
}

export function findNotificationsLeakMatch(
  value: string,
  options?: { forbiddenSentinel?: string },
) {
  const sensitiveMatch = findSensitiveMatch(value);
  if (sensitiveMatch) return sensitiveMatch;
  if (options?.forbiddenSentinel && value.includes(options.forbiddenSentinel)) {
    return "internal-sentinel";
  }
  return null;
}

type PortalNotificationsQuery = {
  status?: "all" | "unread";
  type?: "all" | "announcement" | "homework" | "request";
  cursor?: string;
  limit?: number;
};

export async function fetchPortalNotifications(
  page: Page,
  tenantSlug: string,
  query: PortalNotificationsQuery = {},
) {
  const params = new URLSearchParams();
  params.set("status", query.status ?? "all");
  if (query.type) params.set("type", query.type);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));

  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, `/api/portal/notifications?${params.toString()}`),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as NotificationInboxResponse;
}

export async function fetchUnreadCounts(
  page: Page,
  tenantSlug: string,
  scope: "portal" | "admin",
) {
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, `/api/${scope}/notifications/unread-count`),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as NotificationUnreadCountResponse;
}

export async function waitForNotification(args: {
  page: Page;
  tenantSlug: string;
  type: "ANNOUNCEMENT" | "HOMEWORK" | "REQUEST";
  targetId?: string;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = args.timeoutMs ?? 10_000;
  const intervalMs = args.intervalMs ?? 350;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    // Trigger-created rows can land beyond page 1 when seeded fixtures are dense, so scan multiple cursored pages.
    let cursor: string | undefined;
    let scannedCount = 0;
    while (scannedCount < 500) {
      const payload = await fetchPortalNotifications(args.page, args.tenantSlug, {
        status: "all",
        limit: 50,
        cursor,
      });
      const match = payload.items.find(
        (item) =>
          item.type === args.type &&
          (!args.targetId || item.targetId === args.targetId),
      );
      if (match) {
        return match;
      }
      scannedCount += payload.items.length;
      cursor = payload.pageInfo?.nextCursor ?? undefined;
      if (!cursor || payload.items.length === 0) {
        break;
      }
    }
    await args.page.waitForTimeout(intervalMs);
  }

  throw new Error(
    `Timed out waiting for ${args.type} notification (targetId=${args.targetId ?? "any"}).`,
  );
}

export function parseFiltersFromUrl(page: Page) {
  const filtersRaw = new URL(page.url()).searchParams.get("filters");
  if (!filtersRaw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(filtersRaw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
