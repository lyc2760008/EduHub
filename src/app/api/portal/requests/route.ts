// Parent portal requests endpoint with tenant + linked student validation.
import { NextRequest, NextResponse } from "next/server";
import { Prisma, RequestStatus, RequestType } from "@/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  assertParentLinkedToStudent,
  assertSessionUpcomingAndMatchesStudent,
  buildPortalError,
  parsePortalPagination,
  requirePortalParent,
} from "@/lib/portal/parent";
import { createParentRequestSchema } from "@/lib/validation/parentRequest";

export const runtime = "nodejs";

function parseStatusFilter(
  value: string | null,
): RequestStatus | null | Response {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (Object.values(RequestStatus).includes(trimmed as RequestStatus)) {
    return trimmed as RequestStatus;
  }
  return buildPortalError(400, "VALIDATION_ERROR", {
    field: "status",
    reason: "PORTAL_REQUEST_INVALID",
  });
}

export async function GET(req: NextRequest) {
  try {
    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const statusFilter = parseStatusFilter(url.searchParams.get("status"));
    if (statusFilter instanceof Response) return statusFilter;

    const { take, skip } = parsePortalPagination(req, {
      take: 50,
      maxTake: 200,
      skip: 0,
    });

    const items = await prisma.parentRequest.findMany({
      where: {
        tenantId,
        parentId: ctx.parentId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        type: true,
        status: true,
        reasonCode: true,
        message: true,
        sessionId: true,
        studentId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        // Include portal-safe summaries so the requests list can render without extra calls.
        session: {
          select: {
            id: true,
            startAt: true,
            sessionType: true,
            // Include timezone so parent-facing lists match admin display.
            timezone: true,
            group: { select: { name: true } },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
        session: item.session
          ? {
              ...item.session,
              startAt: item.session.startAt.toISOString(),
            }
          : null,
      })),
      take,
      skip,
    });
  } catch (error) {
    console.error("GET /api/portal/requests failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return buildPortalError(400, "VALIDATION_ERROR", {
        reason: "PORTAL_REQUEST_INVALID",
      });
    }

    const parsed = createParentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        reason: "PORTAL_REQUEST_INVALID",
      });
    }

    const data = parsed.data;

    const linkError = await assertParentLinkedToStudent(
      tenantId,
      ctx.parentId,
      data.studentId,
    );
    if (linkError) return linkError;

    const sessionResult = await assertSessionUpcomingAndMatchesStudent(
      tenantId,
      data.sessionId,
      data.studentId,
    );
    if (sessionResult instanceof Response) return sessionResult;

    // Unique constraint prevents duplicate requests for the same student/session across parents.
    const created = await prisma.parentRequest.create({
      data: {
        tenantId,
        parentId: ctx.parentId,
        studentId: data.studentId,
        sessionId: data.sessionId,
        type: RequestType.ABSENCE,
        reasonCode: data.reasonCode,
        message: data.message ?? null,
      },
      select: {
        id: true,
        type: true,
        status: true,
        reasonCode: true,
        message: true,
        sessionId: true,
        studentId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
      },
    });

    return NextResponse.json(
      {
        request: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
          resolvedAt: created.resolvedAt ? created.resolvedAt.toISOString() : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return buildPortalError(409, "CONFLICT", {
        reason: "PORTAL_REQUEST_DUPLICATE",
      });
    }
    console.error("POST /api/portal/requests failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
