// Server-only announcements access helper supports Parent + Tutor portal APIs with tenant isolation.
import "server-only";

import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { requirePortalParent } from "@/lib/portal/parent";
import { resolveTenant } from "@/lib/tenant/resolveTenant";
import type { AnnouncementReadRole, Role } from "@/generated/prisma/client";
import type { Session } from "next-auth";

type AnnouncementPortalAccess = {
  tenantId: string;
  tenantSlug: string;
  role: Role;
  readerUserId: string;
  roleAtRead: AnnouncementReadRole;
};

type AccessErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND";

type AccessErrorResponse = Response;

function buildAccessError(status: number, code: AccessErrorCode): AccessErrorResponse {
  return Response.json({ error: { code } }, { status });
}

async function requireTutorPortalAccess(
  request: NextRequest,
  session: Session,
): Promise<AnnouncementPortalAccess | AccessErrorResponse> {
  const tenantResult = await resolveTenant(request);
  if (tenantResult instanceof Response) {
    const status = tenantResult.status;
    if (status === 404) return buildAccessError(404, "NOT_FOUND");
    return buildAccessError(status === 401 ? 401 : 403, "FORBIDDEN");
  }

  if (session.user.tenantId !== tenantResult.tenantId) {
    return buildAccessError(403, "FORBIDDEN");
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: tenantResult.tenantId,
        userId: session.user.id,
      },
    },
    select: {
      role: true,
    },
  });

  if (!membership || membership.role !== "Tutor") {
    return buildAccessError(403, "FORBIDDEN");
  }

  return {
    tenantId: tenantResult.tenantId,
    tenantSlug: tenantResult.tenantSlug,
    role: "Tutor",
    readerUserId: session.user.id,
    roleAtRead: "Tutor",
  };
}

export async function requireAnnouncementPortalAccess(
  request: NextRequest,
): Promise<AnnouncementPortalAccess | AccessErrorResponse> {
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return buildAccessError(401, "UNAUTHORIZED");
  }

  if (session.user.role === "Parent") {
    const parentCtx = await requirePortalParent(request);
    if (parentCtx instanceof Response) return parentCtx;
    return {
      tenantId: parentCtx.tenant.tenantId,
      tenantSlug: parentCtx.tenant.tenantSlug,
      role: "Parent",
      readerUserId: parentCtx.parentId,
      roleAtRead: "Parent",
    };
  }

  if (session.user.role === "Tutor") {
    return await requireTutorPortalAccess(request, session);
  }

  return buildAccessError(403, "FORBIDDEN");
}
