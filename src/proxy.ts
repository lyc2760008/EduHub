import { NextResponse, type NextRequest } from "next/server";
import {
  getRequestHost,
  parseTenantSlugFromHost,
  parseTenantSlugFromPath,
} from "@/lib/tenant/request";

function withTenantSlug(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  let slug: string | null = null;

  // Path-based: /t/<slug>/api/... or /t/<slug>/...
  if (pathname.startsWith("/t/")) {
    const pathSlug = parseTenantSlugFromPath(pathname);
    if (pathSlug) slug = pathSlug.toLowerCase();
  }

  // Host-based fallback
  if (!slug) {
    const host = getRequestHost(req);
    const hostSlug = parseTenantSlugFromHost(host);
    if (hostSlug) slug = hostSlug.toLowerCase();
  }

  const headers = new Headers(req.headers);
  if (slug) {
    headers.set("x-tenant-slug", slug);
  }

  // If path starts with /t/<slug>/api, rewrite to /api to keep internal routing simple.
  if (slug && pathname.startsWith(`/t/${slug}/api`)) {
    const rewritePath = pathname.replace(`/t/${slug}`, "");
    const url = req.nextUrl.clone();
    url.pathname = rewritePath || "/";
    return NextResponse.rewrite(url, { request: { headers } });
  }

  return NextResponse.next({ request: { headers } });
}

export function proxy(req: NextRequest) {
  return withTenantSlug(req);
}

export const config = {
  matcher: ["/api/:path*", "/t/:path*"],
};
