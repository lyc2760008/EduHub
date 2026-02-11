/**
 * @state.route /api/admin/reports/absence-requests
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  formatDateOnly,
  formatDisplayName,
  getPastRangeFromPreset,
} from "@/lib/reports/adminReportUtils";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const querySchema = z
  .object({
    preset: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
    status: z
      .enum(["PENDING", "APPROVED", "DECLINED", "WITHDRAWN", "ALL"])
      .default("PENDING"),
    tutorId: z.string().trim().min(1).optional(),
    studentId: z.string().trim().min(1).optional(),
  })
  .strict();

function getPendingAgeHours(createdAt: Date) {
  const diffMs = Date.now() - createdAt.getTime();
  return Math.max(0, Math.round(diffMs / (60 * 60 * 1000)));
}

export async function GET(req: NextRequest) {
  const ctx = await requireRole(req, ADMIN_ROLES);
  if (ctx instanceof Response) return ctx;

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const tenantId = ctx.tenant.tenantId;
  const { preset, status, tutorId, studentId } = parsed.data;
  const { from, toExclusive } = getPastRangeFromPreset(
    preset as Parameters<typeof getPastRangeFromPreset>[0],
  );

  const requests = await prisma.parentRequest.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: from,
        lt: toExclusive,
      },
      ...(status === "ALL" ? {} : { status }),
      ...(studentId ? { studentId } : {}),
      ...(tutorId ? { session: { tutorId } } : {}),
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          preferredName: true,
        },
      },
      parent: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      session: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          sessionType: true,
          tutor: { select: { name: true, email: true } },
          group: { select: { name: true } },
        },
      },
      resolvedByUser: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  const rows = requests.map((request) => {
    const isPending = request.status === "PENDING";
    const ageHours = isPending ? getPendingAgeHours(request.createdAt) : null;

    return {
      requestId: request.id,
      createdAt: request.createdAt.toISOString(),
      sessionStartAt: request.session.startAt.toISOString(),
      sessionLabel: request.session.group?.name ?? null,
      studentName: formatDisplayName(
        request.student.firstName,
        request.student.lastName,
        request.student.preferredName,
      ),
      parentDisplay: request.parent.email,
      status: request.status,
      ageHours,
      resolvedBy: request.resolvedByUser
        ? request.resolvedByUser.name?.trim() || request.resolvedByUser.email
        : null,
      lastUpdatedAt: request.updatedAt.toISOString(),
      tutorName: request.session.tutor.name?.trim() || request.session.tutor.email,
      sessionType: request.session.sessionType,
    };
  });

  rows.sort((left, right) => {
    const leftPending = left.status === "PENDING";
    const rightPending = right.status === "PENDING";
    if (leftPending && !rightPending) return -1;
    if (!leftPending && rightPending) return 1;
    if (leftPending && rightPending) {
      return (right.ageHours ?? 0) - (left.ageHours ?? 0);
    }
    return (
      new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
    );
  });

  return NextResponse.json({
    meta: {
      preset,
      status,
      from: formatDateOnly(from),
      to: formatDateOnly(new Date(toExclusive.getTime() - 1)),
    },
    rows,
  });
}
