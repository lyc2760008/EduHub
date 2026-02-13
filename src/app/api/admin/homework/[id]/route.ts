/**
 * @state.route /api/admin/homework/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Step 23.2 admin homework detail endpoint with versioned file metadata.
 */
// Admin homework detail endpoint returns tenant-scoped metadata only (no bytes inline).
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { getHomeworkItemDetail } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { toHomeworkErrorResponse } from "@/lib/homework/http";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteProps) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) return roleResult;

    const { id: rawId } = await context.params;
    const homeworkItemId = rawId.trim();
    if (!homeworkItemId) {
      throw new HomeworkError(400, "ValidationError", "Invalid homework item id", {
        field: "id",
      });
    }

    const detail = await getHomeworkItemDetail(
      roleResult.tenant.tenantId,
      homeworkItemId,
    );

    return NextResponse.json({
      ...detail,
      files: detail.files.map((file) => ({
        ...file,
        downloadUrl: `/api/admin/homework/files/${file.id}/download`,
      })),
      filesBySlot: {
        ASSIGNMENT: detail.filesBySlot.ASSIGNMENT.map((file) => ({
          ...file,
          downloadUrl: `/api/admin/homework/files/${file.id}/download`,
        })),
        SUBMISSION: detail.filesBySlot.SUBMISSION.map((file) => ({
          ...file,
          downloadUrl: `/api/admin/homework/files/${file.id}/download`,
        })),
        FEEDBACK: detail.filesBySlot.FEEDBACK.map((file) => ({
          ...file,
          downloadUrl: `/api/admin/homework/files/${file.id}/download`,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/admin/homework/[id] failed", error);
    return toHomeworkErrorResponse(error);
  }
}

