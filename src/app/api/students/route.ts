/**
 * @state.route /api/students
 * @state.area api
 * @state.capabilities view:list, create:student
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { Prisma, StudentStatus } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
import { createStudentSchema } from "@/lib/validation/student";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";
// Student list responses should always be fresh because admins can create/edit records rapidly.
export const dynamic = "force-dynamic";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type StudentSortField = "name" | "status" | "parentCount" | "createdAt";

const STUDENT_SORT_FIELDS: StudentSortField[] = [
  "name",
  "status",
  "parentCount",
  "createdAt",
];

const studentFilterSchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).optional(),
    levelId: z.string().trim().min(1).optional(),
  })
  .strict();

type StudentListRow = Prisma.StudentGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    preferredName: true;
    grade: true;
    level: { select: { id: true; name: true } };
    status: true;
    createdAt: true;
    _count: { select: { parents: true } };
  };
}>;

function buildStudentOrderBy(
  field: StudentSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.StudentOrderByWithRelationInput> {
  // Sorting must happen in SQL before skip/take so pagination stays stable across pages.
  if (field === "status") {
    return [
      { status: dir },
      { lastName: "asc" },
      { firstName: "asc" },
      { id: "asc" },
    ];
  }
  if (field === "parentCount") {
    return [
      { parents: { _count: dir } },
      { lastName: "asc" },
      { firstName: "asc" },
      { id: "asc" },
    ];
  }
  if (field === "createdAt") {
    return [
      { createdAt: dir },
      { lastName: "asc" },
      { firstName: "asc" },
      { id: "asc" },
    ];
  }
  return [{ lastName: dir }, { firstName: dir }, { id: dir }];
}

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract ensures allowlisted search/sort/filter/pagination.
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: studentFilterSchema,
      allowedSortFields: STUDENT_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery({
      filterSchema: studentFilterSchema,
      allowedSortFields: STUDENT_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
        const andFilters: Prisma.StudentWhereInput[] = [
          { tenantId: scopedTenantId },
        ];
        if (search) {
          andFilters.push({
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { preferredName: { contains: search, mode: "insensitive" } },
              { grade: { contains: search, mode: "insensitive" } },
            ],
          });
        }
        if (filters.status === "ACTIVE") {
          andFilters.push({ status: StudentStatus.ACTIVE });
        }
        if (filters.status === "INACTIVE") {
          andFilters.push({
            status: { in: [StudentStatus.INACTIVE, StudentStatus.ARCHIVED] },
          });
        }
        if (filters.levelId) {
          andFilters.push({ levelId: filters.levelId });
        }
        return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
      },
      buildOrderBy: buildStudentOrderBy,
      count: (where) => prisma.student.count({ where }),
      findMany: ({ where, orderBy, skip, take }) =>
        prisma.student.findMany({
          where,
          orderBy:
            orderBy as Prisma.Enumerable<Prisma.StudentOrderByWithRelationInput>,
          skip,
          take,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            preferredName: true,
            grade: true,
            level: { select: { id: true, name: true } },
            status: true,
            createdAt: true,
            _count: { select: { parents: true } },
          },
        }),
      mapRow: (row: StudentListRow) => {
        const { _count, ...student } = row;
        return { ...student, parentCount: _count.parents };
      },
    }, {
      tenantId,
      parsedQuery,
    });

    return NextResponse.json(
      {
        rows: result.rows,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        sort: result.sort,
        appliedFilters: result.appliedFilters,
        // Legacy keys keep existing admin consumers stable while adopting the new contract.
        students: result.rows,
        total: result.totalCount,
      },
      {
        // Ensure browser and edge caches do not serve stale paginated slices.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/students failed", error);
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

    const parsed = createStudentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Validation error", {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;
    const status =
      data.status ??
      (data.isActive === undefined
        ? StudentStatus.ACTIVE
        : data.isActive
          ? StudentStatus.ACTIVE
          : StudentStatus.INACTIVE);

    if (data.levelId) {
      const level = await prisma.level.findFirst({
        where: { id: data.levelId, tenantId },
        select: { id: true },
      });
      if (!level) {
        return jsonError(404, "Level not found");
      }
    }

    const created = await prisma.student.create({
      data: {
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        preferredName: data.preferredName,
        grade: data.grade,
        levelId: data.levelId,
        dateOfBirth: data.dateOfBirth,
        // Use status as the canonical flag; isActive is mapped for API compatibility.
        status,
        notes: data.notes,
      },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        grade: true,
        level: { select: { id: true, name: true } },
        status: true,
        dateOfBirth: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ student: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/students failed", error);
    return jsonError(500, "Internal server error");
  }
}
