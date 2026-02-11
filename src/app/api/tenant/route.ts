/**
 * @state.route /api/tenant
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { resolveTenant } from "@/lib/tenant/resolveTenant";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (tenant instanceof NextResponse) return tenant;

  return NextResponse.json({
    tenant: {
      id: tenant.tenantId,
      slug: tenant.tenantSlug,
      name: tenant.tenantName,
    },
  });
}
