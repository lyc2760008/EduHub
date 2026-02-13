/**
 * @state.route /[tenant]/api/tutor/homework/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Step 23.2 tutor homework detail endpoint.
 */
// Tutor homework detail endpoint enforces tutor ownership before returning versioned slot metadata.
import { NextRequest } from "next/server";

import { getHomeworkItemDetail } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { requireTutorForHomeworkItem } from "@/lib/homework/rbac";
import { type TutorDataErrorCode, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export async function GET(request: NextRequest, context: RouteProps) {
  const requestId = readTutorRequestId(request);
  const { tenant, id } = await context.params;

  try {
    const homeworkItemId = id.trim();
    if (!homeworkItemId) {
      throw new HomeworkError(400, "ValidationError", "Invalid homework item id", {
        field: "id",
      });
    }

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    await requireTutorForHomeworkItem(
      tutorCtx.tenant.tenantId,
      tutorCtx.tutorUserId,
      homeworkItemId,
    );
    const detail = await getHomeworkItemDetail(
      tutorCtx.tenant.tenantId,
      homeworkItemId,
    );

    return buildTutorOkResponse({
      data: {
        ...detail,
        files: detail.files.map((file) => ({
          ...file,
          downloadUrl: `/${tenant}/api/tutor/homework/files/${file.id}/download`,
        })),
        filesBySlot: {
          ASSIGNMENT: detail.filesBySlot.ASSIGNMENT.map((file) => ({
            ...file,
            downloadUrl: `/${tenant}/api/tutor/homework/files/${file.id}/download`,
          })),
          SUBMISSION: detail.filesBySlot.SUBMISSION.map((file) => ({
            ...file,
            downloadUrl: `/${tenant}/api/tutor/homework/files/${file.id}/download`,
          })),
          FEEDBACK: detail.filesBySlot.FEEDBACK.map((file) => ({
            ...file,
            downloadUrl: `/${tenant}/api/tutor/homework/files/${file.id}/download`,
          })),
        },
      },
      requestId,
    });
  } catch (error) {
    if (error instanceof HomeworkError) {
      return buildTutorErrorResponse({
        status: error.status,
        code: error.code as TutorDataErrorCode,
        message: error.message,
        details: error.details,
        requestId,
      });
    }
    if (
      !(error instanceof TutorAccessError) &&
      !(error instanceof TutorDataError)
    ) {
      console.error("GET /[tenant]/api/tutor/homework/[id] failed", error);
    }
    return normalizeTutorRouteError(error, requestId);
  }
}

