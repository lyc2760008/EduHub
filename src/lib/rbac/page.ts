// Page-only RBAC helpers that bridge tenant params to the API guard layer.
import { headers } from "next/headers";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

const DEFAULT_HOST = "localhost:3000";

// Build a NextRequest with tenant headers so requireRole can resolve tenancy.
async function buildTenantRequest(tenantSlug: string): Promise<NextRequest> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    DEFAULT_HOST;
  const proto = headerList.get("x-forwarded-proto") ?? "http";

  // Use the tenant slug in the URL path to mirror app routing.
  const url = new URL(`/${tenantSlug}/admin`, `${proto}://${host}`);

  const requestHeaders = new Headers(headerList);
  requestHeaders.set("x-tenant-slug", tenantSlug);

  return new NextRequest(url, { headers: requestHeaders });
}

type RequireRoleResult = Awaited<ReturnType<typeof requireRole>>;
type RoleContext = Exclude<RequireRoleResult, Response>;

type RequirePageRoleResult =
  | { ok: true; ctx: RoleContext }
  | { ok: false; status: number };

// Require a role for server components and expose status for access denied UI.
export async function requirePageRole(
  tenantSlug: string,
  roles: Role[]
): Promise<RequirePageRoleResult> {
  const request = await buildTenantRequest(tenantSlug);
  const result = await requireRole(request, roles);

  if (result instanceof Response) {
    // Surface the HTTP status so pages can differentiate 401 vs 403.
    return { ok: false, status: result.status };
  }

  return { ok: true, ctx: result };
}
