// Server-only query helpers keep admin announcements list/report parsing consistent and tenant-safe.
import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import {
  parseAdminTableQuery,
  type ParsedAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import { REPORT_LIMITS } from "@/lib/reports/reportConfigs";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const announcementListFilterSchema = z
  .object({
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
    from: z.string().regex(DATE_ONLY_REGEX).optional(),
    to: z.string().regex(DATE_ONLY_REGEX).optional(),
    author: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const announcementEngagementFilterSchema = z
  .object({
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "ALL"]).optional(),
    from: z.string().regex(DATE_ONLY_REGEX).optional(),
    to: z.string().regex(DATE_ONLY_REGEX).optional(),
  })
  .strict();

export const ANNOUNCEMENT_LIST_SORT_FIELDS = [
  "createdAt",
  "publishedAt",
  "status",
] as const;

export const ANNOUNCEMENT_ENGAGEMENT_SORT_FIELDS = [
  "publishedAt",
  "createdAt",
  "status",
  "title",
] as const;

export type AnnouncementListSortField = (typeof ANNOUNCEMENT_LIST_SORT_FIELDS)[number];
export type AnnouncementEngagementSortField =
  (typeof ANNOUNCEMENT_ENGAGEMENT_SORT_FIELDS)[number];

export type AnnouncementListFilters = z.infer<typeof announcementListFilterSchema>;
export type AnnouncementEngagementFilters = z.infer<
  typeof announcementEngagementFilterSchema
>;

export type ParsedAnnouncementListQuery = ParsedAdminTableQuery<
  AnnouncementListFilters,
  AnnouncementListSortField
>;

export type ParsedAnnouncementEngagementQuery = ParsedAdminTableQuery<
  AnnouncementEngagementFilters,
  AnnouncementEngagementSortField
>;

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

function buildDateRangeClause(start?: Date, endExclusive?: Date) {
  if (!start && !endExclusive) return undefined;
  return {
    ...(start ? { gte: start } : {}),
    ...(endExclusive ? { lt: endExclusive } : {}),
  };
}

export function parseAnnouncementListQuery(searchParams: URLSearchParams) {
  return parseAdminTableQuery(searchParams, {
    filterSchema: announcementListFilterSchema,
    allowedSortFields: ANNOUNCEMENT_LIST_SORT_FIELDS,
    defaultSort: { field: "createdAt", dir: "desc" },
    defaultPageSize: REPORT_LIMITS.defaultPageSize,
    maxPageSize: REPORT_LIMITS.maxPageSize,
  });
}

export function parseAnnouncementEngagementQuery(searchParams: URLSearchParams) {
  return parseAdminTableQuery(searchParams, {
    filterSchema: announcementEngagementFilterSchema,
    allowedSortFields: ANNOUNCEMENT_ENGAGEMENT_SORT_FIELDS,
    defaultSort: { field: "publishedAt", dir: "desc" },
    defaultPageSize: REPORT_LIMITS.defaultPageSize,
    maxPageSize: REPORT_LIMITS.maxPageSize,
  });
}

export function buildAnnouncementListWhere(args: {
  tenantId: string;
  search?: string;
  filters: AnnouncementListFilters;
}) {
  const { tenantId, search, filters } = args;
  const andFilters: Prisma.AnnouncementWhereInput[] = [{ tenantId }];

  if (search) {
    // Search is title-only in v1 to keep content querying and data exposure minimal.
    andFilters.push({
      title: {
        contains: search,
        mode: "insensitive",
      },
    });
  }

  if (filters.status) {
    andFilters.push({ status: filters.status });
  }

  if (filters.author) {
    andFilters.push({
      createdByUser: {
        OR: [
          {
            name: {
              contains: filters.author,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: filters.author,
              mode: "insensitive",
            },
          },
        ],
      },
    });
  }

  const start = parseDateStart(filters.from);
  const endExclusive = parseDateEndExclusive(filters.to);
  const dateRange = buildDateRangeClause(start, endExclusive);
  if (dateRange) {
    if (filters.status === "DRAFT") {
      andFilters.push({ createdAt: dateRange });
    } else if (filters.status === "PUBLISHED" || filters.status === "ARCHIVED") {
      andFilters.push({ publishedAt: dateRange });
    } else {
      // Drafts use createdAt; published/archive rows use publishedAt for timeline filtering.
      andFilters.push({
        OR: [
          {
            status: "DRAFT",
            createdAt: dateRange,
          },
          {
            status: {
              in: ["PUBLISHED", "ARCHIVED"],
            },
            publishedAt: dateRange,
          },
        ],
      });
    }
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

export function buildAnnouncementEngagementWhere(args: {
  tenantId: string;
  search?: string;
  filters: AnnouncementEngagementFilters;
}) {
  const { tenantId, search, filters } = args;
  const andFilters: Prisma.AnnouncementWhereInput[] = [{ tenantId }];

  if (search) {
    // Engagement search is title-only for least-privilege query behavior.
    andFilters.push({
      title: {
        contains: search,
        mode: "insensitive",
      },
    });
  }

  const status = filters.status && filters.status !== "ALL" ? filters.status : "PUBLISHED";
  if (status) {
    andFilters.push({ status });
  }

  const start = parseDateStart(filters.from);
  const endExclusive = parseDateEndExclusive(filters.to);
  const publishedRange = buildDateRangeClause(start, endExclusive);
  if (publishedRange) {
    andFilters.push({
      publishedAt: publishedRange,
    });
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

export function buildAnnouncementListOrderBy(
  field: AnnouncementListSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.AnnouncementOrderByWithRelationInput> {
  if (field === "publishedAt") {
    return [{ publishedAt: dir }, { createdAt: "desc" }, { id: "asc" }];
  }
  if (field === "status") {
    return [{ status: dir }, { createdAt: "desc" }, { id: "asc" }];
  }
  return [{ createdAt: dir }, { id: "asc" }];
}

export function buildAnnouncementEngagementOrderBy(
  field: AnnouncementEngagementSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.AnnouncementOrderByWithRelationInput> {
  if (field === "createdAt") {
    return [{ createdAt: dir }, { id: "asc" }];
  }
  if (field === "status") {
    return [{ status: dir }, { publishedAt: "desc" }, { id: "asc" }];
  }
  if (field === "title") {
    return [{ title: dir }, { publishedAt: "desc" }, { id: "asc" }];
  }
  return [{ publishedAt: dir }, { createdAt: "desc" }, { id: "asc" }];
}

export function toPageInfo(input: {
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
