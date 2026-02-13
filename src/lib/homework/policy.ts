// Homework policy flags centralize v1 PO defaults and optional feature toggles.
import "server-only";

function isEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const homeworkPolicy = {
  // v1 default: DOC is disabled unless PO explicitly approves.
  allowLegacyDocMime: isEnabled(process.env.HOMEWORK_ALLOW_DOC),
  // v1 default: tutor assignment upload is disabled unless PO explicitly approves.
  tutorCanUploadAssignment: isEnabled(
    process.env.HOMEWORK_TUTOR_CAN_UPLOAD_ASSIGNMENT,
  ),
  // v1 default: feedback file is not required to mark reviewed.
  requireFeedbackFileToMarkReviewed: isEnabled(
    process.env.HOMEWORK_REQUIRE_FEEDBACK_FOR_REVIEW,
  ),
} as const;

