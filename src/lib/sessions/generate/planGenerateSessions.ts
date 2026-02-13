// Shared generation planner keeps preview and commit behavior aligned for session batch creation.
import "server-only";

import { DateTime } from "luxon";
import { z } from "zod";

import { Prisma, SessionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  generateOccurrences,
  type SessionOccurrence,
} from "@/lib/sessions/generator";
import { normalizeZoomLink } from "@/lib/sessions/zoomLink";

const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SAMPLE_LIMIT = 10;

export const GenerateSessionsInputSchema = z
  .object({
    centerId: z.string().trim().min(1),
    tutorId: z.string().trim().min(1),
    sessionType: z.nativeEnum(SessionType),
    studentId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
    startDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    startTime: z.string().trim().regex(TIME_REGEX),
    endTime: z.string().trim().regex(TIME_REGEX),
    timezone: z.string().trim().min(1),
    zoomLink: z.string().nullable().optional(),
  })
  .strict();

export type GenerateSessionsInput = z.infer<typeof GenerateSessionsInputSchema>;

type GenerateSampleReason =
  | "DUPLICATE_SESSION_EXISTS"
  | "TUTOR_START_COLLISION"
  | "STUDENT_START_COLLISION";

export type PlanGenerateSessionsResult = {
  range: { from: Date; to: Date };
  wouldCreateCount: number;
  wouldSkipDuplicateCount: number;
  wouldConflictCount: number;
  duplicatesSummary: {
    count: number;
    sample: Array<{ date: string; reason: GenerateSampleReason }>;
  };
  conflictsSummary: {
    count: number;
    sample: Array<{ date: string; reason: GenerateSampleReason }>;
  };
  zoomLinkApplied: boolean;
  _plan: {
    sessionsToCreate: Array<{
      data: Prisma.SessionUncheckedCreateInput;
      rosterStudentIds: string[];
    }>;
  };
};

export class GeneratePlanError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(details);
    this.name = "GeneratePlanError";
    this.status = status;
    this.details = details;
  }
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  return hour * 60 + minute;
}

function isValidTimezone(timezone: string): boolean {
  return DateTime.now().setZone(timezone).isValid;
}

function toRange(occurrences: SessionOccurrence[], input: GenerateSessionsInput) {
  if (occurrences.length > 0) {
    return {
      from: occurrences[0].startAtUtc,
      to: occurrences[occurrences.length - 1].endAtUtc,
    };
  }

  const fallbackFrom = DateTime.fromISO(`${input.startDate}T${input.startTime}`, {
    zone: input.timezone,
  }).toUTC();
  const fallbackTo = DateTime.fromISO(`${input.endDate}T${input.endTime}`, {
    zone: input.timezone,
  }).toUTC();
  return {
    from: fallbackFrom.isValid ? fallbackFrom.toJSDate() : new Date(),
    to: fallbackTo.isValid ? fallbackTo.toJSDate() : new Date(),
  };
}

function addSample(
  target: Array<{ date: string; reason: GenerateSampleReason }>,
  occurrence: SessionOccurrence,
  reason: GenerateSampleReason,
) {
  if (target.length >= SAMPLE_LIMIT) return;
  target.push({ date: occurrence.startAtUtc.toISOString(), reason });
}

function getDuplicateReason(input: {
  sessionType: SessionType;
  centerId: string;
  tutorId: string;
  groupId?: string;
  studentId?: string;
  existingAtStart: Array<{
    centerId: string;
    tutorId: string;
    groupId: string | null;
    sessionType: SessionType;
    sessionStudents: Array<{ studentId: string }>;
  }>;
}): GenerateSampleReason | null {
  if (input.sessionType === "ONE_ON_ONE") {
    const studentId = input.studentId ?? "";
    if (!studentId) return null;
    const duplicate = input.existingAtStart.some(
      (session) =>
        session.centerId === input.centerId &&
        session.tutorId === input.tutorId &&
        session.sessionType === "ONE_ON_ONE" &&
        session.sessionStudents.some((entry) => entry.studentId === studentId),
    );
    return duplicate ? "DUPLICATE_SESSION_EXISTS" : null;
  }

  const duplicate = input.existingAtStart.some(
    (session) =>
      session.centerId === input.centerId &&
      session.tutorId === input.tutorId &&
      session.groupId === (input.groupId ?? null) &&
      session.sessionType === input.sessionType,
  );
  return duplicate ? "DUPLICATE_SESSION_EXISTS" : null;
}

