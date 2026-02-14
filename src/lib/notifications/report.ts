// Server-only notification report helpers provide aggregate-only engagement metrics.
import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { NotificationAudienceRole, NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  parseAdminTableQuery,
  type ParsedAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import { REPORT_LIMITS, type ReportSortDir } from "@/lib/reports/reportConfigs";
import { z } from "zod";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const notificationsEngagementFilterSchema = z
  .object({
    type: z.enum(["ALL", "ANNOUNCEMENT", "HOMEWORK", "REQUEST"]).optional(),
    audienceRole: z.enum(["ALL", "PARENT", "TUTOR", "ADMIN"]).optional(),
    readStatus: z.enum(["ALL", "READ", "UNREAD"]).optional(),
    from: z.string().regex(DATE_ONLY_REGEX).optional(),
    to: z.string().regex(DATE_ONLY_REGEX).optional(),
  })
  .strict();

const SORT_FIELDS = [
  "type",
  "audienceRole",
  "sentCount",
  "readCount",
  "readRate",
] as const;

type SortField = (typeof SORT_FIELDS)[number];

export type NotificationsEngagementFilters = z.infer<
  typeof notificationsEngagementFilterSchema
>;

export type ParsedNotificationsEngagementQuery = ParsedAdminTableQuery<
  NotificationsEngagementFilters,
  SortField
>;

export type NotificationsEngagementRow = {
  type: NotificationType;
  audienceRole: NotificationAudienceRole;
  sentCount: number;
  readCount: number;
  readRate: number;
  avgTimeToReadHours: number | null;
};

type NotificationsEngagementSummary = {
  totalNotificationsCreated: number;
  totalRecipients: number;
  totalRead: number;
  readRate: number;
};

function parseDateStart(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function parseDateEndExclusive(value?: string) {
  const start = parseDateStart(value);
  if (!start) return undefined;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function toNotificationWhere(
  tenantId: string,
  filters: NotificationsEngagementFilters,
): Prisma.NotificationWhereInput {
  const createdAtStart = parseDateStart(filters.from);
  const createdAtEndExclusive = parseDateEndExclusive(filters.to);
  return {
    tenantId,
    ...(filters.type && filters.type !== "ALL"
      ? { type: filters.type as NotificationType }
      : {}),
    ...(filters.audienceRole && filters.audienceRole !== "ALL"
      ? { audienceRole: filters.audienceRole as NotificationAudienceRole }
      : {}),
    ...(createdAtStart || createdAtEndExclusive
      ? {
          createdAt: {
            ...(createdAtStart ? { gte: createdAtStart } : {}),
            ...(createdAtEndExclusive ? { lt: createdAtEndExclusive } : {}),
          },
        }
      : {}),
  };
}

function toRecipientWhere(
  tenantId: string,
  filters: NotificationsEngagementFilters,
): Prisma.NotificationRecipientWhereInput {
  return {
    tenantId,
    ...(filters.readStatus === "READ"
      ? { readAt: { not: null } }
      : filters.readStatus === "UNREAD"
        ? { readAt: null }
        : {}),
    notification: toNotificationWhere(tenantId, filters),
  };
}

function compareRows(
  left: NotificationsEngagementRow,
  right: NotificationsEngagementRow,
  sortField: SortField,
  sortDir: ReportSortDir,
) {
  const direction = sortDir === "asc" ? 1 : -1;
  let compareValue = 0;

  if (sortField === "type") {
    compareValue = left.type.localeCompare(right.type);
  } else if (sortField === "audienceRole") {
    compareValue = left.audienceRole.localeCompare(right.audienceRole);
  } else if (sortField === "sentCount") {
    compareValue = left.sentCount - right.sentCount;
  } else if (sortField === "readCount") {
    compareValue = left.readCount - right.readCount;
  } else if (sortField === "readRate") {
    compareValue = left.readRate - right.readRate;
  }

  if (compareValue === 0) {
    compareValue =
      left.type.localeCompare(right.type) ||
      left.audienceRole.localeCompare(right.audienceRole);
  }
  return compareValue * direction;
}

function filterRowsBySearch(
  rows: NotificationsEngagementRow[],
  search: string | undefined,
) {
  const normalizedSearch = search?.trim().toLowerCase() ?? "";
  if (!normalizedSearch) return rows;

  return rows.filter((row) => {
    const haystack = `${row.type} ${row.audienceRole}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });
}

function toPageInfo(input: {
  totalCount: number;
  page: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(input.totalCount / input.pageSize));
  return {
    page: input.page,
    pageSize: input.pageSize,
    totalCount: input.totalCount,
    totalPages,
    hasNextPage: input.page < totalPages,
    hasPreviousPage: input.page > 1,
  };
}

export function parseNotificationsEngagementQuery(searchParams: URLSearchParams) {
  return parseAdminTableQuery(searchParams, {
    filterSchema: notificationsEngagementFilterSchema,
    allowedSortFields: SORT_FIELDS,
    defaultSort: { field: "sentCount", dir: "desc" },
    defaultPageSize: REPORT_LIMITS.defaultPageSize,
    maxPageSize: REPORT_LIMITS.maxPageSize,
  });
}

type AggregatedResult = {
  rows: NotificationsEngagementRow[];
  summary: NotificationsEngagementSummary;
};

async function aggregateNotificationsEngagement(args: {
  tenantId: string;
  filters: NotificationsEngagementFilters;
}) {
  const recipientRows = await prisma.notificationRecipient.findMany({
    where: toRecipientWhere(args.tenantId, args.filters),
    select: {
      readAt: true,
      notification: {
        select: {
          id: true,
          createdAt: true,
          type: true,
          audienceRole: true,
        },
      },
    },
  });

  const metricsByGroup = new Map<
    string,
    {
      type: NotificationType;
      audienceRole: NotificationAudienceRole;
      sentCount: number;
      readCount: number;
      readDelayHoursSum: number;
      readDelayCount: number;
    }
  >();
  const distinctNotificationIds = new Set<string>();

  for (const row of recipientRows) {
    const groupKey = `${row.notification.type}::${row.notification.audienceRole}`;
    if (!metricsByGroup.has(groupKey)) {
      metricsByGroup.set(groupKey, {
        type: row.notification.type,
        audienceRole: row.notification.audienceRole,
        sentCount: 0,
        readCount: 0,
        readDelayHoursSum: 0,
        readDelayCount: 0,
      });
    }
    const metrics = metricsByGroup.get(groupKey);
    if (!metrics) continue;

    metrics.sentCount += 1;
    distinctNotificationIds.add(row.notification.id);
    if (row.readAt) {
      metrics.readCount += 1;
      const deltaMs =
        row.readAt.getTime() - row.notification.createdAt.getTime();
      if (deltaMs >= 0) {
        metrics.readDelayHoursSum += deltaMs / (1000 * 60 * 60);
        metrics.readDelayCount += 1;
      }
    }
  }

  const rows: NotificationsEngagementRow[] = Array.from(
    metricsByGroup.values(),
  ).map((metrics) => ({
    type: metrics.type,
    audienceRole: metrics.audienceRole,
    sentCount: metrics.sentCount,
    readCount: metrics.readCount,
    readRate:
      metrics.sentCount > 0
        ? Number(((metrics.readCount / metrics.sentCount) * 100).toFixed(2))
        : 0,
    avgTimeToReadHours:
      metrics.readDelayCount > 0
        ? Number((metrics.readDelayHoursSum / metrics.readDelayCount).toFixed(2))
        : null,
  }));

  const totalRecipients = recipientRows.length;
  const totalRead = recipientRows.filter((row) => row.readAt !== null).length;
  const summary: NotificationsEngagementSummary = {
    totalNotificationsCreated: distinctNotificationIds.size,
    totalRecipients,
    totalRead,
    readRate:
      totalRecipients > 0
        ? Number(((totalRead / totalRecipients) * 100).toFixed(2))
        : 0,
  };

  return {
    rows,
    summary,
  } satisfies AggregatedResult;
}

export async function queryNotificationsEngagement(args: {
  tenantId: string;
  parsedQuery: ParsedNotificationsEngagementQuery;
}) {
  const aggregated = await aggregateNotificationsEngagement({
    tenantId: args.tenantId,
    filters: args.parsedQuery.filters,
  });
  const searchedRows = filterRowsBySearch(
    aggregated.rows,
    args.parsedQuery.search,
  );
  const sortedRows = [...searchedRows].sort((left, right) =>
    compareRows(
      left,
      right,
      args.parsedQuery.sort.field,
      args.parsedQuery.sort.dir,
    ),
  );

  const start = (args.parsedQuery.page - 1) * args.parsedQuery.pageSize;
  const end = start + args.parsedQuery.pageSize;
  const pageRows = sortedRows.slice(start, end);

  return {
    rows: pageRows,
    pageInfo: toPageInfo({
      totalCount: sortedRows.length,
      page: args.parsedQuery.page,
      pageSize: args.parsedQuery.pageSize,
    }),
    sort: args.parsedQuery.sort,
    appliedFilters: args.parsedQuery.appliedFilters,
    summary: aggregated.summary,
  };
}

export async function queryNotificationsEngagementForExport(args: {
  tenantId: string;
  parsedQuery: ParsedNotificationsEngagementQuery;
}) {
  const aggregated = await aggregateNotificationsEngagement({
    tenantId: args.tenantId,
    filters: args.parsedQuery.filters,
  });
  const searchedRows = filterRowsBySearch(
    aggregated.rows,
    args.parsedQuery.search,
  );
  const sortedRows = [...searchedRows].sort((left, right) =>
    compareRows(
      left,
      right,
      args.parsedQuery.sort.field,
      args.parsedQuery.sort.dir,
    ),
  );

  return {
    rows: sortedRows,
    totalCount: sortedRows.length,
    sort: args.parsedQuery.sort,
    appliedFilters: args.parsedQuery.appliedFilters,
    summary: aggregated.summary,
  };
}
