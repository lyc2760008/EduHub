/**
 * @state.route /api/admin/announcements/[id]
 * @state.area api
 * @state.capabilities view:detail, update:announcement
 * @state.notes Step 22.8 admin announcement detail/update endpoint with draft-only content edits in v1.
 */
// Admin announcement detail/update endpoint with tenant-safe RBAC and conservative edit rules for published records.
import { NextRequest, NextResponse } from "next/server";

import { AuditActorType, type Role } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import {
  toAdminDetailDTO,
} from "@/lib/announcements/dto";
import {
  AnnouncementApiError,
  normalizeAnnouncementRoleError,
  toAnnouncementErrorResponse,
} from "@/lib/announcements/http";
import { validateAnnouncementTitleBody } from "@/lib/announcements/validate";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const V1_SCOPE = "TENANT_WIDE";

type RouteProps = {
  params: Promise<{ id: string }>;
};

async function getAnnouncementForTenantOrThrow(tenantId: string, id: string) {
  const item = await prisma.announcement.findFirst({
    where: {
      id,
      tenantId,
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          reads: true,
        },
      },
    },
  });

  if (!item) {
    throw new AnnouncementApiError(404, "NotFound");
  }

  return item;
}

export async function GET(req: NextRequest, context: RouteProps) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeAnnouncementRoleError(roleResult);
    }
    const tenantId = roleResult.tenant.tenantId;

    const { id: rawId } = await context.params;
    const id = rawId.trim();
    if (!id) {
      throw new AnnouncementApiError(400, "ValidationError", {
        field: "id",
      });
    }

    const announcement = await getAnnouncementForTenantOrThrow(tenantId, id);
    return NextResponse.json({
      item: toAdminDetailDTO(announcement),
    });
  } catch (error) {
    if (!(error instanceof AnnouncementApiError)) {
      console.error("GET /api/admin/announcements/[id] failed", error);
    }
    return toAnnouncementErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest, context: RouteProps) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeAnnouncementRoleError(roleResult);
    }
    const tenantId = roleResult.tenant.tenantId;

    const { id: rawId } = await context.params;
    const id = rawId.trim();
    if (!id) {
      throw new AnnouncementApiError(400, "ValidationError", {
        field: "id",
      });
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      throw new AnnouncementApiError(400, "ValidationError", {
        field: "body",
        reason: "INVALID_JSON",
      });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AnnouncementApiError(400, "ValidationError", {
        field: "body",
        reason: "INVALID_OBJECT",
      });
    }

    const payload = body as Record<string, unknown>;
    const hasTitle = Object.prototype.hasOwnProperty.call(payload, "title");
    const hasBody = Object.prototype.hasOwnProperty.call(payload, "body");
    const hasScope = Object.prototype.hasOwnProperty.call(payload, "scope");
    if (!hasTitle && !hasBody && !hasScope) {
      throw new AnnouncementApiError(400, "ValidationError", {
        reason: "NO_FIELDS_PROVIDED",
      });
    }

    const current = await getAnnouncementForTenantOrThrow(tenantId, id);

    if ((hasTitle || hasBody) && current.status !== "DRAFT") {
      throw new AnnouncementApiError(400, "ValidationError", {
        reason: "CONTENT_EDIT_NOT_ALLOWED",
        status: current.status,
      });
    }

    if (hasScope && payload.scope !== V1_SCOPE) {
      throw new AnnouncementApiError(400, "ValidationError", {
        field: "scope",
        reason: "UNSUPPORTED_SCOPE",
      });
    }

    let nextTitle = current.title;
    let nextBody = current.body;
    if (hasTitle || hasBody) {
      const validated = validateAnnouncementTitleBody({
        title: hasTitle ? payload.title : current.title,
        body: hasBody ? payload.body : current.body,
      });
      if (!validated.ok) {
        throw new AnnouncementApiError(400, "ValidationError", {
          issues: validated.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.join("."),
          })),
        });
      }
      nextTitle = validated.data.title;
      nextBody = validated.data.body;
    }

    const updated = await prisma.announcement.update({
      where: { id: current.id },
      data: {
        ...(hasTitle ? { title: nextTitle } : {}),
        ...(hasBody ? { body: nextBody } : {}),
        ...(hasScope ? { scope: V1_SCOPE } : {}),
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            reads: true,
          },
        },
      },
    });

    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: roleResult.user.id,
      actorDisplay: roleResult.user.name ?? null,
      action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
      entityType: AUDIT_ENTITY_TYPES.ANNOUNCEMENT,
      entityId: updated.id,
      result: "SUCCESS",
      metadata: {
        fromStatus: current.status,
        toStatus: updated.status,
        hasPublishedAt: Boolean(updated.publishedAt),
      },
      request: req,
    });

    return NextResponse.json({
      item: toAdminDetailDTO(updated),
    });
  } catch (error) {
    if (!(error instanceof AnnouncementApiError)) {
      // Security: never log raw title/body input; only endpoint metadata is logged.
      console.error("PATCH /api/admin/announcements/[id] failed", error);
    }
    return toAnnouncementErrorResponse(error);
  }
}
