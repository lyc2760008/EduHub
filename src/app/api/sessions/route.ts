/**
 * @state.route /api/sessions
 * @state.area api
 * @state.capabilities view:list, create:session, report_absence:create_request
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Sessions collection API with tenant scoping, RBAC, and validation.
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
import {
  Prisma,
  RequestStatus,
  RequestType,
  SessionType,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

const CreateSessionSchema = z
  .object({
    centerId: z.string().trim().min(1),
    tutorId: z.string().trim().min(1),
    sessionType: z.nativeEnum(SessionType),
    startAt: z.string().trim().datetime({ offset: true }),
    endAt: z.string().trim().datetime({ offset: true }),
    timezone: z.string().trim().min(1),
    studentId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
  })
  .strict();

const SESSION_SORT_FIELDS = [
  "startAt",
  "endAt",
  "centerName",
  "tutorName",
] as const;
type SessionSortField = (typeof SESSION_SORT_FIELDS)[number];

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const sessionFilterSchema = z
  .object({
    centerId: z.string().trim().min(1).optional(),
    tutorId: z.string().trim().min(1).optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .strict();

type SessionListRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    centerId: true;
    tutorId: true;
    sessionType: true;
    groupId: true;
    startAt: true;
    endAt: true;
    timezone: true;
    center: { select: { name: true } };
    tutor: { select: { name: true; email: true } };
    group: { select: { name: true; type: true } };
  };
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

function buildSessionOrderBy(
  field: SessionSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.SessionOrderByWithRelationInput> {
  // Stable secondary ordering keeps pagination deterministic for admin lists.
  if (field === "centerName") {
    return [{ center: { name: dir } }, { startAt: "asc" }, { id: "asc" }];
  }
  if (field === "tutorName") {
    return [{ tutor: { name: dir } }, { startAt: "asc" }, { id: "asc" }];
  }
  if (field === "endAt") {
    return [{ endAt: dir }, { id: "asc" }];
  }
  return [{ startAt: dir }, { id: "asc" }];
}

export async function GET(req: NextRequest) {
  // Step 21.3 Admin Table query contract keeps sessions list queries consistent.
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, READ_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;
    const viewerRole = ctx.membership.role;
    const viewerId = ctx.user.id;

    const url = new URL(req.url);
    const parsedQuery = parseAdminTableQuery(url.searchParams, {
      filterSchema: sessionFilterSchema,
      allowedSortFields: SESSION_SORT_FIELDS,
      defaultSort: { field: "startAt", dir: "asc" },
      defaultPageSize: REPORT_LIMITS.defaultPageSize,
    });

    const pendingCountBySessionId = new Map<string, number>();

    const result = await runAdminTableQuery({
      filterSchema: sessionFilterSchema,
      allowedSortFields: SESSION_SORT_FIELDS,
      defaultSort: { field: "startAt", dir: "asc" },
      buildWhere: ({ tenantId: scopedTenantId, search, filters }) => {
        const andFilters: Prisma.SessionWhereInput[] = [
          { tenantId: scopedTenantId },
        ];
        if (search) {
          andFilters.push({
            OR: [
              { tutor: { name: { contains: search, mode: "insensitive" } } },
              { tutor: { email: { contains: search, mode: "insensitive" } } },
              { center: { name: { contains: search, mode: "insensitive" } } },
              { group: { name: { contains: search, mode: "insensitive" } } },
            ],
          });
        }
        const start = parseDateStart(filters.from);
        const endExclusive = parseDateEndExclusive(filters.to);
        const now = new Date();
        const lowerBound = start && start > now ? start : now;
        andFilters.push({
          startAt: {
            gte: lowerBound,
            ...(endExclusive ? { lt: endExclusive } : {}),
          },
        });
        if (filters.centerId) {
          andFilters.push({ centerId: filters.centerId });
        }
        if (viewerRole === "Tutor") {
          andFilters.push({ tutorId: viewerId });
        } else if (filters.tutorId) {
          andFilters.push({ tutorId: filters.tutorId });
        }
        return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
      },
      buildOrderBy: buildSessionOrderBy,
      count: (where) => prisma.session.count({ where }),
      findMany: async ({ where, orderBy, skip, take }) => {
        const sessions = await prisma.session.findMany({
          where,
          orderBy:
            orderBy as Prisma.Enumerable<Prisma.SessionOrderByWithRelationInput>,
          skip,
          take,
          select: {
            id: true,
            centerId: true,
            tutorId: true,
            sessionType: true,
            groupId: true,
            startAt: true,
            endAt: true,
            timezone: true,
            center: { select: { name: true } },
            tutor: { select: { name: true, email: true } },
            group: { select: { name: true, type: true } },
          },
        });

        // Aggregate pending absence requests once per page to avoid N+1 lookups.
        const sessionIds = sessions.map((session) => session.id);
        const pendingCounts = sessionIds.length
          ? await prisma.parentRequest.groupBy({
              by: ["sessionId"],
              where: {
                tenantId,
                sessionId: { in: sessionIds },
                status: RequestStatus.PENDING,
                type: RequestType.ABSENCE,
              },
              _count: { _all: true },
            })
          : [];
        pendingCountBySessionId.clear();
        for (const row of pendingCounts) {
          pendingCountBySessionId.set(row.sessionId, row._count._all);
        }

        return sessions;
      },
      mapRow: (session: SessionListRow) => ({
        id: session.id,
        centerId: session.centerId,
        centerName: session.center.name,
        tutorId: session.tutorId,
        tutorName: session.tutor.name ?? null,
        sessionType: session.sessionType,
        groupId: session.groupId,
        groupName: session.group?.name ?? null,
        groupType: session.group?.type ?? null,
        startAt: session.startAt.toISOString(),
        endAt: session.endAt.toISOString(),
        timezone: session.timezone,
        pendingAbsenceCount: pendingCountBySessionId.get(session.id) ?? 0,
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
      sessions: result.rows,
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/sessions failed", error);
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

    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    if (startAt >= endAt) {
      return NextResponse.json(
        { error: "ValidationError", details: "endAt must be after startAt" },
        { status: 400 },
      );
    }

    if (data.sessionType === "ONE_ON_ONE") {
      if (!data.studentId) {
        return NextResponse.json(
          { error: "ValidationError", details: "studentId is required" },
          { status: 400 },
        );
      }
      if (data.groupId) {
        return NextResponse.json(
          { error: "ValidationError", details: "groupId is not allowed" },
          { status: 400 },
        );
      }
    }

    if (data.sessionType === "GROUP" || data.sessionType === "CLASS") {
      if (!data.groupId) {
        return NextResponse.json(
          { error: "ValidationError", details: "groupId is required" },
          { status: 400 },
        );
      }
      if (data.studentId) {
        return NextResponse.json(
          { error: "ValidationError", details: "studentId is not allowed" },
          { status: 400 },
        );
      }
    }

    const center = await prisma.center.findFirst({
      where: { id: data.centerId, tenantId },
      select: { id: true },
    });
    if (!center) {
      return NextResponse.json(
        { error: "ValidationError", details: "Center not found for tenant" },
        { status: 400 },
      );
    }

    const tutorMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: data.tutorId, role: "Tutor" },
      select: { id: true },
    });
    if (!tutorMembership) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "Tutor must have Tutor role in this tenant",
        },
        { status: 400 },
      );
    }

    const staffCenter = await prisma.staffCenter.findFirst({
      where: { tenantId, userId: data.tutorId, centerId: data.centerId },
      select: { id: true },
    });
    if (!staffCenter) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "Tutor is not assigned to this center",
        },
        { status: 400 },
      );
    }

    if (data.sessionType === "ONE_ON_ONE") {
      const student = await prisma.student.findFirst({
        where: { id: data.studentId, tenantId },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json(
          { error: "ValidationError", details: "Student not found for tenant" },
          { status: 400 },
        );
      }
    }

    if (data.sessionType !== "ONE_ON_ONE") {
      const group = await prisma.group.findFirst({
        where: { id: data.groupId, tenantId },
        select: { id: true, centerId: true, type: true },
      });
      if (!group) {
        return NextResponse.json(
          { error: "ValidationError", details: "Group not found for tenant" },
          { status: 400 },
        );
      }
      if (group.centerId !== data.centerId) {
        return NextResponse.json(
          {
            error: "ValidationError",
            details: "Group does not belong to center",
          },
          { status: 400 },
        );
      }
      if (data.sessionType === "GROUP" && group.type !== "GROUP") {
        return NextResponse.json(
          { error: "ValidationError", details: "Group type must be GROUP" },
          { status: 400 },
        );
      }
      if (data.sessionType === "CLASS" && group.type !== "CLASS") {
        return NextResponse.json(
          { error: "ValidationError", details: "Group type must be CLASS" },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          tenantId,
          centerId: data.centerId,
          tutorId: data.tutorId,
          sessionType: data.sessionType,
          groupId: data.groupId ?? null,
          startAt,
          endAt,
          timezone: data.timezone,
        },
        select: {
          id: true,
          tenantId: true,
          centerId: true,
          tutorId: true,
          sessionType: true,
          groupId: true,
          startAt: true,
          endAt: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      let rosterStudentIds: string[] = [];

      if (data.sessionType === "ONE_ON_ONE") {
        rosterStudentIds = [data.studentId!];
      } else if (data.groupId) {
        const groupStudents = await tx.groupStudent.findMany({
          where: { tenantId, groupId: data.groupId },
          select: { studentId: true },
        });
        rosterStudentIds = groupStudents.map((entry) => entry.studentId);
      }

      if (rosterStudentIds.length) {
        await tx.sessionStudent.createMany({
          data: rosterStudentIds.map((studentId) => ({
            tenantId,
            sessionId: session.id,
            studentId,
          })),
          skipDuplicates: true,
        });
      }

      return { session, rosterCount: rosterStudentIds.length };
    });

    return NextResponse.json(
      { session: result.session, rosterCount: result.rosterCount },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(
        409,
        "Session already exists for this tutor and start time",
      );
    }
    console.error("POST /api/sessions failed", error);
    return jsonError(500, "Internal server error");
  }
}
