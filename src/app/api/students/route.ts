import { Prisma, StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { parsePagination } from "@/lib/http/pagination";
import { requireRole } from "@/lib/rbac";
import { createStudentSchema } from "@/lib/validation/student";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";
// Student list responses should always be fresh because admins can create/edit records rapidly.
export const dynamic = "force-dynamic";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type StudentSortField = "name" | "status" | "parentCount" | "createdAt";
type StudentSortDir = "asc" | "desc";

const STUDENT_SORT_FIELDS: StudentSortField[] = [
  "name",
  "status",
  "parentCount",
  "createdAt",
];

function parseSortDir(value: string | null): StudentSortDir {
  return value === "desc" ? "desc" : "asc";
}

function parseSortField(value: string | null): StudentSortField {
  // Keep legacy default ordering for callers that do not send explicit sort params.
  if (!value) return "createdAt";
  if (STUDENT_SORT_FIELDS.includes(value as StudentSortField)) {
    return value as StudentSortField;
  }
  return "createdAt";
}

function buildStudentOrderBy(
  field: StudentSortField,
  dir: StudentSortDir,
): Prisma.Enumerable<Prisma.StudentOrderByWithRelationInput> {
  // Sorting must happen in SQL before skip/take so pagination stays stable across pages.
  if (field === "status") {
    return [
      { status: dir },
      { firstName: "asc" },
      { lastName: "asc" },
      { id: "asc" },
    ];
  }
  if (field === "parentCount") {
    return [
      { parents: { _count: dir } },
      { firstName: "asc" },
      { lastName: "asc" },
      { id: "asc" },
    ];
  }
  if (field === "createdAt") {
    return [
      { createdAt: dir },
      { firstName: "asc" },
      { lastName: "asc" },
      { id: "asc" },
    ];
  }
  return [{ firstName: dir }, { lastName: dir }, { id: dir }];
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const { page, pageSize, skip, take } = parsePagination(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const statusParam = url.searchParams.get("status") as StudentStatus | null;
    const gradeParam = url.searchParams.get("grade")?.trim() || undefined;
    const sortField = parseSortField(url.searchParams.get("sortField"));
    const sortDir = parseSortDir(url.searchParams.get("sortDir"));
    const orderBy = buildStudentOrderBy(sortField, sortDir);

    const filters: Prisma.StudentWhereInput[] = [];

    if (q) {
      filters.push({
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { preferredName: { contains: q, mode: "insensitive" } },
          { grade: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (statusParam) {
      filters.push({ status: statusParam });
    }

    if (gradeParam) {
      filters.push({ grade: gradeParam });
    }

    const where: Prisma.StudentWhereInput = {
      tenantId,
      ...(filters.length ? { AND: filters } : {}),
    };

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        orderBy,
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
      prisma.student.count({ where }),
    ]);

    const payload = students.map(({ _count, ...student }) => ({
      ...student,
      parentCount: _count.parents,
    }));

    return NextResponse.json(
      { students: payload, page, pageSize, total },
      {
        // Ensure browser and edge caches do not serve stale paginated slices.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("GET /api/students failed", error);
    return jsonError(500, "Internal server error");
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
