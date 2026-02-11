// Server-only tutor data helpers keep tutor ownership + tenant scoping consistent across endpoints/pages.
import "server-only";

import { AttendanceStatus, SessionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseParentVisibleNote } from "@/lib/validation/attendance";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const DEFAULT_RANGE_DAYS = 7;

type SessionCursorTuple = {
  startAt: string;
  id: string;
};

export type TutorDataErrorCode =
  | "ValidationError"
  | "NotFound"
  | "Forbidden";

export class TutorDataError extends Error {
  status: number;
  code: TutorDataErrorCode;
  details: Record<string, unknown>;

  constructor(
    status: number,
    code: TutorDataErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TutorDataError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type TutorSessionListItem = {
  sessionId: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  label: string;
  locationLabel: string | null;
  sessionType: SessionType;
};

export type TutorRunSessionItem = {
  studentId: string;
  displayName: string;
  attendanceStatus: AttendanceStatus | null;
  parentVisibleNote: string | null;
};

export type TutorRunSessionData = {
  session: {
    sessionId: string;
    startDateTime: string;
    endDateTime: string;
    timezone: string;
    label: string;
    locationLabel: string | null;
    sessionType: SessionType;
  };
  roster: TutorRunSessionItem[];
};

type SessionSelectShape = {
  id: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  sessionType: SessionType;
  center: { name: string } | null;
  group: { name: string } | null;
  sessionStudents: Array<{
    student: {
      firstName: string;
      lastName: string;
      preferredName: string | null;
    };
  }>;
};

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function toDateStart(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function toDateEnd(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit) || limit <= 0) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
}

function encodeSessionCursor(cursor: SessionCursorTuple) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeSessionCursor(raw: string): SessionCursorTuple | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<SessionCursorTuple>;

    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string" || typeof parsed.startAt !== "string") {
      return null;
    }

    const parsedDate = new Date(parsed.startAt);
    if (Number.isNaN(parsedDate.getTime())) return null;

    return { id: parsed.id, startAt: parsedDate.toISOString() };
  } catch {
    return null;
  }
}

function formatStudentDisplayName(student: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}) {
  const preferred = student.preferredName?.trim();
  if (preferred) {
    return `${preferred} ${student.lastName}`.trim();
  }
  return `${student.firstName} ${student.lastName}`.trim();
}

function buildSessionLabel(session: SessionSelectShape) {
  const groupName = session.group?.name?.trim();
  if (groupName) return groupName;

  if (session.sessionType === "ONE_ON_ONE") {
    const student = session.sessionStudents[0]?.student;
    if (student) {
      return formatStudentDisplayName(student);
    }
  }

  // Fallback keeps label deterministic even if roster data is temporarily incomplete.
  return session.sessionType;
}

function buildListItem(session: SessionSelectShape): TutorSessionListItem {
  return {
    sessionId: session.id,
    startDateTime: session.startAt.toISOString(),
    endDateTime: session.endAt.toISOString(),
    timezone: session.timezone,
    label: buildSessionLabel(session),
    locationLabel: session.center?.name ?? null,
    sessionType: session.sessionType,
  };
}

async function getSessionRosterStudentIds(input: {
  tenantId: string;
  sessionId: string;
  groupId: string | null;
}) {
  const sessionStudentRows = await prisma.sessionStudent.findMany({
    where: {
      tenantId: input.tenantId,
      sessionId: input.sessionId,
    },
    select: { studentId: true },
  });

  if (sessionStudentRows.length > 0) {
    return {
      studentIds: sessionStudentRows.map((row) => row.studentId),
      shouldBackfillSnapshot: false,
    };
  }

  if (!input.groupId) {
    return {
      studentIds: [] as string[],
      shouldBackfillSnapshot: false,
    };
  }

  // Group/class sessions can recover from missing snapshots by reading current group roster.
  const groupStudentRows = await prisma.groupStudent.findMany({
    where: {
      tenantId: input.tenantId,
      groupId: input.groupId,
    },
    select: { studentId: true },
  });

  return {
    studentIds: groupStudentRows.map((row) => row.studentId),
    shouldBackfillSnapshot: groupStudentRows.length > 0,
  };
}

