// Database-backed rate limiting for parent magic link requests (serverless-safe).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { getMagicLinkConfig } from "@/lib/auth/magicLink";

type DbClient = PrismaClient | Prisma.TransactionClient;

type RateLimitInput = {
  kind: string;
  tenantId?: string | null;
  ipHash: string;
  emailHash: string;
  now?: Date;
};

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function resolveRetryAfterSeconds(
  now: Date,
  oldestEvent: Date | null,
  windowMinutes: number,
) {
  if (!oldestEvent) return 0;
  const windowMs = windowMinutes * 60 * 1000;
  const retryAfterMs = oldestEvent.getTime() + windowMs - now.getTime();
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

// Check per-email and per-IP limits and return the longest retry window if blocked.
export async function checkMagicLinkRateLimit(
  db: DbClient,
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const config = getMagicLinkConfig();
  const now = input.now ?? new Date();
  const emailWindowStart = new Date(
    now.getTime() - config.emailWindowMinutes * 60 * 1000,
  );
  const ipWindowStart = new Date(
    now.getTime() - config.ipWindowMinutes * 60 * 1000,
  );

  const [emailCount, ipCount] = await Promise.all([
    db.authRateLimitEvent.count({
      where: {
        kind: input.kind,
        emailHash: input.emailHash,
        createdAt: { gte: emailWindowStart },
      },
    }),
    db.authRateLimitEvent.count({
      where: {
        kind: input.kind,
        ipHash: input.ipHash,
        createdAt: { gte: ipWindowStart },
      },
    }),
  ]);

  if (emailCount < config.emailMax && ipCount < config.ipMax) {
    return { allowed: true };
  }

  const [oldestEmail, oldestIp] = await Promise.all([
    emailCount >= config.emailMax
      ? db.authRateLimitEvent.findFirst({
          where: {
            kind: input.kind,
            emailHash: input.emailHash,
            createdAt: { gte: emailWindowStart },
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
    ipCount >= config.ipMax
      ? db.authRateLimitEvent.findFirst({
          where: {
            kind: input.kind,
            ipHash: input.ipHash,
            createdAt: { gte: ipWindowStart },
          },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  const retryAfterSeconds = Math.max(
    resolveRetryAfterSeconds(
      now,
      oldestEmail?.createdAt ?? null,
      config.emailWindowMinutes,
    ),
    resolveRetryAfterSeconds(
      now,
      oldestIp?.createdAt ?? null,
      config.ipWindowMinutes,
    ),
  );

  return { allowed: false, retryAfterSeconds };
}

// Record a rate limit event with hashed identifiers (no raw PII).
export async function recordMagicLinkRateLimitEvent(
  db: DbClient,
  input: RateLimitInput,
) {
  await db.authRateLimitEvent.create({
    data: {
      kind: input.kind,
      tenantId: input.tenantId ?? null,
      ipHash: input.ipHash,
      emailHash: input.emailHash,
      createdAt: input.now ?? new Date(),
    },
  });
}
