// Tenant-aware path helpers for E2E tests so baseURL can be subdomain or /t/<slug>.
// These helpers keep API and UI routing consistent with the configured E2E_BASE_URL.

// Playwright Page is used for tenant context assertions via API requests.
import type { Page } from "@playwright/test";

export function resolveTenantBasePath(tenantSlug: string): string {
  const baseUrl = process.env.E2E_BASE_URL;

  if (baseUrl) {
    try {
      const { pathname } = new URL(baseUrl);
      const normalizedPath = pathname.replace(/\/+$/, "");

      if (normalizedPath.startsWith("/t/")) {
        // UI routes are /<tenant>/..., so ignore /t/<tenant> for page navigation.
        return `/${tenantSlug}`;
      }

      if (normalizedPath.startsWith(`/${tenantSlug}`)) {
        // Support base URLs that already include the tenant slug path.
        return normalizedPath;
      }
    } catch {
      // Ignore malformed URLs and fall back to the slug path.
    }
  }

  return `/${tenantSlug}`;
}

function shouldUseTenantHeader(tenantSlug: string): boolean {
  // Prefer explicit header routing when the base URL doesn't carry tenant context.
  const flag = (process.env.E2E_TENANT_HEADER || "").trim().toLowerCase();
  if (flag === "1" || flag === "true") return true;

  const baseUrl = process.env.E2E_BASE_URL;
  if (!baseUrl) return false;
  try {
    const { hostname, pathname } = new URL(baseUrl);
    const normalizedPath = pathname.replace(/\/+$/, "");
    const normalizedHost = hostname.toLowerCase();
    const normalizedSlug = tenantSlug.toLowerCase();

    if (normalizedPath.startsWith("/t/")) return false;
    if (normalizedHost.startsWith(`${normalizedSlug}.`)) return false;
  } catch {
    return false;
  }

  return true;
}

export function buildTenantPath(tenantSlug: string, suffix: string): string {
  const basePath = resolveTenantBasePath(tenantSlug).replace(/\/+$/, "");
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

export function buildTenantApiPath(tenantSlug: string, suffix: string): string {
  const baseUrl = process.env.E2E_BASE_URL;
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;

  if (shouldUseTenantHeader(tenantSlug)) {
    // Header-based routing keeps API paths clean when tenant is not in host/path.
    return normalizedSuffix;
  }

  if (baseUrl) {
    try {
      const { hostname, pathname } = new URL(baseUrl);
      const normalizedPath = pathname.replace(/\/+$/, "");
      const normalizedHost = hostname.toLowerCase();
      const normalizedSlug = tenantSlug.toLowerCase();

      // Subdomain routing already carries the tenant in the host, so /api works.
      if (normalizedHost.startsWith(`${normalizedSlug}.`)) {
        return normalizedSuffix;
      }

      // Use /t/<slug>/api to align with app routing for path-based tenants.
      if (normalizedPath.startsWith("/t/")) {
        return `${normalizedPath}/api${normalizedSuffix}`;
      }
    } catch {
      // Ignore malformed URLs and fall back to non-prefixed API paths.
    }
  }

  return `/t/${tenantSlug}/api${normalizedSuffix}`;
}

export async function assertTenantContext(page: Page, tenantSlug: string) {
  // Tenant context check verifies that API requests resolve the expected tenant.
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, "/api/me"),
  );
  if (response.status() !== 200) {
    throw new Error(`Expected /api/me to return 200, got ${response.status()}.`);
  }
  const payload = (await response.json()) as {
    membership?: { tenantId?: string; role?: string };
    tenant?: { tenantSlug?: string };
  };
  if (payload.tenant?.tenantSlug !== tenantSlug) {
    throw new Error(
      `Expected tenant slug ${tenantSlug}, got ${payload.tenant?.tenantSlug ?? "unknown"}.`,
    );
  }
  if (!payload.membership?.tenantId || !payload.membership?.role) {
    throw new Error("Expected tenant membership info in /api/me response.");
  }
}
