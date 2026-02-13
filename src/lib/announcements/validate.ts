// Server-only announcement validation keeps title/body constraints consistent across admin mutations.
import "server-only";

import { z } from "zod";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
} from "@/lib/announcements/constants";

const announcementTitleBodySchema = z
  .object({
    title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
    body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
  })
  .strict();

export type AnnouncementTitleBodyInput = z.input<typeof announcementTitleBodySchema>;
export type AnnouncementTitleBodyValue = z.output<typeof announcementTitleBodySchema>;

export type AnnouncementValidationResult =
  | { ok: true; data: AnnouncementTitleBodyValue }
  | { ok: false; issues: z.ZodIssue[] };

// Never log title/body payloads on validation failures to avoid content leakage in server logs.
export function validateAnnouncementTitleBody(
  input: unknown,
): AnnouncementValidationResult {
  const parsed = announcementTitleBodySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues,
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}
