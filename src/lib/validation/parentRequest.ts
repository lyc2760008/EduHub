import { z } from "zod";

// Validation for parent request creation payloads (portal-safe only).

export const REQUEST_REASON_CODE_MAX_LENGTH = 50;
export const REQUEST_MESSAGE_MAX_LENGTH = 1000;

const messageOptional = z.preprocess((val) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return undefined;
    return trimmed;
  }
  return val;
}, z.string().max(REQUEST_MESSAGE_MAX_LENGTH).optional());

export const createParentRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    studentId: z.string().trim().min(1),
    reasonCode: z.string().trim().min(1).max(REQUEST_REASON_CODE_MAX_LENGTH),
    message: messageOptional,
  })
  .strict();

export type CreateParentRequestInput = z.infer<
  typeof createParentRequestSchema
>;
