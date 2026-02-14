/**
 * @state.route /api/admin/notifications/mark-read-by-type
 * @state.area api
 * @state.capabilities update:bulk_mark_read
 * @state.notes Admin bulk mark-read endpoint scoped to selected notification type.
 */
// Admin bulk mark-read endpoint supports route-driven auto-clear for homework/requests badges.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Role } from "@/generated/prisma/client";
import { AuditActorType } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { markAllRead } from "@/lib/notifications/query";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const bodySchema = z
  .object({
    type: z.enum(["HOMEWORK", "REQUEST"]),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const access = await requireRole(req, ADMIN_ROLES);
    if (access instanceof Response) return access;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: { field: "body" } } },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path.join("."),
            })),
          },
        },
        { status: 400 },
      );
    }

    const markedReadCount = await markAllRead({
      tenantId: access.tenant.tenantId,
      recipientUserId: access.user.id,
      types: [parsed.data.type],
    });

    await writeAuditEvent({
      tenantId: access.tenant.tenantId,
      actorType: AuditActorType.USER,
      actorId: access.user.id,
      actorDisplay: access.user.name ?? access.user.email ?? null,
      action: AUDIT_ACTIONS.NOTIFICATION_BULK_MARKED_READ,
      entityType: AUDIT_ENTITY_TYPES.NOTIFICATION,
      entityId: null,
      metadata: {
        markedReadCount,
        role: access.user.role,
        types: [parsed.data.type],
      },
      request: req,
    });

    return NextResponse.json({
      ok: true,
      markedReadCount,
    });
  } catch (error) {
    console.error("POST /api/admin/notifications/mark-read-by-type failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
