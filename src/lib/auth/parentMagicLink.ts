// Shared parent magic link sender to keep token issuance + rate limiting consistent.
import "server-only";

import { getTranslations } from "next-intl/server";

import {
  generateMagicLinkToken,
  getMagicLinkConfig,
  getRequestIp,
  getRequestOrigin,
  hashIdentifier,
  normalizeEmail,
} from "@/lib/auth/magicLink";
import { buildMagicLinkEmail } from "@/lib/auth/magicLinkEmail";
import {
  checkMagicLinkRateLimit,
  recordMagicLinkRateLimitEvent,
} from "@/lib/auth/magicLinkRateLimit";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/smtp";

type RateLimitInput = {
  kind: string;
  tenantId: string;
  ipHash?: string;
  emailHash?: string;
  skipCheck?: boolean;
};

type TenantSnapshot = {
  id: string;
  slug: string;
  name: string;
  supportEmail?: string | null;
};

type ParentSnapshot = {
  id: string;
  email: string;
};

function isLoopbackHost(host: string) {
  const normalized = host.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".localhost")
  );
}

function resolveMagicLinkOrigin(request: Request) {
  // Prefer the request origin, but avoid emitting localhost URLs in email links.
  const origin = getRequestOrigin(request);
  if (origin) {
    try {
      const host = new URL(origin).hostname;
      if (!isLoopbackHost(host)) {
        return origin;
      }
    } catch {
      // Fall through to env-based origin resolution.
    }
  }

  const appEnv =
    process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  const isProd = appEnv === "production";
  const baseDomain = (
    isProd
      ? process.env.TENANT_BASE_DOMAIN
      : process.env.TENANT_DEV_BASE_DOMAIN ?? process.env.TENANT_BASE_DOMAIN
  )?.trim();

  if (!baseDomain) {
    return origin;
  }

  if (baseDomain.startsWith("http")) {
    return baseDomain.replace(/\/+$/, "");
  }

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (isProd ? "https" : "http");
  return `${proto}://${baseDomain}`;
}

export type SendParentMagicLinkInput = {
  tenant: TenantSnapshot;
  parent: ParentSnapshot;
  rememberMe?: boolean;
  initiatedBy: "parent" | "admin";
  request: Request;
  studentContextId?: string | null;
  rateLimit: RateLimitInput;
};

export type SendParentMagicLinkResult =
  | { ok: true }
  | { ok: false; reason: "RATE_LIMITED" | "UNKNOWN"; retryAfterSeconds?: number };

export async function sendParentMagicLink(
  input: SendParentMagicLinkInput,
): Promise<SendParentMagicLinkResult> {
  const {
    tenant,
    parent,
    rememberMe,
    request,
    rateLimit,
  } = input;

  // Derive hashed identifiers from the request and parent email without persisting raw values.
  const emailNormalized = normalizeEmail(parent.email);
  const ip = getRequestIp(request) ?? "unknown";
  const ipHash = rateLimit.ipHash ?? hashIdentifier(ip);
  const emailHash =
    rateLimit.emailHash ?? hashIdentifier(emailNormalized || "invalid");

  if (!rateLimit.skipCheck) {
    const rateLimitResult = await checkMagicLinkRateLimit(prisma, {
      kind: rateLimit.kind,
      tenantId: rateLimit.tenantId,
      ipHash,
      emailHash,
    });

    if (!rateLimitResult.allowed) {
      return {
        ok: false,
        reason: "RATE_LIMITED",
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
      };
    }
  }

  const { rawToken, tokenHash } = generateMagicLinkToken();
  const config = getMagicLinkConfig();
  const expiresAt = new Date(Date.now() + config.ttlMinutes * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await recordMagicLinkRateLimitEvent(tx, {
      kind: rateLimit.kind,
      tenantId: rateLimit.tenantId,
      ipHash,
      emailHash,
    });

    await tx.parentMagicLinkToken.create({
      data: {
        tenantId: tenant.id,
        parentUserId: parent.id,
        tokenHash,
        rememberMe: rememberMe ?? true,
        expiresAt,
        createdIpHash: ipHash,
      },
    });
  });

  const origin = resolveMagicLinkOrigin(request);
  if (!origin) {
    // Fail safely when we cannot build an absolute URL for the email.
    return { ok: false, reason: "UNKNOWN" };
  }

  const signInUrl = `${origin}/${tenant.slug}/parent/auth/verify?token=${encodeURIComponent(
    rawToken,
  )}`;

  const t = await getTranslations();
  const { subject, html, text } = buildMagicLinkEmail(t, {
    appName: tenant.name,
    signInUrl,
    expiresInMinutes: config.ttlMinutes,
    supportEmail: tenant.supportEmail ?? process.env.EMAIL_FROM ?? "",
  });

  await sendEmail({
    to: parent.email,
    subject,
    html,
    text,
  });

  return { ok: true };
}
