// Parent auth throttle check backed by audit events (tenant + email scoped).
import { prisma } from "@/lib/db/prisma";
import { AuditActorType } from "@/generated/prisma/client";
import { AUDIT_ACTIONS } from "@/lib/audit/constants";
import {
  COOLDOWN_SECONDS,
  MAX_ATTEMPTS_PER_WINDOW,
  WINDOW_SECONDS,
} from "@/lib/auth/parentThrottleConfig";

type ThrottleInput = {
  tenantId: string;
  // email must be normalized (trim + lowercase) to avoid leaking existence via casing.
  email: string;
  now?: Date;
};

type ThrottleResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; code: "AUTH_THROTTLED" };

function toWindowStart(now: Date) {
  return new Date(now.getTime() - WINDOW_SECONDS * 1000);
}

// Count recent failed attempts and compute lockout window without leaking user existence.
export async function checkParentAuthThrottle({
  tenantId,
  email,
  now = new Date(),
}: ThrottleInput): Promise<ThrottleResult> {
  const windowStart = toWindowStart(now);

  const summary = await prisma.auditEvent.aggregate({
    where: {
      tenantId,
      actorType: AuditActorType.PARENT,
      actorDisplay: email,
      action: AUDIT_ACTIONS.PARENT_LOGIN_FAILED,
      occurredAt: { gte: windowStart },
    },
    _count: { _all: true },
    _max: { occurredAt: true },
  });

  const attemptCount = summary._count._all;
  if (attemptCount < MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: true };
  }

  const lastFailAt = summary._max.occurredAt;
  if (!lastFailAt) {
    return { allowed: true };
  }

  const lockoutUntil = new Date(
    lastFailAt.getTime() + COOLDOWN_SECONDS * 1000,
  );
  if (now >= lockoutUntil) {
    return { allowed: true };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((lockoutUntil.getTime() - now.getTime()) / 1000),
  );
  return { allowed: false, retryAfterSeconds, code: "AUTH_THROTTLED" };
}
