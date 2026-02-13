/**
 * @state.route /api/portal/homework/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Step 23.2 parent homework detail endpoint with linked-student scoping.
 */
// Parent homework detail endpoint enforces linked-student visibility and returns metadata-only file references.
import { NextRequest, NextResponse } from "next/server";

import { getHomeworkItemDetail } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { requireParentForHomeworkItem } from "@/lib/homework/rbac";
import { buildPortalError, requirePortalParent } from "@/lib/portal/parent";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

function toPortalHomeworkErrorResponse(error: unknown) {
  if (error instanceof HomeworkError) {
    const code =
      error.status === 400
        ? "VALIDATION_ERROR"
        : error.status === 401
          ? "UNAUTHORIZED"
          : error.status === 403
            ? "FORBIDDEN"
            : error.status === 404
              ? "NOT_FOUND"
              : error.status === 409
                ? "CONFLICT"
                : "INTERNAL_ERROR";
    return buildPortalError(error.status, code, error.details);
  }

  return buildPortalError(500, "INTERNAL_ERROR");
}

export async function GET(req: NextRequest, context: RouteProps) {
  try {
    const { id: rawId } = await context.params;
    const homeworkItemId = rawId.trim();
    if (!homeworkItemId) {
      return buildPortalError(400, "VALIDATION_ERROR", { field: "id" });
    }

    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;

    await requireParentForHomeworkItem(
      ctx.tenant.tenantId,
      ctx.parentId,
      homeworkItemId,
    );

    const detail = await getHomeworkItemDetail(ctx.tenant.tenantId, homeworkItemId);

    return NextResponse.json({
      ...detail,
      files: detail.files.map((file) => ({
        ...file,
        downloadUrl: `/api/portal/homework/files/${file.id}/download`,
      })),
      filesBySlot: {
        ASSIGNMENT: detail.filesBySlot.ASSIGNMENT.map((file) => ({
          ...file,
          downloadUrl: `/api/portal/homework/files/${file.id}/download`,
        })),
        SUBMISSION: detail.filesBySlot.SUBMISSION.map((file) => ({
          ...file,
          downloadUrl: `/api/portal/homework/files/${file.id}/download`,
        })),
        FEEDBACK: detail.filesBySlot.FEEDBACK.map((file) => ({
          ...file,
          downloadUrl: `/api/portal/homework/files/${file.id}/download`,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/portal/homework/[id] failed", error);
    return toPortalHomeworkErrorResponse(error);
  }
}
