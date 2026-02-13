/**
 * @state.route /api/admin/sessions/resources/bulk-apply
 * @state.area api
 * @state.capabilities update:bulk_apply_session_resources
 * @state.notes Step 22.9 admin bulk apply endpoint for session resources.
 */
// Admin bulk apply endpoint validates resource links and returns duplicate-safe summary counts.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Role } from "@/generated/prisma/client";
import { AuditActorType, SessionResourceType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { bulkApplyResources, SessionResourceError } from "@/lib/resources/sessionResources";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const bulkApplySchema = z
  .object({
    sessionIds: z.array(z.string().trim().min(1)).min(1),
    resources: z
      .array(
        z
          .object({
            title: z.string(),
            url: z.string(),
            type: z.nativeEnum(SessionResourceType),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

function toErrorResponse(error: unknown) {
  if (error instanceof SessionResourceError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "InternalError",
        message: "Internal server error",
        details: {},
      },
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      throw new SessionResourceError(400, "ValidationError", "Invalid JSON body", {
        field: "body",
      });
    }

    const parsed = bulkApplySchema.safeParse(body);
    if (!parsed.success) {
      throw new SessionResourceError(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const summary = await bulkApplyResources({
      tenantId: ctx.tenant.tenantId,
      sessionIds: parsed.data.sessionIds,
      resources: parsed.data.resources,
      actor: {
        role: ctx.membership.role,
        userId: ctx.user.id,
      },
    });

    await writeAuditEvent({
      tenantId: ctx.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.name ?? null,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_BULK_APPLIED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: "bulk",
      metadata: {
        sessionCount: summary.sessionsProcessed,
        resourcesAttempted: summary.resourcesAttempted,
        resourcesCreated: summary.resourcesCreated,
        duplicatesSkipped: summary.duplicatesSkipped,
      },
      request: req,
    });

    return NextResponse.json(summary);
  } catch (error) {
    // Security: never log request bodies because URLs are user-supplied.
    console.error("POST /api/admin/sessions/resources/bulk-apply failed", error);
    return toErrorResponse(error);
  }
}
