// Attendance validation helpers used by staff attendance routes.

export const PARENT_VISIBLE_NOTE_MAX_LENGTH = 2000;

type ParentVisibleNoteError = {
  code: "ValidationError";
  message: string;
  details: Record<string, unknown>;
};

export type ParentVisibleNoteResult =
  | { ok: true; value: string | null; provided: boolean }
  | { ok: false; error: ParentVisibleNoteError };

export function parseParentVisibleNote(input: unknown): ParentVisibleNoteResult {
  if (input === undefined) {
    return { ok: true, value: null, provided: false };
  }

  if (input === null) {
    return { ok: true, value: null, provided: true };
  }

  if (typeof input !== "string") {
    return {
      ok: false,
      error: {
        code: "ValidationError",
        message: "Invalid parentVisibleNote",
        details: { field: "parentVisibleNote", reason: "ExpectedString" },
      },
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, value: null, provided: true };
  }

  // Enforce a reasonable length cap to prevent abuse and payload bloat.
  if (trimmed.length > PARENT_VISIBLE_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: {
        code: "ValidationError",
        message: "parentVisibleNote exceeds maximum length",
        details: {
          field: "parentVisibleNote",
          max: PARENT_VISIBLE_NOTE_MAX_LENGTH,
        },
      },
    };
  }

  return { ok: true, value: trimmed, provided: true };
}
