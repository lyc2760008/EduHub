// Parent portal access helper that enforces role + tenant checks in server components.
import type { Session } from "next-auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { resolveTenant, type TenantContext } from "@/lib/tenant/resolveTenant";

const DEFAULT_HOST = "localhost:3000";

type ParentAccessContext = {
  tenant: TenantContext;
  session: Session;
  parentId: string;
};

type RequireParentAccessResult =
  | { ok: true; ctx: ParentAccessContext }
  | { ok: false; status: number };

// Build a NextRequest with tenant headers so resolveTenant can parse the slug.
async function buildTenantRequest(tenantSlug: string): Promise<NextRequest> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    DEFAULT_HOST;
  const proto = headerList.get("x-forwarded-proto") ?? "http";

  // Use the parent portal path to mirror routing while resolving tenant.
  const url = new URL(`/${tenantSlug}/parent`, `${proto}://${host}`);

  const requestHeaders = new Headers(headerList);
  requestHeaders.set("x-tenant-slug", tenantSlug);

  return new NextRequest(url, { headers: requestHeaders });
}

// Require a parent session for server components and surface status for redirects.
export async function requireParentAccess(
  tenantSlug: string,
): Promise<RequireParentAccessResult> {
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return { ok: false, status: 401 };
  }

  if (session.user.role !== "Parent") {
    return { ok: false, status: 403 };
  }

  const request = await buildTenantRequest(tenantSlug);
  const tenantResult = await resolveTenant(request);
  if (tenantResult instanceof Response) {
    return { ok: false, status: tenantResult.status };
  }

  if (session.user.tenantId !== tenantResult.tenantId) {
    return { ok: false, status: 403 };
  }

  const parentId = session.user.parentId ?? session.user.id;
  if (!parentId) {
    return { ok: false, status: 401 };
  }

  return { ok: true, ctx: { tenant: tenantResult, session, parentId } };
}
