/**
 * @state.route /[tenant]/api/tutor/homework/[id]/files
 * @state.area api
 * @state.capabilities create:homework_file
 * @state.notes Step 23.2 tutor homework upload endpoint.
 */
// Tutor homework upload endpoint enforces ownership scope and v1 slot policy (feedback-only by default).
import { NextRequest } from "next/server";

import { AuditActorType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { createHomeworkFileVersion } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { homeworkPolicy } from "@/lib/homework/policy";
import { requireTutorForHomeworkItem } from "@/lib/homework/rbac";
import { readHomeworkFileFromFormData } from "@/lib/homework/validation";
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

type TutorUploadSlot = "ASSIGNMENT" | "FEEDBACK";

function parseTutorUploadSlot(raw: FormDataEntryValue | null): TutorUploadSlot {
  if (typeof raw !== "string") {
    throw new HomeworkError(400, "ValidationError", "slot is required", {
      field: "slot",
    });
  }
  if (raw === "ASSIGNMENT" || raw === "FEEDBACK") {
    return raw;
  }
  throw new HomeworkError(400, "ValidationError", "Invalid slot", {
    field: "slot",
  });
}

export async function POST(request: NextRequest, context: RouteProps) {
  const requestId = readTutorRequestId(request);
  const { tenant, id } = await context.params;

  try {
    const homeworkItemId = id.trim();
    if (!homeworkItemId) {
      throw new HomeworkError(400, "ValidationError", "Invalid homework item id", {
        field: "id",
      });
    }

    const { formData, file } = await readHomeworkFileFromFormData(request);
    const slot = parseTutorUploadSlot(formData.get("slot"));
    const tutorCtx = await requireTutorContextOrThrow(tenant);
    const scopedItem = await requireTutorForHomeworkItem(
      tutorCtx.tenant.tenantId,
      tutorCtx.tutorUserId,
      homeworkItemId,
    );

    if (slot === "ASSIGNMENT" && !homeworkPolicy.tutorCanUploadAssignment) {
      throw new HomeworkError(403, "Forbidden", "Tutor assignment upload is disabled");
    }

    const created = await createHomeworkFileVersion({
      tenantId: tutorCtx.tenant.tenantId,
      homeworkItemId: scopedItem.id,
      slot,
      uploadedByRole: "TUTOR",
      uploadedByUserId: tutorCtx.tutorUserId,
      file,
      markSubmittedOnUpload: false,
      lockWhenReviewed: false,
    });

    await writeAuditEvent({
      tenantId: tutorCtx.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: tutorCtx.tutorUserId,
      actorDisplay: tutorCtx.session.user.name ?? tutorCtx.session.user.email ?? null,
      action: AUDIT_ACTIONS.HOMEWORK_FILE_UPLOADED,
      entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
      entityId: scopedItem.id,
      metadata: {
        slot: created.slot,
        version: created.version,
        sizeBytes: created.sizeBytes,
        mimeType: created.mimeType,
      },
      request,
    });

    if (created.statusFrom !== created.statusTo) {
      await writeAuditEvent({
        tenantId: tutorCtx.tenant.tenantId,
        actorType: AuditActorType.USER,
        actorId: tutorCtx.tutorUserId,
        actorDisplay: tutorCtx.session.user.name ?? tutorCtx.session.user.email ?? null,
        action: AUDIT_ACTIONS.HOMEWORK_STATUS_CHANGED,
        entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
        entityId: scopedItem.id,
        metadata: {
          fromStatus: created.statusFrom,
          toStatus: created.statusTo,
          sessionId: created.sessionId,
          source: "tutor",
        },
        request,
      });
    }

    return buildTutorOkResponse({
      status: 201,
      requestId,
      data: {
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
      console.error("POST /[tenant]/api/tutor/homework/[id]/files failed", error);
    }
    return normalizeTutorRouteError(error, requestId);
  }
}
