// Parent portal endpoint to dismiss the first-login welcome card.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { buildPortalError, requirePortalParent } from "@/lib/portal/parent";

export const runtime = "nodejs";

const DismissWelcomeSchema = z.object({}).strict();

export async function POST(req: NextRequest) {
  try {
    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown = {};
    try {
      const rawBody = await req.text();
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return buildPortalError(400, "VALIDATION_ERROR", {
        reason: "INVALID_JSON",
      });
    }

    const parsed = DismissWelcomeSchema.safeParse(body);
    if (!parsed.success) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        issues: parsed.error.issues,
      });
    }

    // Update welcome flag only for the authenticated parent within this tenant.
    const result = await prisma.parent.updateMany({
      where: { tenantId, id: ctx.parentId },
      data: { hasSeenWelcome: true },
    });

    if (result.count === 0) {
      return buildPortalError(404, "NOT_FOUND");
    }

    return NextResponse.json({ hasSeenWelcome: true });
  } catch (error) {
    console.error("POST /api/portal/onboarding/dismiss failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
