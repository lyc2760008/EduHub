import { NextResponse } from "next/server";

// Stable report error codes keep API responses locale-safe and UI-friendly.
export type ReportErrorCode =
  | "INVALID_QUERY"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

// Shared report API error payload shape (no hardcoded locale strings required).
export type ReportErrorPayload = {
  error: {
    code: ReportErrorCode;
    details?: Record<string, unknown>;
  };
};

export class ReportApiError extends Error {
  status: number;
  code: ReportErrorCode;
  details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: ReportErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Converts known report exceptions into the stable API response shape.
export function toReportErrorResponse(error: unknown) {
  if (error instanceof ReportApiError) {
    return NextResponse.json<ReportErrorPayload>(
      {
        error: {
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json<ReportErrorPayload>(
    { error: { code: "INTERNAL_ERROR" } },
    { status: 500 },
  );
}

// Normalizes raw auth/RBAC responses to the stable report error shape.
export async function normalizeRoleError(response: Response) {
  const status = response.status;
  if (status === 401) {
    return NextResponse.json<ReportErrorPayload>(
      { error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }
  if (status === 403) {
    return NextResponse.json<ReportErrorPayload>(
      { error: { code: "FORBIDDEN" } },
      { status: 403 },
    );
  }
  if (status === 404) {
    return NextResponse.json<ReportErrorPayload>(
      { error: { code: "NOT_FOUND" } },
      { status: 404 },
    );
  }

  return NextResponse.json<ReportErrorPayload>(
    { error: { code: "INVALID_QUERY" } },
    { status: 400 },
  );
}
