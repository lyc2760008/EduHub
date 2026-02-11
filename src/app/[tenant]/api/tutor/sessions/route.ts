/**
 * @state.route /[tenant]/api/tutor/sessions
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.4 tutor "My Sessions" list endpoint with tenant-safe RBAC.
 */
// Tutor sessions list endpoint (tenant + tutor-scoped) for My Sessions pagination.
import { NextRequest } from "next/server";
import { z } from "zod";

import { listTutorSessions, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

type Params = {
  params: Promise<{ tenant: string }>;
};

function parseDateOnlyToUtc(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map((value) => Number(value));
  return new Date(Date.UTC(year, month - 1, day));
}

function toUtcEndOfDay(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

export async function GET(request: NextRequest, context: Params) {
  const requestId = readTutorRequestId(request);
  const { tenant } = await context.params;

  try {
    const parsedQuery = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    if (!parsedQuery.success) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid query parameters",
        details: { issues: parsedQuery.error.issues },
        requestId,
      });
    }

    const fromDate = parsedQuery.data.from
      ? parseDateOnlyToUtc(parsedQuery.data.from)
      : undefined;
    const toDate = parsedQuery.data.to
      ? toUtcEndOfDay(parseDateOnlyToUtc(parsedQuery.data.to))
      : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid date range",
        details: { field: "to" },
        requestId,
      });
    }

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    const result = await listTutorSessions({
      tenantId: tutorCtx.tenant.tenantId,
      tutorUserId: tutorCtx.tutorUserId,
      startDate: fromDate,
      endDate: toDate,
      cursor: parsedQuery.data.cursor ?? null,
      limit: parsedQuery.data.limit,
    });

    return buildTutorOkResponse({
      data: {
        items: result.items,
        nextCursor: result.nextCursor,
      },
      requestId,
    });
  } catch (error) {
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      // Log non-domain failures only; domain errors are intentionally returned to callers.
      logError(
        "GET /[tenant]/api/tutor/sessions failed",
        { tenantSlug: tenant },
        request,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
