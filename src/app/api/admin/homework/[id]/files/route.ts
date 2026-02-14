/**
 * @state.route /api/admin/homework/[id]/files
 * @state.area api
 * @state.capabilities create:homework_file
 * @state.notes Step 23.2 admin homework file upload endpoint (ASSIGNMENT/FEEDBACK).
 */
// Admin homework upload endpoint supports assignment/feedback slots with file versioning and tenant-scoped access.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { AuditActorType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { createHomeworkFileVersion } from "@/lib/homework/core";
import { HomeworkError } from "@/lib/homework/errors";
import { toHomeworkErrorResponse } from "@/lib/homework/http";
import { readHomeworkFileFromFormData } from "@/lib/homework/validation";
import { emitHomeworkUploadedForParentsNotification } from "@/lib/notifications/events";
import { getRequestId } from "@/lib/observability/request";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type RouteProps = {
  params: Promise<{ id: string }>;
};

type AdminUploadSlot = "ASSIGNMENT" | "FEEDBACK";

function parseAdminUploadSlot(raw: FormDataEntryValue | null): AdminUploadSlot {
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

async function resolveHomeworkItemForUpload(input: {
  tenantId: string;
  homeworkItemIdFromPath: string;
  slot: AdminUploadSlot;
  formData: FormData;
  createdByUserId: string;
}) {
  const existing = await prisma.homeworkItem.findFirst({
    where: {
      id: input.homeworkItemIdFromPath,
      tenantId: input.tenantId,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  if (input.slot !== "ASSIGNMENT") {
    throw new HomeworkError(404, "NotFound", "Homework item not found");
  }

  const sessionId = input.formData.get("sessionId");
  const studentId = input.formData.get("studentId");
  if (typeof sessionId !== "string" || typeof studentId !== "string") {
    throw new HomeworkError(
      400,
      "ValidationError",
      "sessionId and studentId are required when creating assignment",
      { field: "sessionId" },
    );
  }

  const scopedRosterRow = await prisma.sessionStudent.findFirst({
    where: {
      tenantId: input.tenantId,
      sessionId: sessionId.trim(),
      studentId: studentId.trim(),
    },
    select: { id: true },
  });

  if (!scopedRosterRow) {
    throw new HomeworkError(404, "NotFound", "Session/student pair not found");
  }

  const now = new Date();
  const created = await prisma.homeworkItem.upsert({
    where: {
      tenantId_sessionId_studentId: {
        tenantId: input.tenantId,
        sessionId: sessionId.trim(),
        studentId: studentId.trim(),
      },
    },
    create: {
      tenantId: input.tenantId,
      sessionId: sessionId.trim(),
      studentId: studentId.trim(),
      status: "ASSIGNED",
      assignedAt: now,
      createdByUserId: input.createdByUserId,
    },
    update: {},
    select: { id: true },
  });

  return created.id;
}

export async function POST(req: NextRequest, context: RouteProps) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) return roleResult;

    const { id: rawId } = await context.params;
    const homeworkItemIdFromPath = rawId.trim();
    if (!homeworkItemIdFromPath) {
      throw new HomeworkError(400, "ValidationError", "Invalid homework item id", {
        field: "id",
      });
    }

    const { formData, file } = await readHomeworkFileFromFormData(req);
    const slot = parseAdminUploadSlot(formData.get("slot"));
    const resolvedHomeworkItemId = await resolveHomeworkItemForUpload({
      tenantId: roleResult.tenant.tenantId,
      homeworkItemIdFromPath,
      slot,
      formData,
      createdByUserId: roleResult.user.id,
    });

    const created = await createHomeworkFileVersion({
      tenantId: roleResult.tenant.tenantId,
      homeworkItemId: resolvedHomeworkItemId,
      slot,
      uploadedByRole: "ADMIN",
      uploadedByUserId: roleResult.user.id,
      file,
      markSubmittedOnUpload: false,
      lockWhenReviewed: false,
    });

    // Staff-uploaded homework artifacts notify linked parents for homework-tab badges in the parent portal.
    await emitHomeworkUploadedForParentsNotification({
      tenantId: roleResult.tenant.tenantId,
      homeworkItemId: resolvedHomeworkItemId,
      studentId: created.studentId,
      createdByUserId: roleResult.user.id,
      correlationId: getRequestId(req),
    });

    await writeAuditEvent({
      tenantId: roleResult.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: roleResult.user.id,
      actorDisplay: roleResult.user.name ?? roleResult.user.email ?? null,
      action: AUDIT_ACTIONS.HOMEWORK_FILE_UPLOADED,
      entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
      entityId: resolvedHomeworkItemId,
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
        tenantId: roleResult.tenant.tenantId,
        actorType: AuditActorType.USER,
        actorId: roleResult.user.id,
        actorDisplay: roleResult.user.name ?? roleResult.user.email ?? null,
        action: AUDIT_ACTIONS.HOMEWORK_STATUS_CHANGED,
        entityType: AUDIT_ENTITY_TYPES.HOMEWORK,
        entityId: resolvedHomeworkItemId,
        metadata: {
          fromStatus: created.statusFrom,
          toStatus: created.statusTo,
          sessionId: created.sessionId,
          source: "admin",
        },
        request: req,
      });
    }

    return NextResponse.json(
      {
        itemId: resolvedHomeworkItemId,
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
    console.error("POST /api/admin/homework/[id]/files failed", error);
    return toHomeworkErrorResponse(error);
  }
}
