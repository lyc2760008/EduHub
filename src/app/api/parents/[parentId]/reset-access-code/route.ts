// Parent access-code reset endpoint with tenant scoping, RBAC, and secure hashing.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

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

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const ACCESS_CODE_LENGTH = 10;
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const ResetAccessCodeSchema = z.object({}).strict();

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape so admin consumers can map i18n messages reliably.
  return jsonError(status, message, { error: { code, message, details } });
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
  const fallbackMessage =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";
  let message = fallbackMessage;
  let details: Record<string, unknown> = {};

  try {
    const data = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
      details?: unknown;
    };
    if (typeof data?.error === "string") {
      message = data.error;
    } else if (typeof data?.message === "string") {
      message = data.message;
    }
    if (data?.details) {
      details =
        typeof data.details === "string"
          ? { message: data.details }
          : (data.details as Record<string, unknown>);
    }
  } catch {
    // Fall back to default message when the body is not JSON.
  }

  return buildErrorResponse(status, code, message, details);
}

function generateAccessCode(length = ACCESS_CODE_LENGTH) {
  // Crypto-secure access codes avoid ambiguous characters for easy manual sharing.
  const bytes = randomBytes(length);
  const chars = Array.from(bytes, (byte) => {
    const index = byte % ACCESS_CODE_ALPHABET.length;
    return ACCESS_CODE_ALPHABET[index];
  });
  return chars.join("");
}

export async function POST(req: NextRequest, context: Params) {
  try {
    const { parentId } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    let body: unknown = {};
    try {
      const rawBody = await req.text();
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return buildErrorResponse(400, "ValidationError", "Invalid JSON body", {
        message: "Invalid JSON body",
      });
    }

    const parsed = ResetAccessCodeSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const parent = await prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });

    if (!parent) {
      return buildErrorResponse(404, "NotFound", "Parent not found");
    }

    const accessCode = generateAccessCode();
    const accessCodeHash = await bcrypt.hash(accessCode, 10);
    const accessCodeUpdatedAt = new Date();

    await prisma.parent.update({
      where: { id: parent.id },
      data: {
        accessCodeHash,
        accessCodeUpdatedAt,
      },
    });

    // Return the plaintext code exactly once; never log or persist it.
    return NextResponse.json({
      parentId: parent.id,
      accessCode,
      accessCodeUpdatedAt,
    });
  } catch (error) {
    console.error(
      "POST /api/parents/[parentId]/reset-access-code failed",
      error,
    );
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
