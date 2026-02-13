// Homework upload validation enforces file policy (type/size/name) before any DB writes.
import "server-only";

import { createHash } from "node:crypto";

import { HomeworkError } from "@/lib/homework/errors";
import { homeworkPolicy } from "@/lib/homework/policy";

export const MAX_HOMEWORK_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_HOMEWORK_FILENAME_LENGTH = 200;

const BASE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const LEGACY_DOC_MIME_TYPE = "application/msword";

export type ValidatedHomeworkFile = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Buffer;
  checksum: string;
};

export function getAllowedHomeworkMimeTypes() {
  return homeworkPolicy.allowLegacyDocMime
    ? [...BASE_ALLOWED_MIME_TYPES, LEGACY_DOC_MIME_TYPE]
    : [...BASE_ALLOWED_MIME_TYPES];
}

export function sanitizeHomeworkFilename(rawValue: string) {
  const normalized = rawValue.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized) {
    throw new HomeworkError(400, "ValidationError", "Invalid filename", {
      field: "file",
      reason: "EMPTY_FILENAME",
    });
  }

  const withoutPath = normalized.split(/[/\\]/).pop()?.trim() ?? normalized;
  const trimmed = withoutPath.slice(0, MAX_HOMEWORK_FILENAME_LENGTH);

  if (!trimmed) {
    throw new HomeworkError(400, "ValidationError", "Invalid filename", {
      field: "file",
      reason: "EMPTY_FILENAME",
    });
  }

  return trimmed;
}

function assertMimeTypeAllowed(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  const allowedSet = new Set(getAllowedHomeworkMimeTypes());
  if (!allowedSet.has(normalized)) {
    throw new HomeworkError(400, "ValidationError", "Invalid file type", {
      field: "file",
      reason: "INVALID_MIME_TYPE",
    });
  }

  return normalized;
}

function assertFileSizeAllowed(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new HomeworkError(400, "ValidationError", "File is empty", {
      field: "file",
      reason: "EMPTY_FILE",
    });
  }
  if (sizeBytes > MAX_HOMEWORK_FILE_SIZE_BYTES) {
    throw new HomeworkError(400, "ValidationError", "File too large", {
      field: "file",
      maxSizeBytes: MAX_HOMEWORK_FILE_SIZE_BYTES,
    });
  }
}

export function validateHomeworkFilePayload(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Buffer;
}): ValidatedHomeworkFile {
  const filename = sanitizeHomeworkFilename(input.filename);
  const mimeType = assertMimeTypeAllowed(input.mimeType);
  assertFileSizeAllowed(input.sizeBytes);

  if (!input.bytes.length) {
    throw new HomeworkError(400, "ValidationError", "File is empty", {
      field: "file",
      reason: "EMPTY_FILE",
    });
  }

  const checksum = createHash("sha256").update(input.bytes).digest("hex");

  return {
    filename,
    mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
    checksum,
  };
}

export async function readHomeworkFileFromFormData(
  request: Request,
  fieldName = "file",
) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new HomeworkError(400, "ValidationError", "Invalid form data", {
      field: "body",
    });
  }

  const fileField = formData.get(fieldName);
  if (!(fileField instanceof File)) {
    throw new HomeworkError(400, "ValidationError", "File is required", {
      field: fieldName,
    });
  }

  const bytes = Buffer.from(await fileField.arrayBuffer());
  return {
    formData,
    file: validateHomeworkFilePayload({
      filename: fileField.name,
      mimeType: fileField.type || "application/octet-stream",
      sizeBytes: fileField.size,
      bytes,
    }),
  };
}

