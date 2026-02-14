/**
 * @state.route /api/portal/notifications/mark-all-read
 * @state.area api
 * @state.capabilities update:bulk_mark_read
 * @state.notes Step 23.3 idempotent mark-all-read endpoint for parent+tutor notifications.
 */
// Parent+tutor mark-all endpoint updates unread recipient rows only and audits counts without IDs.
import { NextRequest, NextResponse } from "next/server";

import { AuditActorType } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { requireNotificationPortalAccess } from "@/lib/notifications/access";
import { markAllRead } from "@/lib/notifications/query";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const access = await requireNotificationPortalAccess(req);
    if (access instanceof Response) return access;

    const markedReadCount = await markAllRead({
      tenantId: access.tenantId,
      recipientUserId: access.recipientUserId,
    });

    await writeAuditEvent({
      tenantId: access.tenantId,
      actorType: access.role === "Parent" ? AuditActorType.PARENT : AuditActorType.USER,
      actorId: access.recipientUserId,
      actorDisplay: null,
      action: AUDIT_ACTIONS.NOTIFICATION_BULK_MARKED_READ,
      entityType: AUDIT_ENTITY_TYPES.NOTIFICATION,
      entityId: null,
      metadata: {
        markedReadCount,
        role: access.role,
      },
      request: req,
    });

    return NextResponse.json({
      ok: true,
      markedReadCount,
    });
  } catch (error) {
    console.error("POST /api/portal/notifications/mark-all-read failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
