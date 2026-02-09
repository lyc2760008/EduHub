// Levels list endpoint implements the Step 21.3 admin table query contract.
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

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const LEVEL_SORT_FIELDS = ["name", "createdAt", "sortOrder"] as const;
type LevelSortField = (typeof LEVEL_SORT_FIELDS)[number];

const levelFilterSchema = z
  .object({
    isActive: z.boolean().optional(),
  })
  .strict();

const LEVEL_LIST_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type LevelListRow = Prisma.LevelGetPayload<{
  select: typeof LEVEL_LIST_SELECT;
}>;

function buildLevelOrderBy(
  field: LevelSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.LevelOrderByWithRelationInput> {
  // Stable ordering keeps pagination deterministic across pages.
  if (field === "createdAt") {
    return [{ createdAt: dir }, { id: "asc" }];
  }
  if (field === "sortOrder") {
    return [{ sortOrder: dir }, { name: "asc" }, { id: "asc" }];
  }
  return [{ name: dir }, { id: "asc" }];
}

const CreateLevelSchema = z
  .object({
    name: z.string().trim().min(1),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract keeps level list queries consistent.
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: levelFilterSchema,
      allowedSortFields: LEVEL_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery(
      {
        filterSchema: levelFilterSchema,
        allowedSortFields: LEVEL_SORT_FIELDS,
        defaultSort: { field: "name", dir: "asc" },
        buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
          const andFilters: Prisma.LevelWhereInput[] = [
            { tenantId: scopedTenantId },
          ];
          if (search) {
            andFilters.push({
              name: { contains: search, mode: "insensitive" },
            });
          }
          if (typeof filters.isActive === "boolean") {
            andFilters.push({ isActive: filters.isActive });
          }
          return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
        },
        buildOrderBy: buildLevelOrderBy,
        count: (where) => prisma.level.count({ where }),
        findMany: ({ where, orderBy, skip, take }) =>
          prisma.level.findMany({
            where,
            orderBy:
              orderBy as Prisma.Enumerable<Prisma.LevelOrderByWithRelationInput>,
            skip,
            take,
            select: LEVEL_LIST_SELECT,
          }),
        mapRow: (row: LevelListRow) => ({
          id: row.id,
          name: row.name,
          sortOrder: row.sortOrder,
          isActive: row.isActive,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
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
    // Internal errors return a generic response to avoid leaking details.
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/levels failed", error);
    }
    return toReportErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Validation error shape is consistent for malformed JSON payloads.
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // Validate input before attempting to write to the database.
    const parsed = CreateLevelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    // Always scope by tenantId to prevent cross-tenant writes.
    const created = await prisma.level.create({
      data: {
        tenantId,
        ...parsed.data,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("POST /api/levels failed", error);
    return jsonError(500, "Internal server error");
  }
}
