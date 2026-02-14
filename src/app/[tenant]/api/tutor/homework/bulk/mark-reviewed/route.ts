/**
 * @state.route /[tenant]/api/tutor/homework/bulk/mark-reviewed
 * @state.area api
 * @state.capabilities update:bulk_mark_reviewed
 * @state.notes Step 23.2 tutor bulk review transition endpoint.
 */
// Tutor bulk review endpoint transitions only tutor-owned SUBMITTED items and reports summary counts.
import { NextRequest } from "next/server";
import { z } from "zod";

import { AuditActorType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { markHomeworkItemsReviewed } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { homeworkPolicy } from "@/lib/homework/policy";
import { emitHomeworkReviewedNotifications } from "@/lib/notifications/events";
import { type TutorDataErrorCode, TutorDataError } from "@/lib/tutor/data";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";
import {
  buildTutorErrorResponse,
  buildTutorOkResponse,
  normalizeTutorRouteError,
  readTutorRequestId,
} from "@/lib/tutor/http";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    homeworkItemIds: z.array(z.string().trim().min(1)).min(1).max(500),
  })
  .strict();

type RouteProps = {
  params: Promise<{ tenant: string }>;
};

export async function POST(request: NextRequest, context: RouteProps) {
  const requestId = readTutorRequestId(request);
  const { tenant } = await context.params;

  try {
    const tutorCtx = await requireTutorContextOrThrow(tenant);
    const parsed = bodySchema.parse(await request.json());

    const result = await markHomeworkItemsReviewed({
      tenantId: tutorCtx.tenant.tenantId,
      homeworkItemIds: parsed.homeworkItemIds,
      tutorUserId: tutorCtx.tutorUserId,
      requireFeedbackFile: homeworkPolicy.requireFeedbackFileToMarkReviewed,
    });

    // Reviewed transitions fan out parent notifications per homework item/student linkage.
    await emitHomeworkReviewedNotifications({
      tenantId: tutorCtx.tenant.tenantId,
      reviewedItems: result.changedItems.map((item) => ({
        homeworkItemId: item.id,
        studentId: item.studentId,
      })),
      createdByUserId: tutorCtx.tutorUserId,
      correlationId: requestId,
    });

    await Promise.all(
      result.changedItems.map((item) =>
        writeAuditEvent({
          tenantId: tutorCtx.tenant.tenantId,
          actorType: AuditActorType.USER,
          actorId: tutorCtx.tutorUserId,
          actorDisplay: tutorCtx.session.user.name ?? tutorCtx.session.user.email ?? null,
          action: AUDIT_ACTIONS.HOMEWORK_STATUS_CHANGED,
          entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
          entityId: item.id,
          metadata: {
            fromStatus: item.fromStatus,
            toStatus: item.toStatus,
            sessionId: item.sessionId,
            source: "tutor",
          },
          request,
        }),
      ),
    );

    await writeAuditEvent({
      tenantId: tutorCtx.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: tutorCtx.tutorUserId,
      actorDisplay: tutorCtx.session.user.name ?? tutorCtx.session.user.email ?? null,
      action: AUDIT_ACTIONS.HOMEWORK_BULK_REVIEWED,
      entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
      entityId: null,
      metadata: {
        itemsSelectedCount: result.selectedCount,
        reviewedCount: result.reviewedCount,
        skippedNotSubmittedCount: result.skippedNotSubmittedCount,
      },
      request,
    });

    return buildTutorOkResponse({
      requestId,
      data: {
        ok: true,
        reviewedCount: result.reviewedCount,
        skippedNotSubmittedCount: result.skippedNotSubmittedCount,
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
        "POST /[tenant]/api/tutor/homework/bulk/mark-reviewed failed",
        error,
      );
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
