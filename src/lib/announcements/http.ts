// Server-only API helpers provide a stable error shape for announcement endpoints.
import "server-only";

import { NextResponse } from "next/server";

export type AnnouncementApiErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

export class AnnouncementApiError extends Error {
  status: number;
  code: AnnouncementApiErrorCode;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: AnnouncementApiErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "AnnouncementApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toAnnouncementErrorResponse(error: unknown) {
  if (error instanceof AnnouncementApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { error: { code: "InternalError" } },
    { status: 500 },
  );
}

export async function normalizeAnnouncementRoleError(response: Response) {
  const status = response.status;
  if (status === 401) {
    return NextResponse.json({ error: { code: "Unauthorized" } }, { status: 401 });
  }
  if (status === 403) {
    return NextResponse.json({ error: { code: "Forbidden" } }, { status: 403 });
  }
  if (status === 404) {
    return NextResponse.json({ error: { code: "NotFound" } }, { status: 404 });
  }
  return NextResponse.json({ error: { code: "ValidationError" } }, { status: 400 });
}
