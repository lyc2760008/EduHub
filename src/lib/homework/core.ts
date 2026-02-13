// Core homework domain helpers centralize item hydration, versioned file writes, detail shaping, and SLA rollups.
import "server-only";

import { randomUUID } from "node:crypto";

import { HomeworkFileSlot, HomeworkStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { HomeworkError } from "@/lib/homework/errors";
import { assertCanTransitionToReviewed, assertCanTransitionToSubmitted } from "@/lib/homework/status";
import { dbHomeworkStorageProvider } from "@/lib/homework/storage/dbStorage";
import type { ValidatedHomeworkFile } from "@/lib/homework/validation";
import { formatDisplayName } from "@/lib/reports/adminReportUtils";

export type HomeworkSlotCounts = {
  assignment: number;
  submission: number;
  feedback: number;
};

export type HomeworkVersionedFile = {
  id: string;
  slot: HomeworkFileSlot;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  uploadedAt: string;
  uploadedByRole: "ADMIN" | "TUTOR" | "PARENT" | "SYSTEM";
};

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function emptyHomeworkSlotCounts(): HomeworkSlotCounts {
  return {
    assignment: 0,
    submission: 0,
    feedback: 0,
  };
}

export function buildHomeworkSlotCounts(
  files: Array<{ slot: HomeworkFileSlot }>,
): HomeworkSlotCounts {
  const counts = emptyHomeworkSlotCounts();
  for (const file of files) {
    if (file.slot === "ASSIGNMENT") counts.assignment += 1;
    if (file.slot === "SUBMISSION") counts.submission += 1;
    if (file.slot === "FEEDBACK") counts.feedback += 1;
  }
  return counts;
}

export function groupHomeworkFilesBySlot(files: HomeworkVersionedFile[]) {
  const grouped: Record<HomeworkFileSlot, HomeworkVersionedFile[]> = {
    ASSIGNMENT: [],
    SUBMISSION: [],
    FEEDBACK: [],
  };

  for (const file of files) {
    grouped[file.slot].push(file);
  }
  return grouped;
}

export function toHomeworkVersionedFile(row: {
  id: string;
  slot: HomeworkFileSlot;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  uploadedAt: Date;
  uploadedByRole: "ADMIN" | "TUTOR" | "PARENT" | "SYSTEM";
}): HomeworkVersionedFile {
  return {
    id: row.id,
    slot: row.slot,
    version: row.version,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedByRole: row.uploadedByRole,
  };
}

export async function ensureHomeworkItemsForSessionStudents(input: {
  tenantId: string;
  studentIds?: string[];
  tutorUserId?: string;
  centerId?: string;
  from?: Date;
  toExclusive?: Date;
  maxRows?: number;
}) {
  const where: Prisma.SessionStudentWhereInput = {
    tenantId: input.tenantId,
    ...(input.studentIds?.length ? { studentId: { in: input.studentIds } } : {}),
    session: {
      canceledAt: null,
      ...(input.tutorUserId ? { tutorId: input.tutorUserId } : {}),
      ...(input.centerId ? { centerId: input.centerId } : {}),
      ...(input.from || input.toExclusive
        ? {
            startAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.toExclusive ? { lt: input.toExclusive } : {}),
            },
          }
        : {}),
    },
  };

  const rows = await prisma.sessionStudent.findMany({
    where,
    orderBy: [{ session: { startAt: "desc" } }, { id: "asc" }],
    take: Math.min(input.maxRows ?? 500, 500),
    select: {
      sessionId: true,
      studentId: true,
    },
  });

  if (!rows.length) {
    return { createdCount: 0, scannedCount: 0 };
  }

  const now = new Date();
  const created = await prisma.homeworkItem.createMany({
    data: rows.map((row) => ({
      tenantId: input.tenantId,
      sessionId: row.sessionId,
      studentId: row.studentId,
      status: "ASSIGNED",
      assignedAt: now,
    })),
    skipDuplicates: true,
  });

  return {
    createdCount: created.count,
    scannedCount: rows.length,
  };
}

