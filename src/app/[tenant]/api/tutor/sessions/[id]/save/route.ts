/**
 * @state.route /[tenant]/api/tutor/sessions/[id]/save
 * @state.area api
 * @state.capabilities update:attendance
 * @state.notes Step 22.4 tutor save endpoint (attendance + parent-visible notes only).
 */
// Tutor session execution save endpoint with atomic attendance + parent-visible note updates.
import { NextRequest } from "next/server";
import { z } from "zod";

import { AttendanceStatus } from "@/generated/prisma/client";
import { logError } from "@/lib/observability/logger";
import { saveTutorSessionExecution, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";

export const runtime = "nodejs";

const updateItemSchema = z
  .object({
    studentId: z.string().trim().min(1),
    attendanceStatus: z.nativeEnum(AttendanceStatus),
    // Parent-visible note is optional and validated again server-side with shared helper.
    parentVisibleNote: z.string().nullable().optional(),
  })
  .strict();

const savePayloadSchema = z
  .object({
    updates: z.array(updateItemSchema).min(1),
  })
  .strict();

type Params = {
  params: Promise<{ tenant: string; id: string }>;
};

export async function POST(request: NextRequest, context: Params) {
  const requestId = readTutorRequestId(request);
  const { tenant, id } = await context.params;

  try {
    const sessionId = id.trim();
    if (!sessionId) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid session id",
        details: { field: "id" },
        requestId,
      });
    }

    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid JSON body",
        details: { field: "body" },
        requestId,
      });
    }

    const parsedBody = savePayloadSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return buildTutorErrorResponse({
        status: 400,
        code: "ValidationError",
        message: "Invalid payload",
        details: { issues: parsedBody.error.issues },
        requestId,
      });
    }

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    const saveResult = await saveTutorSessionExecution({
      tenantId: tutorCtx.tenant.tenantId,
      tutorUserId: tutorCtx.tutorUserId,
      sessionId,
      updates: parsedBody.data.updates,
    });

    return buildTutorOkResponse({
      data: saveResult,
      requestId,
    });
  } catch (error) {
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      // Security: log only tenant/session metadata; never include roster notes or raw payloads.
      logError(
        "POST /[tenant]/api/tutor/sessions/[id]/save failed",
        { tenantSlug: tenant, sessionId: id },
        request,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
