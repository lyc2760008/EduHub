/**
 * @state.route /api/requests
 * @state.area api
 * @state.capabilities view:list, request:withdraw, request:resubmit
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Admin requests list endpoint with tenant scoping and RBAC enforcement.
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
  Prisma,
  RequestStatus,
  RequestType,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const REQUEST_SORT_FIELDS = ["createdAt", "updatedAt", "status"] as const;
type RequestSortField = (typeof REQUEST_SORT_FIELDS)[number];

// Shared select keeps request list rows aligned with admin table responses.
const REQUEST_LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  reasonCode: true,
  message: true,
  sessionId: true,
  studentId: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  // Withdraw/resubmit timestamps support admin detail context.
  withdrawnAt: true,
  resubmittedAt: true,
  resolvedAt: true,
  resolvedByUserId: true,
  parent: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  student: {
    select: { id: true, firstName: true, lastName: true },
  },
  session: {
    select: {
      id: true,
      startAt: true,
      endAt: true,
      sessionType: true,
      group: { select: { name: true } },
    },
  },
} as const;

type RequestListRow = Prisma.ParentRequestGetPayload<{
  select: typeof REQUEST_LIST_SELECT;
}>;

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const requestFilterSchema = z
  .object({
    status: z
      .enum(["PENDING", "APPROVED", "DECLINED", "WITHDRAWN", "ALL"])
      .optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .strict();

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

function buildRequestOrderBy(
  field: RequestSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.ParentRequestOrderByWithRelationInput> {
  // Stable sort fallback keeps pagination deterministic across updates.
  if (field === "updatedAt") {
    return [{ updatedAt: dir }, { id: "asc" }];
  }
  if (field === "status") {
    return [{ status: dir }, { createdAt: "desc" }, { id: "asc" }];
  }
  return [{ createdAt: dir }, { id: "asc" }];
}

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract enforces safe, allowlisted filters + sorts.
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: requestFilterSchema,
      allowedSortFields: REQUEST_SORT_FIELDS,
      defaultSort: { field: "createdAt", dir: "desc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery({
      filterSchema: requestFilterSchema,
      allowedSortFields: REQUEST_SORT_FIELDS,
      defaultSort: { field: "createdAt", dir: "desc" },
      buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
        const andFilters: Prisma.ParentRequestWhereInput[] = [
          { tenantId: scopedTenantId },
          { type: RequestType.ABSENCE },
        ];
        if (search) {
          andFilters.push({
            OR: [
              { parent: { email: { contains: search, mode: "insensitive" } } },
              {
                parent: { firstName: { contains: search, mode: "insensitive" } },
              },
              {
                parent: { lastName: { contains: search, mode: "insensitive" } },
              },
              {
                student: {
                  firstName: { contains: search, mode: "insensitive" },
                },
              },
              {
                student: {
                  lastName: { contains: search, mode: "insensitive" },
                },
              },
              {
                session: {
                  group: { name: { contains: search, mode: "insensitive" } },
                },
              },
            ],
          });
        }
        const start = parseDateStart(filters.from);
        const endExclusive = parseDateEndExclusive(filters.to);
        if (start || endExclusive) {
          andFilters.push({
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(endExclusive ? { lt: endExclusive } : {}),
            },
          });
        }
        if (filters.status && filters.status !== "ALL") {
          andFilters.push({ status: filters.status as RequestStatus });
        }
        return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
      },
      buildOrderBy: buildRequestOrderBy,
      count: (where) => prisma.parentRequest.count({ where }),
      findMany: ({ where, orderBy, skip, take }) =>
        prisma.parentRequest.findMany({
          where,
          orderBy:
            orderBy as Prisma.ParentRequestOrderByWithRelationInput[],
          skip,
          take,
          select: REQUEST_LIST_SELECT,
        }),
      mapRow: (row: RequestListRow) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
        resubmittedAt: row.resubmittedAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        session: {
          ...row.session,
          startAt: row.session.startAt.toISOString(),
          endAt: row.session.endAt.toISOString(),
        },
      }),
    }, {
      tenantId,
      parsedQuery,
    });

    return NextResponse.json({
      rows: result.rows,
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      sort: result.sort,
      appliedFilters: result.appliedFilters,
      // Legacy keys keep existing admin consumers stable while adopting the new contract.
      items: result.rows,
      total: result.totalCount,
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/requests failed", error);
    }
    return toReportErrorResponse(error);
  }
}
