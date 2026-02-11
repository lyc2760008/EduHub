/**
 * @state.route /api/__debug/sentry-test
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Staging-only Sentry test endpoint guarded by RBAC (no PII, no UI).
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { getRequestId } from "@/lib/observability/request";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

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
  // Standardized error shape keeps debug responses consistent with API norms.
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

export async function GET(req: NextRequest) {
  const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  if (appEnv !== "staging") {
    return buildErrorResponse(404, "NotFound", "Not found");
  }

  const authResult = await requireRole(req, ADMIN_ROLES);
  if (authResult instanceof Response) return await normalizeAuthResponse(authResult);

  const requestId = getRequestId(req);
  if (requestId) {
    Sentry.setTag("request_id", requestId);
  }

  // Capture a controlled error without including any sensitive context.
  const error = new Error("Sentry staging test error");
  Sentry.captureException(error);
  await Sentry.flush(2000);

  return buildErrorResponse(500, "InternalError", "Sentry staging test error");
}
