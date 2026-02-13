/**
 * @state.route /api/admin/homework/files/[fileId]/download
 * @state.area api
 * @state.capabilities view:download
 * @state.notes Step 23.2 admin authenticated homework file download endpoint.
 */
// Admin homework download endpoint streams bytes from tenant-scoped storage with authenticated access only.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { toAttachmentContentDisposition } from "@/lib/homework/core";
import { toHomeworkErrorResponse } from "@/lib/homework/http";
import { requireRoleForHomeworkFileDownload } from "@/lib/homework/rbac";
import { dbHomeworkStorageProvider } from "@/lib/homework/storage/dbStorage";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type RouteProps = {
  params: Promise<{ fileId: string }>;
};

export async function GET(req: NextRequest, context: RouteProps) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) return roleResult;

    const { fileId: rawFileId } = await context.params;
    const fileId = rawFileId.trim();
    const tenantId = roleResult.tenant.tenantId;

    const allowedFile = await requireRoleForHomeworkFileDownload(
      tenantId,
      {
        role: roleResult.membership.role,
        userId: roleResult.user.id,
      },
      fileId,
    );
    const payload = await dbHomeworkStorageProvider.get({
      tenantId,
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
    console.error("GET /api/admin/homework/files/[fileId]/download failed", error);
    return toHomeworkErrorResponse(error);
  }
}
