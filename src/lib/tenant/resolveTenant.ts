import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { getTenantSlugFromRequest } from "@/lib/tenant/request";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
};

export async function resolveTenant(
  req: NextRequest
): Promise<TenantContext | NextResponse> {
  const headerTenantId = req.headers.get("x-tenant-id")?.trim();
  if (headerTenantId) {
    const tenantById = await prisma.tenant.findUnique({
      where: { id: headerTenantId },
    });
    if (!tenantById) {
      return jsonError(404, "Tenant not found");
    }
    return {
      tenantId: tenantById.id,
      tenantSlug: tenantById.slug,
      tenantName: tenantById.name,
    };
  }

  const slug = getTenantSlugFromRequest(req);
  if (!slug) {
    return jsonError(
      400,
      "Tenant not resolved. Use subdomain (tenant.<domain>), /t/:slug, or headers."
    );
  }

  const tenantBySlug = await prisma.tenant.findUnique({
    where: { slug },
  });
  if (!tenantBySlug) {
    return jsonError(404, "Tenant not found");
  }

  return {
    tenantId: tenantBySlug.id,
    tenantSlug: tenantBySlug.slug,
    tenantName: tenantBySlug.name,
  };
}
