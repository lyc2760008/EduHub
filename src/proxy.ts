// Proxy handler sets tenant slug + request ID headers for observability-safe routing.
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

  // Request IDs are observability-only and must never influence auth decisions.
  const existingRequestId = headers.get("x-request-id");
  const requestId = existingRequestId ?? crypto.randomUUID();
  headers.set("x-request-id", requestId);

  // If path starts with /t/<slug>/api, rewrite to /api to keep internal routing simple.
  if (slug && pathname.startsWith(`/t/${slug}/api`)) {
    const rewritePath = pathname.replace(`/t/${slug}`, "");
    const url = req.nextUrl.clone();
    url.pathname = rewritePath || "/";
    const response = NextResponse.rewrite(url, { request: { headers } });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export function proxy(req: NextRequest) {
  return withTenantSlug(req);
}

export const config = {
  // Skip static assets to keep proxy/middleware overhead low.
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff|woff2|ttf|otf)).*)",
  ],
};
