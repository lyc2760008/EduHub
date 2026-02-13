// Shared homework domain error keeps API error envelopes consistent across admin/tutor/portal handlers.
import "server-only";

export type HomeworkErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

export class HomeworkError extends Error {
  status: number;
  code: HomeworkErrorCode;
  details: Record<string, unknown>;

  constructor(
    status: number,
    code: HomeworkErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HomeworkError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

