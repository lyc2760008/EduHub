// Parent magic link request endpoint (tenant-scoped, neutral responses).
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
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

export const runtime = "nodejs";

const RATE_LIMIT_KIND = "PARENT_MAGIC_LINK_REQUEST";

const RequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    rememberMe: z.boolean().optional(),
  })
  .strict();

type Params = {
  params: Promise<{ tenant: string }>;
};

function buildOkResponse(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

export async function POST(req: NextRequest, context: Params) {
  const { tenant } = await context.params;
  const tenantSlug = tenant.trim().toLowerCase();

  let body: unknown = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // Neutral response for malformed JSON to avoid email enumeration.
    return buildOkResponse();
  }

  const parsed = RequestSchema.safeParse(body);
  const emailRaw = parsed.success ? parsed.data.email : "";
  const rememberMe = parsed.success ? parsed.data.rememberMe ?? true : true;
  const emailNormalized = normalizeEmail(emailRaw);
  const ip = getRequestIp(req) ?? "unknown";
  const ipHash = hashIdentifier(ip);
  const emailHash = hashIdentifier(emailNormalized || "invalid");

  const tenantRecord = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, supportEmail: true },
  });

  if (!tenantRecord) {
    // Tenant is required for token issuance but responses remain neutral.
    return buildOkResponse();
  }

  const rateLimitResult = await checkMagicLinkRateLimit(prisma, {
    kind: RATE_LIMIT_KIND,
    tenantId: tenantRecord.id,
    ipHash,
    emailHash,
  });

  if (!rateLimitResult.allowed) {
    return buildOkResponse({
      rateLimited: true,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });
  }

  if (!parsed.success) {
    await recordMagicLinkRateLimitEvent(prisma, {
      kind: RATE_LIMIT_KIND,
      tenantId: tenantRecord.id,
      ipHash,
      emailHash,
    });
    return buildOkResponse();
  }

  const parent = await prisma.parent.findFirst({
    where: {
      tenantId: tenantRecord.id,
      email: { equals: emailNormalized, mode: "insensitive" },
    },
    select: { id: true, email: true },
  });

  if (!parent) {
    await recordMagicLinkRateLimitEvent(prisma, {
      kind: RATE_LIMIT_KIND,
      tenantId: tenantRecord.id,
      ipHash,
      emailHash,
    });
    return buildOkResponse();
  }

  const linkedStudent = await prisma.studentParent.findFirst({
    where: { tenantId: tenantRecord.id, parentId: parent.id },
    select: { id: true },
  });

  if (!linkedStudent) {
    await recordMagicLinkRateLimitEvent(prisma, {
      kind: RATE_LIMIT_KIND,
      tenantId: tenantRecord.id,
      ipHash,
      emailHash,
    });
    return buildOkResponse();
  }

  const { rawToken, tokenHash } = generateMagicLinkToken();
  const config = getMagicLinkConfig();
  const expiresAt = new Date(Date.now() + config.ttlMinutes * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await recordMagicLinkRateLimitEvent(tx, {
      kind: RATE_LIMIT_KIND,
      tenantId: tenantRecord.id,
      ipHash,
      emailHash,
    });

    await tx.parentMagicLinkToken.create({
      data: {
        tenantId: tenantRecord.id,
        parentUserId: parent.id,
        tokenHash,
        rememberMe,
        expiresAt,
        createdIpHash: ipHash,
      },
    });
  });

  const origin = getRequestOrigin(req);
  if (!origin) {
    // Without a reliable origin we cannot build an absolute link; return neutral.
    return buildOkResponse();
  }

  const signInUrl = `${origin}/${tenantSlug}/parent/auth/verify?token=${encodeURIComponent(
    rawToken,
  )}`;

  const t = await getTranslations();
  const { subject, html, text } = buildMagicLinkEmail(t, {
    appName: tenantRecord.name,
    signInUrl,
    expiresInMinutes: config.ttlMinutes,
    supportEmail: tenantRecord.supportEmail ?? process.env.EMAIL_FROM ?? "",
  });

  await sendEmail({
    to: parent.email,
    subject,
    html,
    text,
  });

  return buildOkResponse();
}
