// Admin audit log endpoint implements the Step 21.3 admin table query contract.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/rbac";
import {
  parseAdminTableQuery,
  runAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";
import { REPORT_LIMITS } from "@/lib/reports/reportConfigs";
import {
  AuditActorType,
  type Prisma,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const AUDIT_SORT_FIELDS = [
  "occurredAt",
  "action",
  "actorType",
  "entityType",
] as const;
type AuditSortField = (typeof AUDIT_SORT_FIELDS)[number];

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const auditActorTypeSchema = z.enum([
  "PARENT",
  "USER",
  "SYSTEM",
  "ADMIN",
  "TUTOR",
]);

const auditCategorySchema = z.enum([
  "auth",
  "requests",
  "attendance",
  "admin",
]);

const auditFilterSchema = z
  .object({
    actorType: auditActorTypeSchema.optional(),
    category: auditCategorySchema.optional(),
    action: z.string().trim().min(1).optional(),
    entityType: z.string().trim().min(1).optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .strict();

const AUDIT_LIST_SELECT = {
  id: true,
  occurredAt: true,
  actorType: true,
  actorDisplay: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ip: true,
  userAgent: true,
} as const;

type AuditListRow = Prisma.AuditEventGetPayload<{
  select: typeof AUDIT_LIST_SELECT;
}>;

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

function buildAuditOrderBy(
  field: AuditSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.AuditEventOrderByWithRelationInput> {
  // Stable ordering keeps pagination deterministic across pages.
  if (field === "action") {
    return [{ action: dir }, { occurredAt: "desc" }, { id: "asc" }];
  }
  if (field === "actorType") {
    return [{ actorType: dir }, { occurredAt: "desc" }, { id: "asc" }];
  }
  if (field === "entityType") {
    return [{ entityType: dir }, { occurredAt: "desc" }, { id: "asc" }];
  }
  return [{ occurredAt: dir }, { id: "asc" }];
}

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract keeps audit log queries consistent.
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: auditFilterSchema,
      allowedSortFields: AUDIT_SORT_FIELDS,
      defaultSort: { field: "occurredAt", dir: "desc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery(
      {
        filterSchema: auditFilterSchema,
        allowedSortFields: AUDIT_SORT_FIELDS,
        defaultSort: { field: "occurredAt", dir: "desc" },
        buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
          const andFilters: Prisma.AuditEventWhereInput[] = [
            { tenantId: scopedTenantId },
          ];
          if (search) {
            andFilters.push({
              OR: [
                { action: { contains: search, mode: "insensitive" } },
                { entityId: { contains: search, mode: "insensitive" } },
                { actorDisplay: { contains: search, mode: "insensitive" } },
              ],
            });
          }
          if (filters.actorType) {
            const actorType =
              filters.actorType === "ADMIN" ||
              filters.actorType === "TUTOR" ||
              filters.actorType === "USER"
                ? AuditActorType.USER
                : filters.actorType === "SYSTEM"
                  ? AuditActorType.SYSTEM
                  : AuditActorType.PARENT;
            andFilters.push({ actorType });
          }
          if (filters.category) {
            if (filters.category === "auth") {
              andFilters.push({
                OR: [
                  { action: { startsWith: "PARENT_LOGIN" } },
                  { action: { contains: "ACCESS_CODE" } },
                ],
              });
            } else if (filters.category === "requests") {
              andFilters.push({ action: { startsWith: "ABSENCE_REQUEST" } });
            } else if (filters.category === "attendance") {
              andFilters.push({ action: { startsWith: "ATTENDANCE" } });
            } else if (filters.category === "admin") {
              andFilters.push({
                NOT: [
                  { action: { startsWith: "PARENT_LOGIN" } },
                  { action: { contains: "ACCESS_CODE" } },
                  { action: { startsWith: "ABSENCE_REQUEST" } },
                  { action: { startsWith: "ATTENDANCE" } },
                ],
              });
            }
          }
          if (filters.action) {
            andFilters.push({ action: filters.action });
          }
          if (filters.entityType) {
            andFilters.push({ entityType: filters.entityType });
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
        },
        buildOrderBy: buildAuditOrderBy,
        count: (where) => prisma.auditEvent.count({ where }),
        findMany: ({ where, orderBy, skip, take }) =>
          prisma.auditEvent.findMany({
            where,
            orderBy:
              orderBy as Prisma.Enumerable<Prisma.AuditEventOrderByWithRelationInput>,
            skip,
            take,
            select: AUDIT_LIST_SELECT,
          }),
        mapRow: (row: AuditListRow) => ({
          id: row.id,
          occurredAt: row.occurredAt.toISOString(),
          actorType: row.actorType,
          actorDisplay: row.actorDisplay,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          metadata: row.metadata as Record<string, unknown> | null,
          ip: row.ip,
          userAgent: row.userAgent,
        }),
      },
      {
        tenantId,
        parsedQuery,
      },
    );

    return NextResponse.json({
      rows: result.rows,
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      sort: result.sort,
      appliedFilters: result.appliedFilters,
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/audit failed", error);
    }
    return toReportErrorResponse(error);
  }
}
