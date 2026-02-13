/**
 * @state.route /api/portal/homework/files/[fileId]/download
 * @state.area api
 * @state.capabilities view:download
 * @state.notes Step 23.2 parent authenticated homework file download endpoint.
 */
// Parent homework download endpoint streams files only for linked-student homework items.
import { NextRequest, NextResponse } from "next/server";

import { toAttachmentContentDisposition } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { requireRoleForHomeworkFileDownload } from "@/lib/homework/rbac";
import { dbHomeworkStorageProvider } from "@/lib/homework/storage/dbStorage";
import { buildPortalError, requirePortalParent } from "@/lib/portal/parent";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ fileId: string }>;
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
    const { fileId: rawFileId } = await context.params;
    const fileId = rawFileId.trim();
    if (!fileId) {
      return buildPortalError(400, "VALIDATION_ERROR", { field: "fileId" });
    }

    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;

    const allowedFile = await requireRoleForHomeworkFileDownload(
      ctx.tenant.tenantId,
      {
        role: "Parent",
        userId: ctx.session.user.id,
        parentId: ctx.parentId,
      },
      fileId,
    );
    const payload = await dbHomeworkStorageProvider.get({
      tenantId: ctx.tenant.tenantId,
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
    console.error("GET /api/portal/homework/files/[fileId]/download failed", error);
    return toPortalHomeworkErrorResponse(error);
  }
}
