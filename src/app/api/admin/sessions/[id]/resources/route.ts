/**
 * @state.route /api/admin/sessions/[id]/resources
 * @state.area api
 * @state.capabilities view:list, create:session_resource
 * @state.notes Step 22.9 admin session resources list/create endpoint.
 */
// Admin session-resources endpoint enforces tenant scope, RBAC, and URL-safe validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Role } from "@/generated/prisma/client";
import { AuditActorType, SessionResourceType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import {
  assertCanAccessSessionResources,
  createSessionResource,
  listSessionResources,
  SessionResourceError,
} from "@/lib/resources/sessionResources";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const createResourceSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    type: z.nativeEnum(SessionResourceType),
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

export async function GET(req: NextRequest, context: RouteProps) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;

    const tenantId = ctx.tenant.tenantId;
    const { id: rawSessionId } = await context.params;
    const sessionId = rawSessionId.trim();
    if (!sessionId) {
      throw new SessionResourceError(400, "ValidationError", "Invalid session id", {
        field: "id",
      });
    }

    await assertCanAccessSessionResources({
      tenantId,
      actor: {
        role: ctx.membership.role,
        userId: ctx.user.id,
      },
      sessionId,
      mode: "read",
    });

    const items = await listSessionResources({
      tenantId,
      sessionId,
    });

    return NextResponse.json({ items });
  } catch (error) {
    // Security: never log request bodies because URLs are user-supplied.
    console.error("GET /api/admin/sessions/[id]/resources failed", error);
    return toErrorResponse(error);
  }
}

export async function POST(req: NextRequest, context: RouteProps) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;

    const tenantId = ctx.tenant.tenantId;
    const { id: rawSessionId } = await context.params;
    const sessionId = rawSessionId.trim();
    if (!sessionId) {
      throw new SessionResourceError(400, "ValidationError", "Invalid session id", {
        field: "id",
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

    const parsed = createResourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new SessionResourceError(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    await assertCanAccessSessionResources({
      tenantId,
      actor: {
        role: ctx.membership.role,
        userId: ctx.user.id,
      },
      sessionId,
      mode: "write",
    });

    const item = await createSessionResource({
      tenantId,
      sessionId,
      title: parsed.data.title,
      url: parsed.data.url,
      type: parsed.data.type,
      createdByUserId: ctx.user.id,
      createdByRole: "ADMIN",
    });

    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.name ?? null,
      action: AUDIT_ACTIONS.SESSION_RESOURCE_CREATED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: item.id,
      metadata: {
        sessionId,
        type: item.type,
      },
      request: req,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    // Security: never log request bodies because URLs are user-supplied.
    console.error("POST /api/admin/sessions/[id]/resources failed", error);
    return toErrorResponse(error);
  }
}
