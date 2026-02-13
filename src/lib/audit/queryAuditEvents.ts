// Server-only audit query builder keeps list/detail/export filters consistent and tenant-safe.
import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseAdminTableQuery,
  type ParsedAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import { REPORT_LIMITS } from "@/lib/reports/reportConfigs";

export const AUDIT_EXPORT_MAX_ROWS = 10_000;

const AUDIT_SORT_FIELDS = [
  "occurredAt",
  "action",
  "actorDisplay",
  "entityType",
  "result",
] as const;

type AuditSortField = (typeof AUDIT_SORT_FIELDS)[number];

type AuditActionType =
  | "auth"
  | "sessions"
  | "people"
  | "requests"
  | "catalog"
  | "system";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const auditFilterSchema = z
  .object({
    from: z.string().regex(DATE_ONLY_REGEX).optional(),
    to: z.string().regex(DATE_ONLY_REGEX).optional(),
    actor: z.string().trim().min(1).max(120).optional(),
    actionType: z
      .enum(["auth", "sessions", "people", "requests", "catalog", "system"])
      .optional(),
    action: z
      .union([
        z.string().trim().min(1).max(120),
        z.array(z.string().trim().min(1).max(120)).min(1).max(20),
      ])
      .optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    result: z.enum(["SUCCESS", "FAILURE"]).optional(),
  })
  .strict();

export const AUDIT_LIST_SELECT = {
  id: true,
  tenantId: true,
  occurredAt: true,
  actorType: true,
  actorId: true,
  actorDisplay: true,
  action: true,
  entityType: true,
  entityId: true,
  result: true,
  correlationId: true,
  metadata: true,
  ip: true,
  userAgent: true,
} as const;

export type AuditEventQueryRow = Prisma.AuditEventGetPayload<{
  select: typeof AUDIT_LIST_SELECT;
}>;

type AuditFilters = z.infer<typeof auditFilterSchema>;
type AuditParsedQuery = ParsedAdminTableQuery<AuditFilters, AuditSortField>;

type QueryAuditEventsArgs = {
  tenantId: string;
  parsedQuery: AuditParsedQuery;
};

type QueryAuditEventsPageResult = {
  items: AuditEventQueryRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: {
    field: AuditSortField;
    dir: "asc" | "desc";
  };
  appliedFilters: Record<string, unknown>;
};

type QueryAuditEventsExportResult = {
  items: AuditEventQueryRow[];
  totalCount: number;
  sort: {
    field: AuditSortField;
    dir: "asc" | "desc";
  };
  appliedFilters: Record<string, unknown>;
  truncated: boolean;
};

