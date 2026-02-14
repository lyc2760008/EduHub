/**
 * @state.route /api/portal/homework/[id]/files
 * @state.area api
 * @state.capabilities create:homework_file
 * @state.notes Step 23.2 parent homework submission upload endpoint.
 */
// Parent homework upload endpoint accepts submission-slot files only and transitions ASSIGNED -> SUBMITTED.
import { NextRequest, NextResponse } from "next/server";

import { AuditActorType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { createHomeworkFileVersion } from "@/lib/homework/core";
import { prisma } from "@/lib/db/prisma";
import { HomeworkError } from "@/lib/homework/errors";
import { requireParentForHomeworkItem } from "@/lib/homework/rbac";
import { readHomeworkFileFromFormData } from "@/lib/homework/validation";
import { emitHomeworkSubmittedNotification } from "@/lib/notifications/events";
import { getRequestId } from "@/lib/observability/request";
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

function parseSubmissionSlot(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw !== "SUBMISSION") {
    throw new HomeworkError(400, "ValidationError", "Invalid slot", {
      field: "slot",
      allowed: ["SUBMISSION"],
    });
  }
  return raw;
}

export async function POST(req: NextRequest, context: RouteProps) {
  try {
    const { id: rawId } = await context.params;
    const homeworkItemId = rawId.trim();
    if (!homeworkItemId) {
      return buildPortalError(400, "VALIDATION_ERROR", { field: "id" });
    }

    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;

    const { formData, file } = await readHomeworkFileFromFormData(req);
    parseSubmissionSlot(formData.get("slot"));

    const scopedItem = await requireParentForHomeworkItem(
      ctx.tenant.tenantId,
      ctx.parentId,
      homeworkItemId,
    );
    const hasAssignment = await prisma.homeworkFile.findFirst({
      where: {
        tenantId: ctx.tenant.tenantId,
        homeworkItemId: scopedItem.id,
        slot: "ASSIGNMENT",
      },
      select: { id: true },
    });
    if (!hasAssignment) {
      throw new HomeworkError(
        409,
        "Conflict",
        "Assignment is required before parent submission",
        {
          rule: "ASSIGNMENT_REQUIRED",
        },
      );
    }

    const created = await createHomeworkFileVersion({
      tenantId: ctx.tenant.tenantId,
      homeworkItemId: scopedItem.id,
      slot: "SUBMISSION",
      uploadedByRole: "PARENT",
      // Parent identities live in the Parent table; HomeworkFile.uploadedByUserId references User.id.
      uploadedByUserId: null,
      file,
      // Parent submissions move homework into review queue in v1.
      markSubmittedOnUpload: true,
      // Parent replace is allowed only before REVIEWED in v1.
      lockWhenReviewed: true,
    });

    // Session tutor lookup is scoped by tenant/session; emit helper fans out to tutor + admin recipients.
    const session = await prisma.session.findFirst({
      where: {
        tenantId: ctx.tenant.tenantId,
        id: created.sessionId,
      },
      select: {
        tutorId: true,
      },
    });
    if (created.statusFrom !== created.statusTo && created.statusTo === "SUBMITTED") {
      await emitHomeworkSubmittedNotification({
        tenantId: ctx.tenant.tenantId,
        homeworkItemId: scopedItem.id,
        tutorUserId: session?.tutorId ?? null,
        createdByUserId: ctx.parentId,
        correlationId: getRequestId(req),
      });
    }

    await writeAuditEvent({
      tenantId: ctx.tenant.tenantId,
      actorType: AuditActorType.PARENT,
      actorId: ctx.parentId,
      actorDisplay: ctx.parent.email,
      action: AUDIT_ACTIONS.HOMEWORK_FILE_UPLOADED,
      entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
      entityId: scopedItem.id,
      metadata: {
        slot: created.slot,
        version: created.version,
        sizeBytes: created.sizeBytes,
        mimeType: created.mimeType,
      },
      request: req,
    });

    if (created.statusFrom !== created.statusTo) {
      await writeAuditEvent({
        tenantId: ctx.tenant.tenantId,
        actorType: AuditActorType.PARENT,
        actorId: ctx.parentId,
        actorDisplay: ctx.parent.email,
        action: AUDIT_ACTIONS.HOMEWORK_STATUS_CHANGED,
        entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
        entityId: scopedItem.id,
        metadata: {
          fromStatus: created.statusFrom,
          toStatus: created.statusTo,
          sessionId: created.sessionId,
          source: "parent",
        },
        request: req,
      });
    }

    return NextResponse.json(
      {
        itemId: scopedItem.id,
        file: {
          id: created.id,
          slot: created.slot,
          version: created.version,
          sizeBytes: created.sizeBytes,
          mimeType: created.mimeType,
          uploadedAt: created.uploadedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/portal/homework/[id]/files failed", error);
    return toPortalHomeworkErrorResponse(error);
  }
}
