/**
 * @state.route /api/admin/homework/bulk/mark-reviewed
 * @state.area api
 * @state.capabilities update:bulk_mark_reviewed
 * @state.notes Step 23.2 admin bulk review transition endpoint.
 */
// Admin bulk review endpoint transitions SUBMITTED items to REVIEWED with tenant-scoped summary output.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Role } from "@/generated/prisma/client";
import { AuditActorType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { markHomeworkItemsReviewed } from "@/lib/homework/core";
import { toHomeworkErrorResponse } from "@/lib/homework/http";
import { homeworkPolicy } from "@/lib/homework/policy";
import { emitHomeworkReviewedNotifications } from "@/lib/notifications/events";
import { getRequestId } from "@/lib/observability/request";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const bodySchema = z
  .object({
    homeworkItemIds: z.array(z.string().trim().min(1)).min(1).max(500),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) return roleResult;

    const parsed = bodySchema.parse(await req.json());
    const result = await markHomeworkItemsReviewed({
      tenantId: roleResult.tenant.tenantId,
      homeworkItemIds: parsed.homeworkItemIds,
      requireFeedbackFile: homeworkPolicy.requireFeedbackFileToMarkReviewed,
    });

    // Reviewed transitions fan out parent notifications per homework item/student linkage.
    await emitHomeworkReviewedNotifications({
      tenantId: roleResult.tenant.tenantId,
      reviewedItems: result.changedItems.map((item) => ({
        homeworkItemId: item.id,
        studentId: item.studentId,
      })),
      createdByUserId: roleResult.user.id,
      correlationId: getRequestId(req),
    });

    await Promise.all(
      result.changedItems.map((item) =>
        writeAuditEvent({
          tenantId: roleResult.tenant.tenantId,
          actorType: AuditActorType.USER,
          actorId: roleResult.user.id,
          actorDisplay: roleResult.user.name ?? roleResult.user.email ?? null,
          action: AUDIT_ACTIONS.HOMEWORK_STATUS_CHANGED,
          entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
          entityId: item.id,
          metadata: {
            fromStatus: item.fromStatus,
            toStatus: item.toStatus,
            sessionId: item.sessionId,
            source: "admin",
          },
          request: req,
        }),
      ),
    );

    await writeAuditEvent({
      tenantId: roleResult.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: roleResult.user.id,
      actorDisplay: roleResult.user.name ?? roleResult.user.email ?? null,
      action: AUDIT_ACTIONS.HOMEWORK_BULK_REVIEWED,
      entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
      entityId: null,
      metadata: {
        itemsSelectedCount: result.selectedCount,
        reviewedCount: result.reviewedCount,
        skippedNotSubmittedCount: result.skippedNotSubmittedCount,
      },
      request: req,
    });

    return NextResponse.json({
      ok: true,
      reviewedCount: result.reviewedCount,
      skippedNotSubmittedCount: result.skippedNotSubmittedCount,
    });
  } catch (error) {
    console.error("POST /api/admin/homework/bulk/mark-reviewed failed", error);
    return toHomeworkErrorResponse(error);
  }
}
