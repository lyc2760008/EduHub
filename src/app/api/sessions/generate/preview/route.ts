/**
 * @state.route /api/sessions/generate/preview
 * @state.area api
 * @state.capabilities create:generate
 * @state.notes Preview endpoint uses shared generation planning logic without writing session rows.
 */
// Preview endpoint for recurring generation summary; uses shared planner and performs no writes.
import { NextRequest, NextResponse } from "next/server";

import { type Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/rbac";
import {
  GeneratePlanError,
  GenerateSessionsInputSchema,
  planGenerateSessions,
} from "@/lib/sessions/generate/planGenerateSessions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = GenerateSessionsInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const plan = await planGenerateSessions({
      tenantId,
      actorId: ctx.user.id,
      data: parsed.data,
    });

    return NextResponse.json({
      range: {
        from: plan.range.from.toISOString(),
        to: plan.range.to.toISOString(),
      },
      wouldCreateCount: plan.wouldCreateCount,
      wouldSkipDuplicateCount: plan.wouldSkipDuplicateCount,
      wouldConflictCount: plan.wouldConflictCount,
      duplicatesSummary: plan.duplicatesSummary,
      conflictsSummary: plan.conflictsSummary,
      zoomLinkApplied: plan.zoomLinkApplied,
    });
  } catch (error) {
    if (error instanceof GeneratePlanError) {
      return NextResponse.json(
        { error: "ValidationError", details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/sessions/generate/preview failed", error);
    return NextResponse.json({ error: "InternalError" }, { status: 500 });
  }
}
