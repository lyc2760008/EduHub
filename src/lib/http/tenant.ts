import { NextRequest, NextResponse } from "next/server";

export function requireTenantId(
  req: NextRequest
): string | NextResponse<unknown> {
  const tenantId = req.headers.get("x-tenant-id")?.trim();
  if (!tenantId) {
    return NextResponse.json(
      { error: "x-tenant-id header is required" },
      { status: 400 }
    );
  }
  return tenantId;
}
