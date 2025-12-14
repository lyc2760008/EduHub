import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireTenantId } from "@/lib/http/tenant";
import { updateParentSchema } from "@/lib/validation/parent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ parentId: string }>;
};

export async function GET(req: NextRequest, context: Params) {
  try {
    const { parentId } = await context.params;

    const tenantId = requireTenantId(req);
    if (tenantId instanceof NextResponse) return tenantId;

    const parent = await prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!parent) {
      return jsonError(404, "Parent not found");
    }

    return NextResponse.json({ parent });
  } catch (error) {
    console.error("GET /api/parents/[parentId] failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function PATCH(req: NextRequest, context: Params) {
  try {
    const { parentId } = await context.params;

    const tenantId = requireTenantId(req);
    if (tenantId instanceof NextResponse) return tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const parsed = updateParentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(422, "Validation error", { issues: parsed.error.issues });
    }

    const data = parsed.data;

    const existing = await prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, "Parent not found");
    }

    const updated = await prisma.parent.update({
      where: { id: parentId },
      data: {
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
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ parent: updated });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(409, "Parent email already exists for this tenant");
    }

    console.error("PATCH /api/parents/[parentId] failed", error);
    return jsonError(500, "Internal server error");
  }
}
