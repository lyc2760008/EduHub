// Tenant-aware path helpers for E2E tests so baseURL can be subdomain or /t/<slug>.
// These helpers keep API and UI routing consistent with the configured E2E_BASE_URL.

export function resolveTenantBasePath(tenantSlug: string): string {
  const baseUrl = process.env.E2E_BASE_URL;

  if (baseUrl) {
    try {
      const { pathname } = new URL(baseUrl);
      const normalizedPath = pathname.replace(/\/+$/, "");

      if (normalizedPath.startsWith("/t/")) {
        return normalizedPath || `/t/${tenantSlug}`;
      }
    } catch {
      // Ignore malformed URLs and fall back to the slug path.
    }
  }

  return `/${tenantSlug}`;
}

export function buildTenantPath(tenantSlug: string, suffix: string): string {
  const basePath = resolveTenantBasePath(tenantSlug).replace(/\/+$/, "");
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

export function buildTenantApiPath(tenantSlug: string, suffix: string): string {
  const baseUrl = process.env.E2E_BASE_URL;
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;

  if (baseUrl) {
    try {
      const { pathname } = new URL(baseUrl);
      const normalizedPath = pathname.replace(/\/+$/, "");

      // Only prefix API paths when the base URL uses the /t/<slug> fallback.
      if (normalizedPath.startsWith("/t/")) {
        const basePath = normalizedPath || `/t/${tenantSlug}`;
        return `${basePath}${normalizedSuffix}`;
      }
    } catch {
      // Ignore malformed URLs and fall back to non-prefixed API paths.
    }
  }

  return normalizedSuffix;
}
