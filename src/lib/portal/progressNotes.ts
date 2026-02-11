// Parent-portal progress-notes query helpers for Step 22.3.
import { SessionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export const PORTAL_PROGRESS_NOTES_DEFAULT_LIMIT = 10;
export const PORTAL_PROGRESS_NOTES_MAX_LIMIT = 50;

export type PortalProgressNoteItem = {
  id: string;
  occurredAt: string;
  sessionId: string;
  sessionType: SessionType;
  sessionTitle: string | null;
  timezone: string | null;
  tutorName: string | null;
  note: string;
};

type ProgressNoteCursorTuple = {
  occurredAt: string;
  id: string;
};

export type PortalProgressNotesPage = {
  items: PortalProgressNoteItem[];
  nextCursor: string | null;
};

type ListPortalProgressNotesInput = {
  tenantId: string;
  studentId: string;
  limit: number;
  cursor?: string | null;
};

function encodeProgressNoteCursor(cursor: ProgressNoteCursorTuple): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeProgressNoteCursor(raw: string): ProgressNoteCursorTuple | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<ProgressNoteCursorTuple>;
    if (!decoded || typeof decoded !== "object") return null;
    if (typeof decoded.id !== "string" || typeof decoded.occurredAt !== "string") {
      return null;
    }

    const parsedDate = new Date(decoded.occurredAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return {
      id: decoded.id,
      occurredAt: parsedDate.toISOString(),
    };
  } catch {
    return null;
  }
}

export function parseProgressNotesCursor(raw: string | null): ProgressNoteCursorTuple | null {
  if (!raw) return null;
  return decodeProgressNoteCursor(raw);
}

export function parseProgressNotesLimit(raw: string | null): number {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return PORTAL_PROGRESS_NOTES_DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), PORTAL_PROGRESS_NOTES_MAX_LIMIT);
}

export async function listPortalStudentProgressNotes(
  input: ListPortalProgressNotesInput,
): Promise<PortalProgressNotesPage | null> {
  const parsedCursor = input.cursor
    ? decodeProgressNoteCursor(input.cursor)
    : null;
  if (input.cursor && !parsedCursor) {
    return null;
  }

  const targetCount = input.limit + 1;
  // Over-fetch to drop whitespace-only notes without short pages.
  const batchSize = Math.min(Math.max(input.limit * 2, 20), 100);
  const items: PortalProgressNoteItem[] = [];
  let scanCursor = parsedCursor;

  while (items.length < targetCount) {
    const cursorDate = scanCursor ? new Date(scanCursor.occurredAt) : null;
    const rows = await prisma.attendance.findMany({
      where: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        parentVisibleNote: {
          not: null,
        },
        ...(cursorDate
          ? {
              OR: [
                {
                  session: {
                    startAt: {
                      lt: cursorDate,
                    },
                  },
                },
                {
                  session: {
                    startAt: cursorDate,
                  },
                  id: {
                    lt: scanCursor!.id,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        {
          session: {
            startAt: "desc",
          },
        },
        {
          id: "desc",
        },
      ],
      take: batchSize,
      select: {
        id: true,
        sessionId: true,
        parentVisibleNote: true,
        session: {
          select: {
            startAt: true,
            sessionType: true,
            timezone: true,
            group: {
              select: {
                name: true,
              },
            },
            tutor: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      scanCursor = {
        occurredAt: row.session.startAt.toISOString(),
        id: row.id,
      };

      const parentVisibleNote = row.parentVisibleNote?.trim() ?? "";
      if (!parentVisibleNote) {
        continue;
      }

      const tutorName = row.session.tutor?.name?.trim() ?? "";
      const sessionTitle = row.session.group?.name?.trim() ?? "";

      items.push({
        id: row.id,
        occurredAt: row.session.startAt.toISOString(),
        sessionId: row.sessionId,
        sessionType: row.session.sessionType,
        sessionTitle: sessionTitle || null,
        timezone: row.session.timezone ?? null,
        tutorName: tutorName || null,
        // Step 22.3 uses Attendance.parentVisibleNote because Parent Session Detail currently renders
        // attendance.parentVisibleNote as "Note shared with parents".
        note: parentVisibleNote,
      });

      if (items.length >= targetCount) {
        break;
      }
    }

    if (items.length >= targetCount) {
      break;
    }

    if (rows.length < batchSize) {
      break;
    }
  }

  const pageItems = items.slice(0, input.limit);
  const hasMore = items.length > input.limit;
  if (!hasMore || pageItems.length === 0) {
    return {
      items: pageItems,
      nextCursor: null,
    };
  }

  const lastItem = pageItems[pageItems.length - 1];
  return {
    items: pageItems,
    nextCursor: encodeProgressNoteCursor({
      occurredAt: lastItem.occurredAt,
      id: lastItem.id,
    }),
  };
}

