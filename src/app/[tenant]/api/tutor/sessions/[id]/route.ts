/**
 * @state.route /[tenant]/api/tutor/sessions/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Step 22.4 tutor "Run Session" data endpoint scoped to tutor-owned sessions.
 */
// Tutor run-session data endpoint returning session header + roster attendance snapshot.
import { NextRequest } from "next/server";

import { getTutorSessionForRun, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ tenant: string; id: string }>;
};

export async function GET(request: NextRequest, context: Params) {
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

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    const result = await getTutorSessionForRun({
      tenantId: tutorCtx.tenant.tenantId,
      tutorUserId: tutorCtx.tutorUserId,
      sessionId,
    });

    if (!result) {
      return buildTutorErrorResponse({
        status: 404,
        code: "NotFound",
        message: "Session not found",
        requestId,
      });
    }

    return buildTutorOkResponse({
      data: result,
      requestId,
    });
  } catch (error) {
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      // Non-domain failures are logged with tenant context and request id for triage.
      logError(
        "GET /[tenant]/api/tutor/sessions/[id] failed",
        { tenantSlug: tenant, sessionId: id },
        request,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
