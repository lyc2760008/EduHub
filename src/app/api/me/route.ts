import { NextResponse, type NextRequest } from "next/server";

import { requireTenantMembership } from "@/lib/rbac";

export const runtime = "nodejs";

// Returns the authenticated user, their membership, and the resolved tenant.
export async function GET(request: NextRequest) {
  const ctx = await requireTenantMembership(request);
  if (ctx instanceof Response) return ctx;

  return NextResponse.json({
    user: ctx.user,
    membership: ctx.membership,
    tenant: ctx.tenant,
  });
}
