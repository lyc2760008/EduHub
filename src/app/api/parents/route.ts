// Parents list endpoint implements the Step 21.3 admin table query contract.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
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
import { createParentSchema } from "@/lib/validation/parent";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const PARENT_SORT_FIELDS = ["email", "createdAt"] as const;
type ParentSortField = (typeof PARENT_SORT_FIELDS)[number];

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const parentFilterSchema = z
  .object({
    hasStudents: z.boolean().optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .strict();

const PARENT_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { students: true } },
} as const;

type ParentListRow = Prisma.ParentGetPayload<{
  select: typeof PARENT_LIST_SELECT;
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

function buildParentOrderBy(
  field: ParentSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.ParentOrderByWithRelationInput> {
  // Stable ordering keeps pagination deterministic across pages.
  if (field === "createdAt") {
    return [{ createdAt: dir }, { id: "asc" }];
  }
  return [{ email: dir }, { id: "asc" }];
}

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract keeps parent list queries consistent.
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: parentFilterSchema,
      allowedSortFields: PARENT_SORT_FIELDS,
      defaultSort: { field: "email", dir: "asc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery(
      {
        filterSchema: parentFilterSchema,
        allowedSortFields: PARENT_SORT_FIELDS,
        defaultSort: { field: "email", dir: "asc" },
        buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
          const andFilters: Prisma.ParentWhereInput[] = [
            { tenantId: scopedTenantId },
          ];
          if (search) {
            andFilters.push({
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            });
          }
          if (typeof filters.hasStudents === "boolean") {
            andFilters.push({
              students: filters.hasStudents ? { some: {} } : { none: {} },
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
          return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
        },
        buildOrderBy: buildParentOrderBy,
        count: (where) => prisma.parent.count({ where }),
        findMany: ({ where, orderBy, skip, take }) =>
          prisma.parent.findMany({
            where,
            orderBy:
              orderBy as Prisma.Enumerable<Prisma.ParentOrderByWithRelationInput>,
            skip,
            take,
            select: PARENT_LIST_SELECT,
          }),
        mapRow: (row: ParentListRow) => ({
          id: row.id,
          name: `${row.firstName} ${row.lastName}`.trim(),
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          studentCount: row._count.students,
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
      console.error("GET /api/parents failed", error);
    }
    return toReportErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const parsed = createParentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(422, "Validation error", {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;

    const created = await prisma.parent.create({
      data: {
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
      },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ parent: created }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(409, "Parent email already exists for this tenant");
    }

    console.error("POST /api/parents failed", error);
    return jsonError(500, "Internal server error");
  }
}
