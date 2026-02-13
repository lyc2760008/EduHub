// Shared homework client helpers keep status/file-slot rendering and upload validation consistent across surfaces.
export type HomeworkStatus = "ASSIGNED" | "SUBMITTED" | "REVIEWED";
// UI-only status to distinguish placeholder rows before staff uploads an assignment file.
export type HomeworkDisplayStatus = HomeworkStatus | "UNASSIGNED";
export type HomeworkFileSlot = "ASSIGNMENT" | "SUBMISSION" | "FEEDBACK";

export type HomeworkFileVersion = {
  id: string;
  slot: HomeworkFileSlot;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByRole?: "ADMIN" | "TUTOR" | "PARENT" | "SYSTEM";
  downloadUrl?: string;
};

export const HOMEWORK_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const HOMEWORK_ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function isHomeworkMimeTypeAllowed(mimeType: string) {
  return HOMEWORK_ALLOWED_UPLOAD_MIME_TYPES.includes(
    mimeType as (typeof HOMEWORK_ALLOWED_UPLOAD_MIME_TYPES)[number],
  );
}

export function getHomeworkStatusKey(status: HomeworkDisplayStatus) {
  if (status === "UNASSIGNED") return "homework.status.unassigned";
  if (status === "ASSIGNED") return "homework.status.assigned";
  if (status === "SUBMITTED") return "homework.status.submitted";
  return "homework.status.reviewed";
}

export function getHomeworkSlotTitleKey(slot: HomeworkFileSlot) {
  if (slot === "ASSIGNMENT") return "homeworkFiles.assignment.title";
  if (slot === "SUBMISSION") return "homeworkFiles.submission.title";
  return "homeworkFiles.feedback.title";
}

export function getHomeworkStatusBadgeClassName(status: HomeworkDisplayStatus) {
  if (status === "UNASSIGNED") {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }
  if (status === "ASSIGNED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "SUBMITTED") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export function toHomeworkDisplayStatus(input: {
  status: HomeworkStatus;
  assignmentCount: number;
}): HomeworkDisplayStatus {
  if (input.status === "ASSIGNED" && input.assignmentCount <= 0) {
    return "UNASSIGNED";
  }
  return input.status;
}

export function formatHomeworkFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

export function formatDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function shiftDate(base: Date, days: number) {
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function pickLatestHomeworkFile(files: HomeworkFileVersion[]) {
  if (!files.length) return null;
  return files
    .slice()
    .sort(
      (left, right) =>
        right.version - left.version ||
        right.uploadedAt.localeCompare(left.uploadedAt),
    )[0];
}
