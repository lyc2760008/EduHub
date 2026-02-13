/**
 * @state.route /api/admin/announcements/[id]/archive
 * @state.area api
 * @state.capabilities update:announcement_archive
 * @state.notes Step 22.8 archive endpoint (DRAFT/PUBLISHED -> ARCHIVED; idempotent on already archived).
 */
// Admin archive endpoint transitions announcement lifecycle to archived with tenant-safe RBAC and audit coverage.
import { NextRequest, NextResponse } from "next/server";

import { AuditActorType, type Role } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { toAdminDetailDTO } from "@/lib/announcements/dto";
import {
  AnnouncementApiError,
  normalizeAnnouncementRoleError,
  toAnnouncementErrorResponse,
} from "@/lib/announcements/http";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteProps) {
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

    const current = await prisma.announcement.findFirst({
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

    if (!current) {
      throw new AnnouncementApiError(404, "NotFound");
    }

    if (current.status === "ARCHIVED") {
      return NextResponse.json({
        item: toAdminDetailDTO(current),
      });
    }

    const updated = await prisma.announcement.update({
      where: { id: current.id },
      data: {
        status: "ARCHIVED",
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
      action: AUDIT_ACTIONS.ANNOUNCEMENT_ARCHIVED,
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
      console.error("POST /api/admin/announcements/[id]/archive failed", error);
    }
    return toAnnouncementErrorResponse(error);
  }
}
