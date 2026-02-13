// Homework report helpers keep SLA filter parsing shared across JSON and CSV endpoints.
import "server-only";

import { z } from "zod";

import { homeworkSlaFilterSchema } from "@/lib/homework/query";
import { HomeworkError } from "@/lib/homework/errors";

const querySchema = z.object({
  filters: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().optional(),
  tutorId: z.string().optional(),
  centerId: z.string().optional(),
});

export function parseHomeworkSlaFilters(searchParams: URLSearchParams) {
  const parsed = querySchema.safeParse({
    filters: searchParams.get("filters") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    tutorId: searchParams.get("tutorId") ?? undefined,
    centerId: searchParams.get("centerId") ?? undefined,
  });

  if (!parsed.success) {
    throw new HomeworkError(400, "ValidationError", "Invalid query", {
      issues: parsed.error.issues,
    });
  }

  if (parsed.data.filters) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(parsed.data.filters);
    } catch {
      throw new HomeworkError(400, "ValidationError", "Invalid filters json", {
        field: "filters",
      });
    }
    const filterParse = homeworkSlaFilterSchema.safeParse(decoded);
    if (!filterParse.success) {
      throw new HomeworkError(400, "ValidationError", "Invalid filters", {
        issues: filterParse.error.issues,
      });
    }
    return filterParse.data;
  }

  const directParse = homeworkSlaFilterSchema.safeParse({
    from: parsed.data.from,
    to: parsed.data.to,
    status: parsed.data.status,
    tutorId: parsed.data.tutorId,
    centerId: parsed.data.centerId,
  });
  if (!directParse.success) {
    throw new HomeworkError(400, "ValidationError", "Invalid filters", {
      issues: directParse.error.issues,
    });
  }

  return directParse.data;
}