export async function listTutorSessions(input: {
  tenantId: string;
  tutorUserId: string;
  startDate?: Date;
  endDate?: Date;
  cursor?: string | null;
  limit?: number;
}) {
  const now = new Date();
  const normalizedStart = toDateStart(input.startDate ?? now);
  const normalizedEnd = toDateEnd(
    input.endDate ?? addDays(now, DEFAULT_RANGE_DAYS),
  );
  const normalizedLimit = normalizeLimit(input.limit);

  const parsedCursor = input.cursor ? decodeSessionCursor(input.cursor) : null;
  if (input.cursor && !parsedCursor) {
    throw new TutorDataError(400, "ValidationError", "Invalid cursor", {
      field: "cursor",
    });
  }

  const cursorStart = parsedCursor ? new Date(parsedCursor.startAt) : null;

  const sessions = await prisma.session.findMany({
    where: {
      tenantId: input.tenantId,
      tutorId: input.tutorUserId,
      startAt: {
        gte: normalizedStart,
        lte: normalizedEnd,
      },
      ...(parsedCursor && cursorStart
        ? {
            OR: [
              { startAt: { gt: cursorStart } },
              { startAt: cursorStart, id: { gt: parsedCursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: normalizedLimit + 1,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      timezone: true,
      sessionType: true,
      center: { select: { name: true } },
      group: { select: { name: true } },
      // A tiny preview is enough to derive 1:1 labels without loading full rosters.
      sessionStudents: {
        take: 1,
        select: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
    },
  });

  const pageItems = sessions.slice(0, normalizedLimit);
  const hasMore = sessions.length > normalizedLimit;

  return {
    items: pageItems.map((session) => buildListItem(session)),
    nextCursor: hasMore
      ? encodeSessionCursor({
          startAt: pageItems[pageItems.length - 1].startAt.toISOString(),
          id: pageItems[pageItems.length - 1].id,
        })
      : null,
  };
}

export async function getTutorSessionForRun(input: {
  tenantId: string;
  tutorUserId: string;
  sessionId: string;
}): Promise<TutorRunSessionData | null> {
  const session = await prisma.session.findFirst({
    where: {
      id: input.sessionId,
      tenantId: input.tenantId,
      tutorId: input.tutorUserId,
    },
    select: {
      id: true,
      tenantId: true,
      groupId: true,
      startAt: true,
      endAt: true,
      timezone: true,
      sessionType: true,
      center: { select: { name: true } },
      group: { select: { name: true } },
      sessionStudents: {
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  let rosterStudents = session.sessionStudents.map((entry) => entry.student);
  if (!rosterStudents.length && session.groupId) {
    // Fallback preserves tutor workflows when older sessions are missing snapshot rows.
    const groupRoster = await prisma.groupStudent.findMany({
      where: {
        tenantId: input.tenantId,
        groupId: session.groupId,
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
      },
    });
    rosterStudents = groupRoster.map((entry) => entry.student);
  }

  const rosterStudentIds = rosterStudents.map((student) => student.id);
  const attendanceRows = rosterStudentIds.length
    ? await prisma.attendance.findMany({
        where: {
          tenantId: input.tenantId,
          sessionId: session.id,
          studentId: { in: rosterStudentIds },
        },
        select: {
          studentId: true,
          status: true,
          // Tutor Run Session only exposes parent-visible notes (never internal notes).
          parentVisibleNote: true,
        },
      })
    : [];

  const attendanceByStudentId = new Map(
    attendanceRows.map((row) => [
      row.studentId,
      {
        status: row.status,
        parentVisibleNote: row.parentVisibleNote,
      },
    ]),
  );

  return {
    session: {
      sessionId: session.id,
      startDateTime: session.startAt.toISOString(),
      endDateTime: session.endAt.toISOString(),
      timezone: session.timezone,
      label: buildSessionLabel(session),
      locationLabel: session.center?.name ?? null,
      sessionType: session.sessionType,
    },
    roster: rosterStudents.map((student) => {
      const attendance = attendanceByStudentId.get(student.id);
      return {
        studentId: student.id,
        displayName: formatStudentDisplayName(student),
        attendanceStatus: attendance?.status ?? null,
        parentVisibleNote: attendance?.parentVisibleNote ?? null,
      };
    }),
  };
}

export async function saveTutorSessionExecution(input: {
  tenantId: string;
  tutorUserId: string;
  sessionId: string;
  updates: Array<{
    studentId: string;
    attendanceStatus: AttendanceStatus;
    parentVisibleNote?: string | null;
  }>;
}) {
  if (!input.updates.length) {
    throw new TutorDataError(
      400,
      "ValidationError",
      "At least one update is required",
      { field: "updates" },
    );
  }

  const seenStudentIds = new Set<string>();
  const duplicateStudent = input.updates.find((update) => {
    if (seenStudentIds.has(update.studentId)) {
      return true;
    }
    seenStudentIds.add(update.studentId);
    return false;
  });
  if (duplicateStudent) {
    throw new TutorDataError(
      400,
      "ValidationError",
      "Duplicate student update",
      { studentId: duplicateStudent.studentId },
    );
  }

  const session = await prisma.session.findFirst({
    where: {
      id: input.sessionId,
      tenantId: input.tenantId,
      tutorId: input.tutorUserId,
    },
    select: {
      id: true,
      groupId: true,
    },
  });

  // Return NotFound to avoid revealing session ownership across tutors.
  if (!session) {
    throw new TutorDataError(404, "NotFound", "Session not found");
  }

  const { studentIds, shouldBackfillSnapshot } = await getSessionRosterStudentIds(
    {
      tenantId: input.tenantId,
      sessionId: session.id,
      groupId: session.groupId,
    },
  );
  const rosterSet = new Set(studentIds);

  const normalizedUpdates = input.updates.map((update) => {
    const parsedParentVisibleNote = parseParentVisibleNote(
      update.parentVisibleNote,
    );
    if (!parsedParentVisibleNote.ok) {
      throw new TutorDataError(
        400,
        parsedParentVisibleNote.error.code,
        parsedParentVisibleNote.error.message,
        parsedParentVisibleNote.error.details,
      );
    }

    return {
      studentId: update.studentId,
      attendanceStatus: update.attendanceStatus,
      parentVisibleNote: parsedParentVisibleNote.value,
      parentVisibleNoteProvided: parsedParentVisibleNote.provided,
    };
  });

  const invalidUpdate = normalizedUpdates.find(
    (update) => !rosterSet.has(update.studentId),
  );
  if (invalidUpdate) {
    throw new TutorDataError(
      400,
      "ValidationError",
      "Student is not in this session roster",
      { studentId: invalidUpdate.studentId },
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (shouldBackfillSnapshot && studentIds.length > 0) {
      // Persist fallback roster rows so future writes/reads stay session-scoped.
      await tx.sessionStudent.createMany({
        data: studentIds.map((studentId) => ({
          tenantId: input.tenantId,
          sessionId: session.id,
          studentId,
        })),
        skipDuplicates: true,
      });
    }

    await Promise.all(
      normalizedUpdates.map((update) =>
        tx.attendance.upsert({
          where: {
            tenantId_sessionId_studentId: {
              tenantId: input.tenantId,
              sessionId: session.id,
              studentId: update.studentId,
            },
          },
          create: {
            tenantId: input.tenantId,
            sessionId: session.id,
            studentId: update.studentId,
            status: update.attendanceStatus,
            markedByUserId: input.tutorUserId,
            markedAt: now,
            ...(update.parentVisibleNoteProvided
              ? {
                  parentVisibleNote: update.parentVisibleNote,
                  parentVisibleNoteUpdatedAt: now,
                }
              : {}),
          },
          update: {
            status: update.attendanceStatus,
            markedByUserId: input.tutorUserId,
            markedAt: now,
            ...(update.parentVisibleNoteProvided
              ? {
                  parentVisibleNote: update.parentVisibleNote,
                  parentVisibleNoteUpdatedAt: now,
                }
              : {}),
          },
        }),
      ),
    );
  });

  return { ok: true as const };
}
