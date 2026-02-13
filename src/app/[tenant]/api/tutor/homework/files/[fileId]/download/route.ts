/**
 * @state.route /[tenant]/api/tutor/homework/files/[fileId]/download
 * @state.area api
 * @state.capabilities view:download
 * @state.notes Step 23.2 tutor authenticated homework file download endpoint.
 */
// Tutor download endpoint streams homework files only when the tutor owns the linked session.
import { NextRequest, NextResponse } from "next/server";

import { toAttachmentContentDisposition } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { requireRoleForHomeworkFileDownload } from "@/lib/homework/rbac";
import { dbHomeworkStorageProvider } from "@/lib/homework/storage/dbStorage";
import { type TutorDataErrorCode, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ tenant: string; fileId: string }>;
};

export async function GET(request: NextRequest, context: RouteProps) {
  const requestId = readTutorRequestId(request);
  const { tenant, fileId: rawFileId } = await context.params;

  try {
    const fileId = rawFileId.trim();
    if (!fileId) {
      throw new HomeworkError(400, "ValidationError", "Invalid file id", {
        field: "fileId",
      });
    }

    const tutorCtx = await requireTutorContextOrThrow(tenant);
    const allowedFile = await requireRoleForHomeworkFileDownload(
      tutorCtx.tenant.tenantId,
      {
        role: "Tutor",
        userId: tutorCtx.tutorUserId,
      },
      fileId,
    );
    const payload = await dbHomeworkStorageProvider.get({
      tenantId: tutorCtx.tenant.tenantId,
      fileId: allowedFile.id,
    });

    return new NextResponse(new Uint8Array(payload.bytes), {
      status: 200,
      headers: {
        "Content-Type": payload.mimeType,
        "Content-Length": String(payload.sizeBytes),
        "Content-Disposition": toAttachmentContentDisposition(allowedFile.filename),
        "Cache-Control": "no-store",
      },
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
      console.error(
        "GET /[tenant]/api/tutor/homework/files/[fileId]/download failed",
        error,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