export async function getHomeworkItemDetail(tenantId: string, homeworkItemId: string) {
  const item = await prisma.homeworkItem.findFirst({
    where: {
      id: homeworkItemId,
      tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      sessionId: true,
      studentId: true,
      status: true,
      assignedAt: true,
      submittedAt: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
      session: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          timezone: true,
          centerId: true,
          center: { select: { name: true } },
          tutorId: true,
          tutor: { select: { name: true, email: true } },
          group: {
            select: {
              id: true,
              name: true,
              program: { select: { id: true, name: true } },
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
        },
      },
      files: {
        orderBy: [{ slot: "asc" }, { version: "desc" }, { uploadedAt: "desc" }],
        select: {
          id: true,
          slot: true,
          version: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          checksum: true,
          uploadedByRole: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!item) {
    throw new HomeworkError(404, "NotFound", "Homework item not found");
  }

  const files = item.files.map((file) =>
    toHomeworkVersionedFile({
      ...file,
      uploadedByRole: file.uploadedByRole,
    }),
  );

  return {
    homeworkItemId: item.id,
    tenantId: item.tenantId,
    sessionId: item.sessionId,
    studentId: item.studentId,
    status: item.status,
    assignedAt: toIso(item.assignedAt),
    submittedAt: toIso(item.submittedAt),
    reviewedAt: toIso(item.reviewedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    session: {
      id: item.session.id,
      startAt: item.session.startAt.toISOString(),
      endAt: item.session.endAt.toISOString(),
      timezone: item.session.timezone,
      centerId: item.session.centerId,
      centerName: item.session.center?.name ?? null,
      tutorId: item.session.tutorId,
      tutorDisplay:
        item.session.tutor.name?.trim() || item.session.tutor.email || item.session.tutorId,
      groupId: item.session.group?.id ?? null,
      groupName: item.session.group?.name ?? null,
      programId: item.session.group?.program?.id ?? null,
      programLabel: item.session.group?.program?.name ?? null,
    },
    student: {
      id: item.student.id,
      displayName: formatDisplayName(
        item.student.firstName,
        item.student.lastName,
        item.student.preferredName,
      ),
    },
    files,
    fileCounts: buildHomeworkSlotCounts(item.files),
    filesBySlot: groupHomeworkFilesBySlot(files),
  };
}

export async function createHomeworkFileVersion(input: {
  tenantId: string;
  homeworkItemId: string;
  slot: HomeworkFileSlot;
  uploadedByRole: "ADMIN" | "TUTOR" | "PARENT" | "SYSTEM";
  uploadedByUserId?: string | null;
  file: ValidatedHomeworkFile;
  markSubmittedOnUpload?: boolean;
  lockWhenReviewed?: boolean;
}) {
  const fileId = randomUUID();
  const now = new Date();

  let rollbackSnapshot:
    | {
        homeworkItemId: string;
        status: HomeworkStatus;
        assignedAt: Date | null;
        submittedAt: Date | null;
      }
    | null = null;

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.homeworkItem.findFirst({
      where: {
        id: input.homeworkItemId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        status: true,
        sessionId: true,
        studentId: true,
        assignedAt: true,
        submittedAt: true,
      },
    });

    if (!item) {
      throw new HomeworkError(404, "NotFound", "Homework item not found");
    }

    if (input.lockWhenReviewed && item.status === "REVIEWED") {
      throw new HomeworkError(409, "Conflict", "Homework is already reviewed", {
        homeworkItemId: input.homeworkItemId,
      });
    }

    // Capture pre-write item values so metadata + status can be restored if storage persistence fails.
    rollbackSnapshot = {
      homeworkItemId: item.id,
      status: item.status,
      assignedAt: item.assignedAt ?? null,
      submittedAt: item.submittedAt ?? null,
    };

    const latest = await tx.homeworkFile.findFirst({
      where: {
        tenantId: input.tenantId,
        homeworkItemId: input.homeworkItemId,
        slot: input.slot,
      },
      orderBy: [{ version: "desc" }],
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    await tx.homeworkFile.create({
      data: {
        id: fileId,
        tenantId: input.tenantId,
        homeworkItemId: input.homeworkItemId,
        slot: input.slot,
        version: nextVersion,
        filename: input.file.filename,
        mimeType: input.file.mimeType,
        sizeBytes: input.file.sizeBytes,
        // Write-through seam: metadata row is created transactionally; bytes are persisted via storage provider right after commit.
        bytes: Buffer.alloc(0),
        checksum: input.file.checksum,
        uploadedByUserId: input.uploadedByUserId ?? null,
        uploadedByRole: input.uploadedByRole,
        uploadedAt: now,
      },
    });

    let toStatus: HomeworkStatus = item.status;
    if (input.markSubmittedOnUpload) {
      assertCanTransitionToSubmitted(item.status);
      toStatus = "SUBMITTED";
      await tx.homeworkItem.update({
        where: { id: input.homeworkItemId },
        data: {
          status: "SUBMITTED",
          submittedAt: now,
          assignedAt: item.assignedAt ?? now,
        },
      });
    } else if (input.slot === "ASSIGNMENT" && !item.assignedAt) {
      await tx.homeworkItem.update({
        where: { id: input.homeworkItemId },
        data: { assignedAt: now },
      });
    }

    return {
      fileId,
      version: nextVersion,
      statusFrom: item.status,
      statusTo: toStatus,
      sessionId: item.sessionId,
      studentId: item.studentId,
      uploadedAt: now.toISOString(),
    };
  });

  try {
    await dbHomeworkStorageProvider.put({
      tenantId: input.tenantId,
      fileId: created.fileId,
      bytes: input.file.bytes,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes,
      checksum: input.file.checksum,
    });
  } catch (error) {
    // Cleanup avoids orphan metadata rows when storage write fails after metadata transaction commit.
    await prisma.$transaction(async (tx) => {
      await tx.homeworkFile.deleteMany({
        where: {
          id: created.fileId,
          tenantId: input.tenantId,
        },
      });

      if (rollbackSnapshot) {
        await tx.homeworkItem.updateMany({
          where: {
            id: rollbackSnapshot.homeworkItemId,
            tenantId: input.tenantId,
          },
          data: {
            status: rollbackSnapshot.status,
            assignedAt: rollbackSnapshot.assignedAt,
            submittedAt: rollbackSnapshot.submittedAt,
          },
        });
      }
    });
    throw new HomeworkError(500, "InternalError", "Failed to persist homework file", {
      reason: error instanceof Error ? error.message : "UNKNOWN",
    });
  }

  return {
    id: created.fileId,
    slot: input.slot,
    version: created.version,
    filename: input.file.filename,
    mimeType: input.file.mimeType,
    sizeBytes: input.file.sizeBytes,
    uploadedAt: created.uploadedAt,
    statusFrom: created.statusFrom,
    statusTo: created.statusTo,
    sessionId: created.sessionId,
    studentId: created.studentId,
  };
}

export async function markHomeworkItemsReviewed(input: {
  tenantId: string;
  homeworkItemIds: string[];
  tutorUserId?: string;
  requireFeedbackFile: boolean;
}) {
  const ids = Array.from(
    new Set(input.homeworkItemIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (!ids.length) {
    throw new HomeworkError(400, "ValidationError", "homeworkItemIds is required", {
      field: "homeworkItemIds",
    });
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const scopedItems = await tx.homeworkItem.findMany({
      where: {
        tenantId: input.tenantId,
        id: { in: ids },
        ...(input.tutorUserId ? { session: { tutorId: input.tutorUserId } } : {}),
      },
      select: {
        id: true,
        status: true,
        sessionId: true,
        studentId: true,
      },
    });

    const submitted = scopedItems.filter((item) => item.status === "SUBMITTED");
    const submittedIds = submitted.map((item) => item.id);

    const feedbackIds = input.requireFeedbackFile
      ? new Set(
          (
            await tx.homeworkFile.findMany({
              where: {
                tenantId: input.tenantId,
                homeworkItemId: { in: submittedIds },
                slot: "FEEDBACK",
              },
              select: { homeworkItemId: true },
              distinct: ["homeworkItemId"],
            })
          ).map((row) => row.homeworkItemId),
        )
      : null;

    const eligible = submitted.filter((item) =>
      feedbackIds ? feedbackIds.has(item.id) : true,
    );

    // Defensive transition check keeps bulk updates aligned with status helpers.
    for (const row of eligible) {
      assertCanTransitionToReviewed(row.status);
    }

    const eligibleIds = eligible.map((item) => item.id);
    if (eligibleIds.length) {
      await tx.homeworkItem.updateMany({
        where: {
          tenantId: input.tenantId,
          id: { in: eligibleIds },
          status: "SUBMITTED",
        },
        data: {
          status: "REVIEWED",
          reviewedAt: now,
        },
      });
    }

    return {
      selectedCount: ids.length,
      reviewedCount: eligibleIds.length,
      skippedNotSubmittedCount: ids.length - eligibleIds.length,
      changedItems: eligible.map((item) => ({
        id: item.id,
        fromStatus: item.status,
        toStatus: "REVIEWED" as const,
        sessionId: item.sessionId,
        studentId: item.studentId,
      })),
    };
  });
}

type HomeworkSlaBreakdownRow = {
  centerId: string | null;
  centerName: string | null;
  tutorId: string | null;
  tutorDisplay: string | null;
  assignedCount: number;
  submittedCount: number;
  reviewedCount: number;
  reviewedDurationCount: number;
  avgReviewHours: number | null;
};

export async function computeHomeworkSlaSummary(input: {
  tenantId: string;
  where: Prisma.HomeworkItemWhereInput;
}) {
  const rows = await prisma.homeworkItem.findMany({
    where: input.where,
    select: {
      status: true,
      submittedAt: true,
      reviewedAt: true,
      session: {
        select: {
          centerId: true,
          center: { select: { name: true } },
          tutorId: true,
          tutor: { select: { name: true, email: true } },
        },
      },
    },
  });

  const countsByStatus = {
    ASSIGNED: 0,
    SUBMITTED: 0,
    REVIEWED: 0,
  };

  let reviewedDurationTotalHours = 0;
  let reviewedDurationCount = 0;
  const breakdown = new Map<string, HomeworkSlaBreakdownRow & { durationHours: number }>();

  for (const row of rows) {
    countsByStatus[row.status] += 1;

    const durationHours =
      row.submittedAt && row.reviewedAt
        ? (row.reviewedAt.getTime() - row.submittedAt.getTime()) / (1000 * 60 * 60)
        : null;

    if (durationHours !== null && Number.isFinite(durationHours) && durationHours >= 0) {
      reviewedDurationTotalHours += durationHours;
      reviewedDurationCount += 1;
    }

    const centerId = row.session.centerId ?? null;
    const tutorId = row.session.tutorId ?? null;
    const key = `${centerId ?? "none"}::${tutorId ?? "none"}`;
    const current = breakdown.get(key) ?? {
      centerId,
      centerName: row.session.center?.name ?? null,
      tutorId,
      tutorDisplay:
        row.session.tutor.name?.trim() ||
        row.session.tutor.email ||
        row.session.tutorId ||
        null,
      assignedCount: 0,
      submittedCount: 0,
      reviewedCount: 0,
      reviewedDurationCount: 0,
      avgReviewHours: null,
      durationHours: 0,
    };

    if (row.status === "ASSIGNED") current.assignedCount += 1;
    if (row.status === "SUBMITTED") current.submittedCount += 1;
    if (row.status === "REVIEWED") current.reviewedCount += 1;

    if (durationHours !== null && Number.isFinite(durationHours) && durationHours >= 0) {
      current.durationHours += durationHours;
      current.reviewedDurationCount += 1;
    }

    breakdown.set(key, current);
  }

  const breakdownRows: HomeworkSlaBreakdownRow[] = Array.from(breakdown.values())
    .map((row) => ({
      centerId: row.centerId,
      centerName: row.centerName,
      tutorId: row.tutorId,
      tutorDisplay: row.tutorDisplay,
      assignedCount: row.assignedCount,
      submittedCount: row.submittedCount,
      reviewedCount: row.reviewedCount,
      reviewedDurationCount: row.reviewedDurationCount,
      avgReviewHours:
        row.reviewedDurationCount > 0
          ? row.durationHours / row.reviewedDurationCount
          : null,
    }))
    .sort(
      (left, right) =>
        (left.centerName ?? "").localeCompare(right.centerName ?? "") ||
        (left.tutorDisplay ?? "").localeCompare(right.tutorDisplay ?? ""),
    );

  return {
    countsByStatus,
    avgReviewHours:
      reviewedDurationCount > 0
        ? reviewedDurationTotalHours / reviewedDurationCount
        : null,
    reviewedDurationCount,
    breakdownRows,
  };
}

export function toAttachmentContentDisposition(filename: string) {
  const safe = filename.replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
