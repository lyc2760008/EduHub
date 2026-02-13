/**
 * @state.route /api/sessions/bulk-cancel
 * @state.area api
 * @state.capabilities update:bulk_cancel
 * @state.notes Admin-only bulk session cancel endpoint with tenant-safe all-or-nothing behavior.
 */
// Bulk-cancel endpoint enforces tenant isolation, required reason code, and safe audit metadata.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuditActorType, type Role } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { toAuditErrorCode } from "@/lib/audit/errorCode";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const BULK_CANCEL_REASON_CODES = [
  "WEATHER",
  "TUTOR_UNAVAILABLE",
  "HOLIDAY",
  "LOW_ENROLLMENT",
  "OTHER",
] as const;

const BulkCancelSchema = z
  .object({
    sessionIds: z.array(z.string().trim().min(1)).min(1),
    reasonCode: z.enum(BULK_CANCEL_REASON_CODES),
  })
  .strict();

export async function POST(req: NextRequest) {
  let tenantId: string | null = null;
  let actorId: string | null = null;
  let actorDisplay: string | null = null;
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const scopedTenantId = ctx.tenant.tenantId;
    tenantId = scopedTenantId;
    actorId = ctx.user.id;
    actorDisplay = ctx.user.name ?? null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = BulkCancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const uniqueSessionIds = Array.from(new Set(parsed.data.sessionIds));
    if (uniqueSessionIds.length === 0) {
      return NextResponse.json(
        { error: "ValidationError", details: "sessionIds is required" },
        { status: 400 },
      );
    }

    const scopedSessions = await prisma.session.findMany({
      where: {
        tenantId: scopedTenantId,
        id: { in: uniqueSessionIds },
      },
      select: {
        id: true,
        startAt: true,
      },
    });

    if (scopedSessions.length !== uniqueSessionIds.length) {
      // All-or-nothing tenant safety: reject the full operation on any mismatch.
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const now = new Date();
    const startTimes = scopedSessions.map((session) => session.startAt.getTime());
    const minStart = startTimes.length ? new Date(Math.min(...startTimes)) : null;
    const maxStart = startTimes.length ? new Date(Math.max(...startTimes)) : null;

    const canceledCount = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.session.updateMany({
        where: {
          tenantId: scopedTenantId,
          id: { in: uniqueSessionIds },
        },
        data: {
          canceledAt: now,
          cancelReasonCode: parsed.data.reasonCode,
        },
      });
      return updateResult.count;
    });

    await writeAuditEvent({
      tenantId: scopedTenantId,
      actorType: AuditActorType.USER,
      actorId,
      actorDisplay,
      action: AUDIT_ACTIONS.SESSIONS_BULK_CANCELED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: "bulk",
      result: "SUCCESS",
      metadata: {
        canceledCount,
        reasonCode: parsed.data.reasonCode,
        ...(minStart ? { dateRangeFrom: minStart.toISOString() } : {}),
        ...(maxStart ? { dateRangeTo: maxStart.toISOString() } : {}),
      },
      request: req,
    });

    return NextResponse.json({
      ok: true,
      canceledCount,
    });
  } catch (error) {
    if (tenantId) {
      await writeAuditEvent({
        tenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.SESSIONS_BULK_CANCELED,
        entityType: AUDIT_ENTITY_TYPES.SESSION,
        entityId: "bulk",
        result: "FAILURE",
        metadata: {
          errorCode: toAuditErrorCode(error),
        },
        request: req,
      });
    }
    console.error("POST /api/sessions/bulk-cancel failed", error);
    return jsonError(500, "Internal server error");
  }
}
