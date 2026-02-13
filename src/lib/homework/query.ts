// Shared homework query parsing/building keeps list/report filters and sort allowlists consistent.
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const homeworkQueueFilterSchema = z
  .object({
    status: z.enum(["ASSIGNED", "SUBMITTED", "REVIEWED", "ALL"]).optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
    tutorId: z.string().trim().min(1).optional(),
    centerId: z.string().trim().min(1).optional(),
    studentId: z.string().trim().min(1).optional(),
  })
  .strict();

export type HomeworkQueueFilters = z.infer<typeof homeworkQueueFilterSchema>;

export const HOMEWORK_QUEUE_SORT_FIELDS = ["submittedAt", "updatedAt"] as const;
export type HomeworkQueueSortField = (typeof HOMEWORK_QUEUE_SORT_FIELDS)[number];

export function parseDateStart(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseDateEndExclusive(value?: string) {
  const start = parseDateStart(value);
  if (!start) return undefined;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function buildHomeworkQueueOrderBy(
  field: HomeworkQueueSortField,
  dir: "asc" | "desc",
): Prisma.Enumerable<Prisma.HomeworkItemOrderByWithRelationInput> {
  if (field === "updatedAt") {
    return [{ updatedAt: dir }, { id: "asc" }];
  }
  // Default SLA-friendly ordering keeps oldest submissions first when sorting ascending.
  return [{ submittedAt: dir }, { updatedAt: "asc" }, { id: "asc" }];
}

export function buildHomeworkQueueWhere(args: {
  tenantId: string;
  filters: HomeworkQueueFilters;
  search?: string;
  tutorUserId?: string;
  linkedStudentIds?: string[];
}) {
  const andFilters: Prisma.HomeworkItemWhereInput[] = [{ tenantId: args.tenantId }];

  if (args.filters.status && args.filters.status !== "ALL") {
    andFilters.push({ status: args.filters.status });
  }

  const from = parseDateStart(args.filters.from);
  const toExclusive = parseDateEndExclusive(args.filters.to);
  if (from || toExclusive) {
    // Date filters use session start time for stable cross-status queue behavior.
    andFilters.push({
      session: {
        startAt: {
          ...(from ? { gte: from } : {}),
          ...(toExclusive ? { lt: toExclusive } : {}),
        },
      },
    });
  }

  if (args.filters.tutorId) {
    andFilters.push({ session: { tutorId: args.filters.tutorId } });
  }
  if (args.filters.centerId) {
    andFilters.push({ session: { centerId: args.filters.centerId } });
  }
  if (args.filters.studentId) {
    andFilters.push({ studentId: args.filters.studentId });
  }
  if (args.tutorUserId) {
    andFilters.push({ session: { tutorId: args.tutorUserId } });
  }
  if (args.linkedStudentIds) {
    andFilters.push({ studentId: { in: args.linkedStudentIds } });
  }

  if (args.search) {
    andFilters.push({
      OR: [
        { student: { firstName: { contains: args.search, mode: "insensitive" } } },
        { student: { lastName: { contains: args.search, mode: "insensitive" } } },
        {
          student: { preferredName: { contains: args.search, mode: "insensitive" } },
        },
        { session: { tutor: { name: { contains: args.search, mode: "insensitive" } } } },
        { session: { tutor: { email: { contains: args.search, mode: "insensitive" } } } },
        { sessionId: { contains: args.search, mode: "insensitive" } },
      ],
    });
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

export const homeworkSlaFilterSchema = z
  .object({
    status: z.enum(["ASSIGNED", "SUBMITTED", "REVIEWED", "ALL"]).optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
    tutorId: z.string().trim().min(1).optional(),
    centerId: z.string().trim().min(1).optional(),
  })
  .strict();

export type HomeworkSlaFilters = z.infer<typeof homeworkSlaFilterSchema>;

export function buildHomeworkSlaWhere(tenantId: string, filters: HomeworkSlaFilters) {
  const andFilters: Prisma.HomeworkItemWhereInput[] = [{ tenantId }];

  if (filters.status && filters.status !== "ALL") {
    andFilters.push({ status: filters.status });
  }

  const from = parseDateStart(filters.from);
  const toExclusive = parseDateEndExclusive(filters.to);
  if (from || toExclusive) {
    // SLA report range uses submittedAt to align with submit->review timing metrics.
    andFilters.push({
      submittedAt: {
        ...(from ? { gte: from } : {}),
        ...(toExclusive ? { lt: toExclusive } : {}),
      },
    });
  }

  if (filters.tutorId) {
    andFilters.push({ session: { tutorId: filters.tutorId } });
  }
  if (filters.centerId) {
    andFilters.push({ session: { centerId: filters.centerId } });
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

