import { Prisma, StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { parsePagination } from "@/lib/http/pagination";
import { requireRole } from "@/lib/rbac";
import { createStudentSchema } from "@/lib/validation/student";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

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
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          grade: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.student.count({ where }),
    ]);

    return NextResponse.json({ students, page, pageSize, total });
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
      return jsonError(422, "Validation error", {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;

    const created = await prisma.student.create({
      data: {
        tenantId,
        firstName: data.firstName,
        lastName: data.lastName,
        preferredName: data.preferredName,
        grade: data.grade,
        dateOfBirth: data.dateOfBirth,
        status: data.status,
        notes: data.notes,
      },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        grade: true,
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
