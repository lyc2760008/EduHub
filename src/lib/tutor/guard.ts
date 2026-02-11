// Server-only tutor access helpers centralize tenant + RBAC checks for tutor routes.
import "server-only";

import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export type TutorErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound";

export class TutorAccessError extends Error {
  status: number;
  code: TutorErrorCode;
  details: Record<string, unknown>;

  constructor(
    status: number,
    code: TutorErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TutorAccessError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type TutorTenantContext = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
};

function normalizeTenantSlug(input: string) {
  return input.trim().toLowerCase();
}

function toTutorSessionOrThrow(session: Session | null): Session {
  if (!session?.user) {
    throw new TutorAccessError(401, "Unauthorized", "Unauthorized");
  }
  return session;
}

export async function getTutorSessionOrThrow() {
  const session = (await auth()) as Session | null;
  return toTutorSessionOrThrow(session);
}

export function getTutorUserId(session: Session) {
  const tutorUserId = session.user?.id?.trim() ?? "";
  if (!tutorUserId) {
    throw new TutorAccessError(401, "Unauthorized", "Unauthorized");
  }
  return tutorUserId;
}

export function assertTutorInTenant(session: Session, tenantId: string) {
  if (session.user.role !== "Tutor") {
    throw new TutorAccessError(403, "Forbidden", "Tutor role required");
  }

  if (session.user.tenantId !== tenantId) {
    throw new TutorAccessError(403, "Forbidden", "Forbidden", {
      reason: "TenantMismatch",
    });
  }
}

export async function resolveTutorTenantOrThrow(tenantSlugParam: string) {
  const tenantSlug = normalizeTenantSlug(tenantSlugParam);
  if (!tenantSlug) {
    throw new TutorAccessError(
      400,
      "ValidationError",
      "Invalid tenant slug",
      { field: "tenant" },
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  });

  if (!tenant) {
    throw new TutorAccessError(404, "NotFound", "Tenant not found");
  }

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
  } satisfies TutorTenantContext;
}

// Unified helper used by tutor pages/routes so tenant and tutor checks stay identical.
export async function requireTutorContextOrThrow(tenantSlug: string) {
  const [session, tenant] = await Promise.all([
    getTutorSessionOrThrow(),
    resolveTutorTenantOrThrow(tenantSlug),
  ]);

  assertTutorInTenant(session, tenant.tenantId);

  return {
    session,
    tenant,
    tutorUserId: getTutorUserId(session),
  };
}