const ACTION_TYPE_PREFIX_MAP: Record<AuditActionType, string[]> = {
  // Auth actions include legacy parent login/access-code events.
  auth: [
    "parent.login.",
    "parent.auth.",
    "PARENT_LOGIN",
    "PARENT_ACCESS_CODE",
  ],
  // Session actions include attendance/notes and scheduler-generated updates.
  sessions: [
    "sessions.",
    "session.",
    "attendance.",
    "notes.",
    "group.futureSessions.",
    "ATTENDANCE_",
  ],
  people: [
    "parent.invite.",
    "parent.",
    "student.",
    "staff.",
    "PARENT_INVITE",
    "STUDENT_",
  ],
  requests: ["request.", "requests.", "ABSENCE_REQUEST"],
  catalog: ["catalog.", "program.", "subject.", "level."],
  system: ["system.", "report.", "REPORT_"],
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

function toActionArray(value: AuditFilters["action"]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function buildActionTypeWhere(actionType: AuditActionType) {
  const prefixes = ACTION_TYPE_PREFIX_MAP[actionType];
  return {
    OR: prefixes.map((prefix) => ({
      action: {
        startsWith: prefix,
        mode: "insensitive" as const,
      },
    })),
  } satisfies Prisma.AuditEventWhereInput;
}

function buildAuditWhere(args: {
  tenantId: string;
  search?: string;
  filters: AuditFilters;
}) {
  const { tenantId, search, filters } = args;
  const andFilters: Prisma.AuditEventWhereInput[] = [{ tenantId }];

  if (search) {
    // Privacy-by-design: search is intentionally scoped to explicit audit columns, never raw metadata.
    andFilters.push({
      OR: [
        { actorDisplay: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { entityType: { contains: search, mode: "insensitive" } },
        { entityId: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (filters.actor) {
    andFilters.push({
      actorDisplay: { contains: filters.actor, mode: "insensitive" },
    });
  }

  if (filters.actionType) {
    andFilters.push(buildActionTypeWhere(filters.actionType));
  }

  const actions = toActionArray(filters.action);
  if (actions.length) {
    andFilters.push({
      action: {
        in: actions,
      },
    });
  }

  if (filters.entityType) {
    andFilters.push({
      entityType: {
        equals: filters.entityType,
        mode: "insensitive",
      },
    });
  }

  if (filters.result) {
    andFilters.push({ result: filters.result });
  }

  const start = parseDateStart(filters.from);
  const endExclusive = parseDateEndExclusive(filters.to);
  if (start || endExclusive) {
    andFilters.push({
      occurredAt: {
        ...(start ? { gte: start } : {}),
        ...(endExclusive ? { lt: endExclusive } : {}),
      },
    });
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

function buildAuditOrderBy(field: AuditSortField, dir: "asc" | "desc") {
  // Deterministic ordering keeps pagination stable even when many rows share timestamps.
  if (field === "action") {
    return [{ action: dir }, { occurredAt: "desc" }, { id: "asc" }] as const;
  }
  if (field === "actorDisplay") {
    return [{ actorDisplay: dir }, { occurredAt: "desc" }, { id: "asc" }] as const;
  }
  if (field === "entityType") {
    return [{ entityType: dir }, { occurredAt: "desc" }, { id: "asc" }] as const;
  }
  if (field === "result") {
    return [{ result: dir }, { occurredAt: "desc" }, { id: "asc" }] as const;
  }
  return [{ occurredAt: dir }, { id: "asc" }] as const;
}

export function parseAuditEventQuery(searchParams: URLSearchParams) {
  return parseAdminTableQuery(searchParams, {
    filterSchema: auditFilterSchema,
    allowedSortFields: AUDIT_SORT_FIELDS,
    defaultSort: { field: "occurredAt", dir: "desc" },
    defaultPageSize: REPORT_LIMITS.defaultPageSize,
    maxPageSize: REPORT_LIMITS.maxPageSize,
  });
}

export async function queryAuditEventsPage({
  tenantId,
  parsedQuery,
}: QueryAuditEventsArgs): Promise<QueryAuditEventsPageResult> {
  const where = buildAuditWhere({
    tenantId,
    search: parsedQuery.search,
    filters: parsedQuery.filters,
  });
  const orderBy = buildAuditOrderBy(parsedQuery.sort.field, parsedQuery.sort.dir);
  const skip = (parsedQuery.page - 1) * parsedQuery.pageSize;
  const take = parsedQuery.pageSize;

  const [totalCount, items] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: orderBy as Prisma.Enumerable<Prisma.AuditEventOrderByWithRelationInput>,
      skip,
      take,
      select: AUDIT_LIST_SELECT,
    }),
  ]);

  return {
    items,
    totalCount,
    page: parsedQuery.page,
    pageSize: parsedQuery.pageSize,
    sort: parsedQuery.sort,
    appliedFilters: parsedQuery.appliedFilters,
  };
}

export async function queryAuditEventsExport({
  tenantId,
  parsedQuery,
}: QueryAuditEventsArgs): Promise<QueryAuditEventsExportResult> {
  const where = buildAuditWhere({
    tenantId,
    search: parsedQuery.search,
    filters: parsedQuery.filters,
  });
  const orderBy = buildAuditOrderBy(parsedQuery.sort.field, parsedQuery.sort.dir);

  const [totalCount, items] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: orderBy as Prisma.Enumerable<Prisma.AuditEventOrderByWithRelationInput>,
      skip: 0,
      take: AUDIT_EXPORT_MAX_ROWS,
      select: AUDIT_LIST_SELECT,
    }),
  ]);

  return {
    items,
    totalCount,
    sort: parsedQuery.sort,
    appliedFilters: parsedQuery.appliedFilters,
    truncated: totalCount > AUDIT_EXPORT_MAX_ROWS,
  };
}
