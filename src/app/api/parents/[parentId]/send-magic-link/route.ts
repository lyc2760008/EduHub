// Admin endpoint to send parent magic links (RBAC + tenant-safe).
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
import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const RATE_LIMIT_KIND = "PARENT_MAGIC_LINK_REQUEST";

const SendMagicLinkSchema = z
  .object({
    rememberMe: z.boolean().optional(),
  })
  .strict();

type Params = {
  params: Promise<{ parentId: string }>;
};

type ErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for admin callers.
  return NextResponse.json(
    { error: { code, message, details } },
    { status },
  );
}

async function normalizeAuthResponse(response: Response) {
  // Normalize auth/tenant failures into the standard error response shape.
  const status = response.status;
  const code: ErrorCode =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";
  const message =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";

  return buildErrorResponse(status, code, message);
}

export async function POST(req: NextRequest, context: Params) {
  try {
    const { parentId } = await context.params;

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);

    let body: unknown = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return buildErrorResponse(400, "ValidationError", "Invalid JSON body", {
        message: "Invalid JSON body",
      });
    }

    const parsed = SendMagicLinkSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const parent = await prisma.parent.findFirst({
      where: { id: parentId, tenantId: ctx.tenant.tenantId },
      select: { id: true, email: true },
    });

    if (!parent?.email) {
      return buildErrorResponse(404, "NotFound", "Parent not found");
    }

    const linkedStudent = await prisma.studentParent.findFirst({
      where: { tenantId: ctx.tenant.tenantId, parentId: parent.id },
      select: { id: true },
    });

    if (!linkedStudent) {
      return buildErrorResponse(
        409,
        "Conflict",
        "Parent not linked to any students",
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenant.tenantId },
      select: { id: true, slug: true, name: true, supportEmail: true },
    });

    if (!tenant) {
      return buildErrorResponse(404, "NotFound", "Tenant not found");
    }

    const emailNormalized = normalizeEmail(parent.email);
    const ip = getRequestIp(req) ?? "unknown";
    const ipHash = hashIdentifier(ip);
    const emailHash = hashIdentifier(emailNormalized || "invalid");

    const rateLimitResult = await checkMagicLinkRateLimit(prisma, {
      kind: RATE_LIMIT_KIND,
      tenantId: tenant.id,
      ipHash,
      emailHash,
    });

    if (!rateLimitResult.allowed) {
      return buildErrorResponse(
        409,
        "Conflict",
        "Rate limit exceeded",
        {
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
      );
    }

    const { rawToken, tokenHash } = generateMagicLinkToken();
    const config = getMagicLinkConfig();
    const expiresAt = new Date(Date.now() + config.ttlMinutes * 60 * 1000);
    const rememberMe = parsed.data.rememberMe ?? true;

    await prisma.$transaction(async (tx) => {
      await recordMagicLinkRateLimitEvent(tx, {
        kind: RATE_LIMIT_KIND,
        tenantId: tenant.id,
        ipHash,
        emailHash,
      });

      await tx.parentMagicLinkToken.create({
        data: {
          tenantId: tenant.id,
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
      return buildErrorResponse(500, "InternalError", "Unable to build link");
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

    return NextResponse.json({ ok: true });
  } catch {
    // Avoid logging PII from request bodies or auth tokens.
    console.error("POST /api/parents/[parentId]/send-magic-link failed");
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
