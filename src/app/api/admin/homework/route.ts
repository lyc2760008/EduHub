/**
 * @state.route /api/admin/homework
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.2 admin homework review queue (tenant + RBAC scoped).
 */
// Admin homework queue endpoint reuses the shared admin table query contract for URL-state compatibility.
import { NextRequest, NextResponse } from "next/server";

import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildHomeworkQueueOrderBy,
  buildHomeworkQueueWhere,
  homeworkQueueFilterSchema,
  HOMEWORK_QUEUE_SORT_FIELDS,
  parseDateEndExclusive,
  parseDateStart,
} from "@/lib/homework/query";
import { buildHomeworkSlotCounts, ensureHomeworkItemsForSessionStudents } from "@/lib/homework/core";
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
import { requireRole } from "@/lib/rbac";
import { formatDisplayName } from "@/lib/reports/adminReportUtils";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type HomeworkQueueRow = Prisma.HomeworkItemGetPayload<{
  select: {
    id: true;
    sessionId: true;
    studentId: true;
    status: true;
    assignedAt: true;
    submittedAt: true;
    reviewedAt: true;
    updatedAt: true;
    session: {
      select: {
        id: true;
        startAt: true;
        centerId: true;
        center: { select: { name: true } };
        tutorId: true;
        tutor: { select: { name: true; email: true } };
      };
    };
    student: {
      select: {
        firstName: true;
        lastName: true;
        preferredName: true;
      };
    };
    files: {
      select: {
        slot: true;
      };
    };
  };
}>;

export async function GET(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeRoleError(roleResult);
    }

    const tenantId = roleResult.tenant.tenantId;
    const parsedQuery = parseAdminTableQuery(
      new URL(req.url).searchParams,
      {
        filterSchema: homeworkQueueFilterSchema,
        allowedSortFields: HOMEWORK_QUEUE_SORT_FIELDS,
        defaultSort: { field: "submittedAt", dir: "asc" },
        defaultPageSize: REPORT_LIMITS.defaultPageSize,
      },
    );
    // v1 queue default focuses on actionable submissions when status is not explicitly set.
    const queryWithDefaults = {
      ...parsedQuery,
      filters: {
        ...parsedQuery.filters,
        status: parsedQuery.filters.status ?? "SUBMITTED",
      },
    };

    const statusFilter = queryWithDefaults.filters.status;
    if (statusFilter === "ASSIGNED" || statusFilter === "ALL") {
      // Lazy-create assignment rows so staff can manage ASSIGNED queues without pre-seeding all sessions.
      await ensureHomeworkItemsForSessionStudents({
        tenantId,
        studentIds: queryWithDefaults.filters.studentId
          ? [queryWithDefaults.filters.studentId]
          : undefined,
        tutorUserId: queryWithDefaults.filters.tutorId,
        centerId: queryWithDefaults.filters.centerId,
        from: parseDateStart(queryWithDefaults.filters.from),
        toExclusive: parseDateEndExclusive(queryWithDefaults.filters.to),
        maxRows: 500,
      });
    }

    const result = await runAdminTableQuery(
      {
        filterSchema: homeworkQueueFilterSchema,
        allowedSortFields: HOMEWORK_QUEUE_SORT_FIELDS,
        defaultSort: { field: "submittedAt", dir: "asc" },
        buildWhere: ({ tenantId: scopedTenantId, search, filters }) =>
          buildHomeworkQueueWhere({
            tenantId: scopedTenantId,
            filters,
            search,
          }),
        buildOrderBy: buildHomeworkQueueOrderBy,
        count: (where) => prisma.homeworkItem.count({ where }),
        findMany: ({ where, orderBy, skip, take }) =>
          prisma.homeworkItem.findMany({
            where,
            orderBy:
              orderBy as Prisma.Enumerable<Prisma.HomeworkItemOrderByWithRelationInput>,
            skip,
            take,
            select: {
              id: true,
              sessionId: true,
              studentId: true,
              status: true,
              assignedAt: true,
              submittedAt: true,
              reviewedAt: true,
              updatedAt: true,
              session: {
                select: {
                  id: true,
                  startAt: true,
                  centerId: true,
                  center: { select: { name: true } },
                  tutorId: true,
                  tutor: { select: { name: true, email: true } },
                },
              },
              student: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
              files: { select: { slot: true } },
            },
          }),
        mapRow: (row: HomeworkQueueRow) => ({
          homeworkItemId: row.id,
          sessionId: row.sessionId,
          studentId: row.studentId,
          studentDisplay: formatDisplayName(
            row.student.firstName,
            row.student.lastName,
            row.student.preferredName,
          ),
          status: row.status,
          assignedAt: row.assignedAt?.toISOString() ?? null,
          submittedAt: row.submittedAt?.toISOString() ?? null,
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
          sessionStartAt: row.session.startAt.toISOString(),
          centerId: row.session.centerId,
          centerName: row.session.center?.name ?? null,
          tutorId: row.session.tutorId,
          tutorDisplay:
            row.session.tutor.name?.trim() ||
            row.session.tutor.email ||
            row.session.tutorId,
          fileCounts: buildHomeworkSlotCounts(row.files),
        }),
      },
      {
        tenantId,
        parsedQuery: queryWithDefaults,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/homework failed", error);
    }
    return toReportErrorResponse(error);
  }
}
