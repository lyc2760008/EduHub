// Target URL derivation maps compact target identifiers to canonical in-app routes.
import "server-only";

export type NotificationSurface = "portal" | "tutor" | "admin";

type TargetInput = {
  tenantSlug: string;
  targetType?: string | null;
  targetId?: string | null;
  surface: NotificationSurface;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function buildTenantRoot(tenantSlug: string) {
  const slug = tenantSlug.trim();
  return slug ? `/${slug}` : "";
}

// Return null when no supported canonical route exists so inbox rows can render as non-clickable.
export function getTargetUrl(input: TargetInput): string | null {
  const base = buildTenantRoot(input.tenantSlug);
  const targetType = normalize(input.targetType);
  const targetId = input.targetId?.trim() ?? "";
  if (!base || !targetType || !targetId) {
    return null;
  }

  if (targetType === "announcement") {
    if (input.surface === "tutor") {
      return `${base}/tutor/announcements/${targetId}`;
    }
    if (input.surface === "admin") {
      return `${base}/admin/announcements/${targetId}`;
    }
    return `${base}/portal/announcements/${targetId}`;
  }

  if (targetType === "homework") {
    if (input.surface === "tutor") {
      return `${base}/tutor/homework/${targetId}`;
    }
    if (input.surface === "admin") {
      return `${base}/admin/homework/${targetId}`;
    }
    return `${base}/portal/homework/${targetId}`;
  }

  // Step 23.3 default leaves request deep-link routing disabled until PO trigger decision is recorded.
  if (targetType === "request") {
    return null;
  }

  return null;
}
