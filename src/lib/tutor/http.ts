// Tutor API response helpers keep error envelopes and request-id propagation consistent.
import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { type TutorDataErrorCode, TutorDataError } from "@/lib/tutor/data";
import { type TutorErrorCode, TutorAccessError } from "@/lib/tutor/guard";
import { getRequestId } from "@/lib/observability/request";

type TutorHttpErrorCode = TutorErrorCode | TutorDataErrorCode | "InternalError";

export function readTutorRequestId(request: Request) {
  return getRequestId(request);
}

export function buildTutorErrorResponse(input: {
  status: number;
  code: TutorHttpErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string | null;
}) {
  return NextResponse.json(
    {
      error: {
        code: input.code,
        message: input.message,
        details: input.details ?? {},
      },
      ...(input.requestId ? { requestId: input.requestId } : {}),
    },
    { status: input.status },
  );
}

export function buildTutorOkResponse<T>(input: {
  data: T;
  status?: number;
  requestId?: string | null;
}) {
  return NextResponse.json(
    {
      ...input.data,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    },
    { status: input.status ?? 200 },
  );
}

export function normalizeTutorRouteError(
  error: unknown,
  requestId?: string | null,
) {
  if (error instanceof TutorAccessError || error instanceof TutorDataError) {
    return buildTutorErrorResponse({
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
    });
  }

  if (error instanceof ZodError) {
    return buildTutorErrorResponse({
      status: 400,
      code: "ValidationError",
      message: "Invalid payload",
      details: { issues: error.issues },
      requestId,
    });
  }

  return buildTutorErrorResponse({
    status: 500,
    code: "InternalError",
    message: "Internal server error",
    requestId,
  });
}
