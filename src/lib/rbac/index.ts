import type { Session } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveTenant, type TenantContext } from "@/lib/tenant/resolveTenant";
import type { Role, TenantMembership } from "@/generated/prisma/client";

// Reusable auth context returned by requireAuth for route handlers.
type AuthContext = {
  session: Session;
  user: NonNullable<Session["user"]>;
};

// Full tenant-aware context returned by membership/role guards.
type TenantMembershipContext = {
  tenant: TenantContext;
  user: AuthContext["user"];
  membership: TenantMembership;
};

// Ensure a user is authenticated via NextAuth; otherwise return 401 JSON.
export async function requireAuth(
  _request: NextRequest,
): Promise<AuthContext | Response> {
  void _request;
  // auth() in v5 resolves session without needing the NextRequest.
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { session, user: session.user };
}

// Ensure the request resolves to a tenant and the user is a member of it.
// Returns 403 if membership is missing, or passes through tenant errors (400/404).
export async function requireTenantMembership(
  request: NextRequest,
): Promise<TenantMembershipContext | Response> {
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  const tenantResult = await resolveTenant(request);
  if (tenantResult instanceof Response) return tenantResult;

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: tenantResult.tenantId,
        userId: authResult.user.id,
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    tenant: tenantResult,
    user: authResult.user,
    membership,
  };
}

// Enforce that the user's role is one of the allowed roles for the tenant.
export async function requireRole(
  request: NextRequest,
  roles: Role[],
): Promise<TenantMembershipContext | Response> {
  const ctx = await requireTenantMembership(request);
  if (ctx instanceof Response) return ctx;

  if (!roles.includes(ctx.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return ctx;
}