function getConflictReason(input: {
  tutorId: string;
  rosterStudentIdSet: Set<string>;
  existingAtStart: Array<{
    tutorId: string;
    sessionStudents: Array<{ studentId: string }>;
  }>;
}): GenerateSampleReason | null {
  const hasTutorCollision = input.existingAtStart.some(
    (session) => session.tutorId === input.tutorId,
  );
  if (hasTutorCollision) {
    return "TUTOR_START_COLLISION";
  }

  if (input.rosterStudentIdSet.size === 0) {
    return null;
  }

  const hasStudentCollision = input.existingAtStart.some((session) =>
    session.sessionStudents.some((entry) =>
      input.rosterStudentIdSet.has(entry.studentId),
    ),
  );
  return hasStudentCollision ? "STUDENT_START_COLLISION" : null;
}

export async function planGenerateSessions(input: {
  tenantId: string;
  actorId: string;
  data: GenerateSessionsInput;
}): Promise<PlanGenerateSessionsResult> {
  const { tenantId, data } = input;

  if (!isValidTimezone(data.timezone)) {
    throw new GeneratePlanError(400, "Invalid timezone");
  }

  if (toMinutes(data.endTime) <= toMinutes(data.startTime)) {
    throw new GeneratePlanError(400, "endTime must be after startTime");
  }

  if (data.sessionType === "ONE_ON_ONE") {
    if (!data.studentId) {
      throw new GeneratePlanError(400, "studentId is required");
    }
    if (data.groupId) {
      throw new GeneratePlanError(400, "groupId is not allowed");
    }
  }

  if (data.sessionType === "GROUP" || data.sessionType === "CLASS") {
    if (!data.groupId) {
      throw new GeneratePlanError(400, "groupId is required");
    }
    if (data.studentId) {
      throw new GeneratePlanError(400, "studentId is not allowed");
    }
  }

  let occurrences: SessionOccurrence[];
  try {
    occurrences = generateOccurrences({
      startDate: data.startDate,
      endDate: data.endDate,
      weekdays: data.weekdays,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
    });
  } catch (error) {
    throw new GeneratePlanError(
      400,
      error instanceof Error ? error.message : "Invalid recurrence input",
    );
  }

  const center = await prisma.center.findFirst({
    where: { id: data.centerId, tenantId },
    select: { id: true },
  });
  if (!center) {
    throw new GeneratePlanError(400, "Center not found for tenant");
  }

  const tutorMembership = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId: data.tutorId, role: "Tutor" },
    select: { id: true },
  });
  if (!tutorMembership) {
    throw new GeneratePlanError(
      400,
      "Tutor must have Tutor role in this tenant",
    );
  }

  const staffCenter = await prisma.staffCenter.findFirst({
    where: { tenantId, userId: data.tutorId, centerId: data.centerId },
    select: { id: true },
  });
  if (!staffCenter) {
    throw new GeneratePlanError(400, "Tutor is not assigned to this center");
  }

  let rosterStudentIds: string[] = [];
  if (data.sessionType === "ONE_ON_ONE") {
    const student = await prisma.student.findFirst({
      where: { id: data.studentId, tenantId },
      select: { id: true },
    });
    if (!student) {
      throw new GeneratePlanError(400, "Student not found for tenant");
    }
    rosterStudentIds = [data.studentId!];
  } else {
    const group = await prisma.group.findFirst({
      where: { id: data.groupId, tenantId },
      select: { id: true, centerId: true, type: true },
    });
    if (!group) {
      throw new GeneratePlanError(400, "Group not found for tenant");
    }
    if (group.centerId !== data.centerId) {
      throw new GeneratePlanError(400, "Group does not belong to center");
    }
    if (data.sessionType === "GROUP" && group.type !== "GROUP") {
      throw new GeneratePlanError(400, "Group type must be GROUP");
    }
    if (data.sessionType === "CLASS" && group.type !== "CLASS") {
      throw new GeneratePlanError(400, "Group type must be CLASS");
    }

    const roster = await prisma.groupStudent.findMany({
      where: { tenantId, groupId: data.groupId },
      select: { studentId: true },
    });
    rosterStudentIds = roster.map((entry) => entry.studentId);
  }

  let normalizedZoomLink: string | null = null;
  try {
    normalizedZoomLink = normalizeZoomLink(data.zoomLink);
  } catch {
    throw new GeneratePlanError(400, "Invalid zoom link");
  }

  const startTimes = occurrences.map((occurrence) => occurrence.startAtUtc);
  const existingSessions = startTimes.length
    ? await prisma.session.findMany({
        where: {
          tenantId,
          startAt: { in: startTimes },
        },
        select: {
          id: true,
          centerId: true,
          tutorId: true,
          groupId: true,
          sessionType: true,
          startAt: true,
          sessionStudents: { select: { studentId: true } },
        },
      })
    : [];

  const existingByStart = new Map<number, typeof existingSessions>();
  for (const session of existingSessions) {
    const key = session.startAt.getTime();
    const existing = existingByStart.get(key);
    if (existing) {
      existing.push(session);
    } else {
      existingByStart.set(key, [session]);
    }
  }

  const rosterStudentIdSet = new Set(rosterStudentIds);
  const sessionsToCreate: PlanGenerateSessionsResult["_plan"]["sessionsToCreate"] =
    [];
  const duplicateSamples: Array<{ date: string; reason: GenerateSampleReason }> =
    [];
  const conflictSamples: Array<{ date: string; reason: GenerateSampleReason }> = [];
  let duplicateCount = 0;
  let conflictCount = 0;

  for (const occurrence of occurrences) {
    const existingAtStart =
      existingByStart.get(occurrence.startAtUtc.getTime()) ?? [];

    const duplicateReason = getDuplicateReason({
      sessionType: data.sessionType,
      centerId: data.centerId,
      tutorId: data.tutorId,
      groupId: data.groupId,
      studentId: data.studentId,
      existingAtStart,
    });
    if (duplicateReason) {
      duplicateCount += 1;
      addSample(duplicateSamples, occurrence, duplicateReason);
      continue;
    }

    const conflictReason = getConflictReason({
      tutorId: data.tutorId,
      rosterStudentIdSet,
      existingAtStart,
    });
    if (conflictReason) {
      conflictCount += 1;
      addSample(conflictSamples, occurrence, conflictReason);
      continue;
    }

    sessionsToCreate.push({
      data: {
        tenantId,
        centerId: data.centerId,
        tutorId: data.tutorId,
        sessionType: data.sessionType,
        groupId: data.groupId ?? null,
        startAt: occurrence.startAtUtc,
        endAt: occurrence.endAtUtc,
        timezone: data.timezone,
        zoomLink: normalizedZoomLink,
      },
      rosterStudentIds,
    });
  }

  return {
    range: toRange(occurrences, data),
    wouldCreateCount: sessionsToCreate.length,
    wouldSkipDuplicateCount: duplicateCount,
    wouldConflictCount: conflictCount,
    duplicatesSummary: {
      count: duplicateCount,
      sample: duplicateSamples,
    },
    conflictsSummary: {
      count: conflictCount,
      sample: conflictSamples,
    },
    zoomLinkApplied: Boolean(normalizedZoomLink),
    _plan: {
      sessionsToCreate,
    },
  };
}
