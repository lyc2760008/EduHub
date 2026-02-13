/**
 * @state.route /[tenant]/api/tutor/homework
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.2 tutor homework review queue list endpoint.
 */
// Tutor homework queue endpoint is ownership-scoped to tutor sessions and keeps server-side pagination/filter semantics.
import { NextRequest } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildHomeworkSlotCounts, ensureHomeworkItemsForSessionStudents } from "@/lib/homework/core";
import {
  buildHomeworkQueueOrderBy,
  buildHomeworkQueueWhere,
  homeworkQueueFilterSchema,
  HOMEWORK_QUEUE_SORT_FIELDS,
  parseDateEndExclusive,
  parseDateStart,
} from "@/lib/homework/query";
import {
  parseAdminTableQuery,
  runAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import { ReportApiError } from "@/lib/reports/adminReportErrors";
import { REPORT_LIMITS } from "@/lib/reports/reportConfigs";
import { formatDisplayName } from "@/lib/reports/adminReportUtils";
import { TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ tenant: string }>;
};

type TutorQueueRow = Prisma.HomeworkItemGetPayload<{
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
      select: { slot: true };
    };
  };
}>;

export async function GET(request: NextRequest, context: RouteProps) {
  const requestId = readTutorRequestId(request);
  const { tenant } = await context.params;

  try {
    const tutorCtx = await requireTutorContextOrThrow(tenant);

    const parsedQuery = parseAdminTableQuery(
      new URL(request.url).searchParams,
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
      // Lazy-create assigned rows only for tutor-owned sessions to keep assignment queues available.
      await ensureHomeworkItemsForSessionStudents({
        tenantId: tutorCtx.tenant.tenantId,
        tutorUserId: tutorCtx.tutorUserId,
        studentIds: queryWithDefaults.filters.studentId
          ? [queryWithDefaults.filters.studentId]
          : undefined,
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
        buildWhere: ({ tenantId, search, filters }) =>
          buildHomeworkQueueWhere({
            tenantId,
            filters,
            search,
            tutorUserId: tutorCtx.tutorUserId,
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
                },
              },
              student: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
              files: {
                select: { slot: true },
              },
            },
          }),
        mapRow: (row: TutorQueueRow) => ({
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
          fileCounts: buildHomeworkSlotCounts(row.files),
        }),
      },
      {
        tenantId: tutorCtx.tenant.tenantId,
        parsedQuery: queryWithDefaults,
      },
    );

    return buildTutorOkResponse({
      data: result,
      requestId,
    });
  } catch (error) {
    if (error instanceof ReportApiError) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid query",
        details: error.details ?? {},
        requestId,
      });
    }
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      console.error("GET /[tenant]/api/tutor/homework failed", error);
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
