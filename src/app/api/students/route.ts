import { prisma } from "@/lib/db/prisma";
import { createStudentSchema } from "@/lib/validation/student";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header is required" },
        { status: 400 }
      );
    }

    const students = await prisma.student.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        grade: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ students });
  } catch (error) {
    console.error("GET /api/students failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id");

    if (!tenantId) {
      return NextResponse.json(
        { error: "x-tenant-id header is required" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
