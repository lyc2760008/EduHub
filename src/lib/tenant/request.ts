import type { NextRequest } from "next/server";

function stripPort(host: string | null): string {
  if (!host) return "";
  return host.split(":")[0].toLowerCase();
}

export function getRequestHost(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-host");
  const host = forwarded ?? req.headers.get("host") ?? "";
  return stripPort(host);
}

export function parseTenantSlugFromHost(host: string): string | null {
  if (!host) return null;

  const base = process.env.TENANT_BASE_DOMAIN?.toLowerCase();
  const devBase = process.env.TENANT_DEV_BASE_DOMAIN?.toLowerCase();

  const endsWithBase = (h: string, domain: string) =>
    domain && h.endsWith(domain.toLowerCase());

  const extractSlug = (h: string, domain: string) => {
    if (!domain) return null;
    if (h === domain) return null;
    if (!h.endsWith(domain)) return null;
    const withoutBase = h.slice(0, -domain.length - 1); // remove "." + domain
    if (!withoutBase) return null;
    const parts = withoutBase.split(".");
    return parts[parts.length - 1] || null;
  };

  if (base && endsWithBase(host, base)) {
    const slug = extractSlug(host, base);
    if (slug) return slug;
  }

  if (devBase && endsWithBase(host, devBase)) {
    const slug = extractSlug(host, devBase);
    if (slug) return slug;
  }

  if (host.endsWith(".localhost")) {
    const parts = host.split(".");
    if (parts.length > 2) {
      return parts[0] || null;
    }
  }

  return null;
}

export function parseTenantSlugFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/t/")) return null;
  const segments = pathname.split("/").filter(Boolean);
  // ["t", "<slug>", ...]
  if (segments[0] !== "t" || !segments[1]) return null;
  return segments[1];
}

export function getTenantSlugFromRequest(req: NextRequest): string | null {
  const headerSlug = req.headers.get("x-tenant-slug")?.trim().toLowerCase();
  if (headerSlug) return headerSlug;

  const pathSlug = parseTenantSlugFromPath(req.nextUrl.pathname);
  if (pathSlug) return pathSlug.toLowerCase();

  const hostSlug = parseTenantSlugFromHost(getRequestHost(req));
  if (hostSlug) return hostSlug.toLowerCase();

  return null;
}
