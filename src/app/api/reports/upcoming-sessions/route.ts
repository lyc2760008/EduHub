// Upcoming sessions report endpoint with tenant-scoped queries and RBAC.
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  addUtcDays,
  assertCenterInTenant,
  buildReportError,
  enforceTutorScopeForUpcoming,
  formatDateOnly,
  getUtcToday,
  parseDateOnly,
  parseReportParams,
  requireReportAccess,
  upcomingSessionsQuerySchema,
} from "@/lib/reports/reportQuery";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Resolve tenant + membership and enforce report RBAC first.
    const access = await requireReportAccess(req, { allowTutorUpcoming: true });
    if (access instanceof Response) return access;
    const tenantId = access.tenant.tenantId;

    const params = parseReportParams(req, upcomingSessionsQuerySchema);

    // Default to [today, today + 14 days] when date params are omitted.
    const today = getUtcToday();
    const fromDate = params.from ? parseDateOnly(params.from) : today;
    const toDate = params.to ? parseDateOnly(params.to) : addUtcDays(today, 14);

    if (fromDate > toDate) {
      return buildReportError(400, "ValidationError", "from must be <= to", {
        from: formatDateOnly(fromDate),
        to: formatDateOnly(toDate),
      });
    }

    const centerError = await assertCenterInTenant(tenantId, params.centerId);
    if (centerError) return centerError;

    // Enforce tutor scoping for tutor-role requests.
    const tutorScope = enforceTutorScopeForUpcoming(access, params.tutorId);
    if (tutorScope instanceof Response) return tutorScope;
    const tutorId = tutorScope.tutorId;

    // Use an exclusive upper bound so YYYY-MM-DD ranges cover full days.
    const rangeEndExclusive = addUtcDays(toDate, 1);

    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        startAt: { gte: fromDate, lt: rangeEndExclusive },
        ...(params.centerId ? { centerId: params.centerId } : {}),
        ...(tutorId ? { tutorId } : {}),
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        sessionType: true,
        centerId: true,
        tutorId: true,
        center: { select: { name: true } },
        tutor: { select: { name: true, email: true } },
        _count: { select: { sessionStudents: true } },
      },
    });

    const rows = sessions.map((session) => ({
      sessionId: session.id,
      startAt: session.startAt,
      endAt: session.endAt,
      sessionType: session.sessionType,
      centerId: session.centerId,
      centerName: session.center.name,
      tutorId: session.tutorId,
      tutorName: session.tutor.name ?? session.tutor.email ?? null,
      rosterCount: session._count.sessionStudents,
    }));

    const meta = {
      from: formatDateOnly(fromDate),
      to: formatDateOnly(toDate),
      ...(params.centerId ? { centerId: params.centerId } : {}),
      ...(tutorId ? { tutorId } : {}),
    };

    return NextResponse.json({ meta, rows });
  } catch (error) {
    if (error instanceof ZodError) {
      return buildReportError(400, "ValidationError", "Invalid query params", {
        issues: error.issues,
      });
    }
    console.error("GET /api/reports/upcoming-sessions failed", error);
    return buildReportError(500, "InternalError", "Internal server error");
  }
}
