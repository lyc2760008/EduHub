/**
 * @state.route /api/admin/resources/[resourceId]
 * @state.area api
 * @state.capabilities update:session_resource, delete:session_resource
 * @state.notes Step 22.9 admin session resources update/delete endpoint.
 */
// Admin resource mutation endpoint keeps updates/deletes tenant-scoped and URL-safe.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Role } from "@/generated/prisma/client";
import { AuditActorType, SessionResourceType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import {
  deleteSessionResource,
  SessionResourceError,
  updateSessionResource,
} from "@/lib/resources/sessionResources";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ resourceId: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const patchSchema = z
  .object({
    title: z.string().optional(),
    url: z.string().optional(),
    type: z.nativeEnum(SessionResourceType).optional(),
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

export async function PATCH(req: NextRequest, context: RouteProps) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;

    const tenantId = ctx.tenant.tenantId;
    const { resourceId: rawResourceId } = await context.params;
    const resourceId = rawResourceId.trim();
    if (!resourceId) {
      throw new SessionResourceError(400, "ValidationError", "Invalid resource id", {
        field: "resourceId",
      });
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      throw new SessionResourceError(400, "ValidationError", "Invalid JSON body", {
        field: "body",
      });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new SessionResourceError(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const item = await updateSessionResource({
      tenantId,
      resourceId,
      title: parsed.data.title,
      url: parsed.data.url,
      type: parsed.data.type,
    });

    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.name ?? null,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_UPDATED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: resourceId,
      metadata: {
        resourceId,
        sessionId: item.sessionId,
      },
      request: req,
    });

    return NextResponse.json({ item });
  } catch (error) {
    // Security: never log request bodies because URLs are user-supplied.
    console.error("PATCH /api/admin/resources/[resourceId] failed", error);
    return toErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteProps) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;

    const tenantId = ctx.tenant.tenantId;
    const { resourceId: rawResourceId } = await context.params;
    const resourceId = rawResourceId.trim();
    if (!resourceId) {
      throw new SessionResourceError(400, "ValidationError", "Invalid resource id", {
        field: "resourceId",
      });
    }

    const deleted = await deleteSessionResource({
      tenantId,
      resourceId,
    });

    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.name ?? null,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_DELETED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: deleted.id,
      metadata: {
        resourceId: deleted.id,
        sessionId: deleted.sessionId,
      },
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/resources/[resourceId] failed", error);
    return toErrorResponse(error);
  }
}
