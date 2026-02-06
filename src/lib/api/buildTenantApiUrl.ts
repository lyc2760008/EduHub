// Helper to build tenant-scoped API URLs for path-based multi-tenant routing.
export function buildTenantApiUrl(tenant: string | null | undefined, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = tenant ? `/t/${tenant}/api` : "/api";
  return `${base}${normalizedPath}`;
}
