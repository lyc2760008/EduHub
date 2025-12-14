import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { parsePagination } from "@/lib/http/pagination";
import { resolveTenant } from "@/lib/tenant/resolveTenant";
import { createParentSchema } from "@/lib/validation/parent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req);
    if (tenant instanceof NextResponse) return tenant;
    const tenantId = tenant.tenantId;

    const { page, pageSize, skip, take } = parsePagination(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();

    const searchFilter = q
      ? ({
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        } satisfies Prisma.ParentWhereInput)
      : {};

    const where: Prisma.ParentWhereInput = {
      tenantId,
      ...searchFilter,
    };

    const [parents, total] = await Promise.all([
      prisma.parent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      }),
      prisma.parent.count({ where }),
    ]);

    return NextResponse.json({ parents, page, pageSize, total });
  } catch (error) {
    console.error("GET /api/parents failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req);
    if (tenant instanceof NextResponse) return tenant;
    const tenantId = tenant.tenantId;

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
