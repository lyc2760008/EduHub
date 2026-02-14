// Notification API access reuses the existing parent+tutor portal guard for consistent recipient identity rules.
import "server-only";

import type { NextRequest } from "next/server";

import { requireAnnouncementPortalAccess } from "@/lib/announcements/access";

export type NotificationPortalAccess = {
  tenantId: string;
  tenantSlug: string;
  role: "Parent" | "Tutor";
  recipientUserId: string;
};

// Parent sessions use parentId as recipient identity; tutor sessions use User.id.
export async function requireNotificationPortalAccess(
  request: NextRequest,
): Promise<NotificationPortalAccess | Response> {
  const access = await requireAnnouncementPortalAccess(request);
  if (access instanceof Response) return access;

  if (access.role !== "Parent" && access.role !== "Tutor") {
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  return {
    tenantId: access.tenantId,
    tenantSlug: access.tenantSlug,
    role: access.role,
    recipientUserId: access.readerUserId,
  };
}
