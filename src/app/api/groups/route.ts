// Groups collection API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  normalizeIdArray,
  validateGroupForeignKeys,
  validateStudentIds,
  validateTutorEligibility,
} from "@/lib/groups/data";
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
import { GroupType, Prisma, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const GROUP_SORT_FIELDS = [
  "name",
  "type",
  "centerName",
  "programName",
  "levelName",
  "tutorsCount",
  "studentsCount",
  "status",
] as const;
type GroupSortField = (typeof GROUP_SORT_FIELDS)[number];

// Reuse a typed select so list rows stay aligned with the admin contract payload.
const GROUP_LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  centerId: true,
  programId: true,
  levelId: true,
  isActive: true,
  capacity: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  center: { select: { name: true } },
  program: { select: { name: true } },
  level: { select: { name: true } },
  _count: { select: { tutors: true, students: true } },
} as const;

type GroupListRow = Prisma.GroupGetPayload<{ select: typeof GROUP_LIST_SELECT }>;

const groupFilterSchema = z
  .object({
    type: z.nativeEnum(GroupType).optional(),
    isActive: z.boolean().optional(),
    programId: z.string().trim().min(1).optional(),
    levelId: z.string().trim().min(1).optional(),
    tutorId: z.string().trim().min(1).optional(),
  })
  .strict();

function buildGroupOrderBy(
  field: GroupSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.GroupOrderByWithRelationInput> {
  // Stable sort fallback keeps admin list pagination deterministic.
  if (field === "centerName") {
    return [{ center: { name: dir } }, { name: "asc" }, { id: "asc" }];
  }
  if (field === "type") {
    return [{ type: dir }, { name: "asc" }, { id: "asc" }];
  }
  if (field === "programName") {
    return [{ program: { name: dir } }, { name: "asc" }, { id: "asc" }];
  }
  if (field === "levelName") {
    return [{ level: { name: dir } }, { name: "asc" }, { id: "asc" }];
  }
  if (field === "tutorsCount") {
    return [{ tutors: { _count: dir } }, { name: "asc" }, { id: "asc" }];
  }
  if (field === "studentsCount") {
    return [{ students: { _count: dir } }, { name: "asc" }, { id: "asc" }];
  }
  if (field === "status") {
    return [{ isActive: dir }, { name: "asc" }, { id: "asc" }];
  }
  return [{ name: dir }, { id: "asc" }];
}

const CreateGroupSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.nativeEnum(GroupType),
    centerId: z.string().trim().min(1),
    programId: z.string().trim().min(1),
    levelId: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional(),
    tutorIds: z.array(z.string().trim().min(1)).optional(),
    studentIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract keeps group list queries consistent.
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: groupFilterSchema,
      allowedSortFields: GROUP_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const result = await runAdminTableQuery({
      filterSchema: groupFilterSchema,
      allowedSortFields: GROUP_SORT_FIELDS,
      defaultSort: { field: "name", dir: "asc" },
      buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
        const andFilters: Prisma.GroupWhereInput[] = [
          { tenantId: scopedTenantId },
        ];
        if (search) {
          andFilters.push({
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { center: { name: { contains: search, mode: "insensitive" } } },
              { program: { name: { contains: search, mode: "insensitive" } } },
              { level: { name: { contains: search, mode: "insensitive" } } },
              {
                tutors: {
                  some: {
                    user: {
                      OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { email: { contains: search, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              },
            ],
          });
        }
        if (filters.type) {
          andFilters.push({ type: filters.type });
        }
        if (typeof filters.isActive === "boolean") {
          andFilters.push({ isActive: filters.isActive });
        }
        if (filters.programId) {
          andFilters.push({ programId: filters.programId });
        }
        if (filters.levelId) {
          andFilters.push({ levelId: filters.levelId });
        }
        if (filters.tutorId) {
          andFilters.push({
            tutors: { some: { userId: filters.tutorId } },
          });
        }
        return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
      },
      buildOrderBy: buildGroupOrderBy,
      count: (where) => prisma.group.count({ where }),
      findMany: ({ where, orderBy, skip, take }) =>
        prisma.group.findMany({
          where,
          orderBy:
            orderBy as Prisma.GroupOrderByWithRelationInput[],
          skip,
          take,
          select: GROUP_LIST_SELECT,
        }),
      mapRow: (group: GroupListRow) => ({
        id: group.id,
        name: group.name,
        type: group.type,
        centerId: group.centerId,
        centerName: group.center.name,
        programId: group.programId,
        programName: group.program.name,
        levelId: group.levelId,
        levelName: group.level?.name ?? null,
        isActive: group.isActive,
        capacity: group.capacity,
        notes: group.notes,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        tutorsCount: group._count.tutors,
        studentsCount: group._count.students,
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
      groups: result.rows,
    });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/groups failed", error);
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
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = CreateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const tutorIds = normalizeIdArray(data.tutorIds);
    const studentIds = normalizeIdArray(data.studentIds);

    const fkValidation = await validateGroupForeignKeys(prisma, tenantId, {
      centerId: data.centerId,
      programId: data.programId,
      levelId: data.levelId,
    });
    if (!fkValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: fkValidation.message },
        { status: 400 },
      );
    }

    const tutorValidation = await validateTutorEligibility(
      prisma,
      tenantId,
      data.centerId,
      tutorIds,
    );
    if (!tutorValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: tutorValidation.message },
        { status: 400 },
      );
    }

    const studentValidation = await validateStudentIds(
      prisma,
      tenantId,
      studentIds,
    );
    if (!studentValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: studentValidation.message },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          tenantId,
          name: data.name,
          type: data.type,
          centerId: data.centerId,
          programId: data.programId,
          levelId: data.levelId ?? null,
          isActive: data.isActive ?? true,
          capacity: data.capacity ?? null,
          notes: data.notes ?? null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          centerId: true,
          programId: true,
          levelId: true,
          isActive: true,
          capacity: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (tutorIds.length) {
        await tx.groupTutor.createMany({
          data: tutorIds.map((userId) => ({
            tenantId,
            groupId: group.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      if (studentIds.length) {
        await tx.groupStudent.createMany({
          data: studentIds.map((studentId) => ({
            tenantId,
            groupId: group.id,
            studentId,
          })),
          skipDuplicates: true,
        });
      }

      return group;
    });

    // Response shape: { group: GroupCore }.
    return NextResponse.json({ group: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/groups failed", error);
    return jsonError(500, "Internal server error");
  }
}
