// Tenant-scoped group helpers for APIs to keep validation consistent.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type GroupCore = {
  id: string;
  tenantId: string;
  name: string;
  type: "GROUP" | "CLASS";
  centerId: string;
  programId: string;
  levelId: string | null;
  isActive: boolean;
  capacity: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeIdArray(ids?: string[]): string[] {
  if (!ids) return [];
  const unique = new Set(ids.map((id) => id.trim()).filter(Boolean));
  return Array.from(unique);
}

export async function getGroupCoreForTenant(
  client: DbClient,
  tenantId: string,
  groupId: string,
): Promise<GroupCore | null> {
  return client.group.findFirst({
    where: { id: groupId, tenantId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      type: true,
      centerId: true,
      programId: true,
      levelId: true,
      isActive: true,
      capacity: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function validateGroupForeignKeys(
  client: DbClient,
  tenantId: string,
  input: {
    centerId?: string;
    programId?: string;
    levelId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.centerId !== undefined) {
    const center = await client.center.findFirst({
      where: { id: input.centerId, tenantId },
      select: { id: true },
    });
    if (!center) {
      return { ok: false, message: "Center not found for tenant" };
    }
  }

  if (input.programId !== undefined) {
    const program = await client.program.findFirst({
      where: { id: input.programId, tenantId },
      select: { id: true },
    });
    if (!program) {
      return { ok: false, message: "Program not found for tenant" };
    }
  }

  if (input.levelId !== undefined && input.levelId !== null) {
    const level = await client.level.findFirst({
      where: { id: input.levelId, tenantId },
      select: { id: true },
    });
    if (!level) {
      return { ok: false, message: "Level not found for tenant" };
    }
  }

  return { ok: true };
}

export async function validateTutorEligibility(
  client: DbClient,
  tenantId: string,
  centerId: string,
  tutorIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!tutorIds.length) return { ok: true };

  const memberships = await client.tenantMembership.findMany({
    where: { tenantId, userId: { in: tutorIds } },
    select: { userId: true },
  });

  if (memberships.length !== tutorIds.length) {
    return {
      ok: false,
      message: "One or more tutors do not belong to this tenant",
    };
  }

  const staffCenters = await client.staffCenter.findMany({
    where: { tenantId, centerId, userId: { in: tutorIds } },
    select: { userId: true },
  });

  if (staffCenters.length !== tutorIds.length) {
    return {
      ok: false,
      message: "One or more tutors are not assigned to this center",
    };
  }

  return { ok: true };
}

export async function validateStudentIds(
  client: DbClient,
  tenantId: string,
  studentIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!studentIds.length) return { ok: true };

  const students = await client.student.findMany({
    where: { tenantId, id: { in: studentIds } },
    select: { id: true },
  });

  if (students.length !== studentIds.length) {
    return {
      ok: false,
      message: "One or more students do not belong to this tenant",
    };
  }

  return { ok: true };
}

export async function replaceGroupTutors(
  client: DbClient,
  tenantId: string,
  groupId: string,
  tutorIds: string[],
): Promise<void> {
  await client.groupTutor.deleteMany({
    where: { tenantId, groupId },
  });

  if (tutorIds.length) {
    await client.groupTutor.createMany({
      data: tutorIds.map((userId) => ({
        tenantId,
        groupId,
        userId,
      })),
      skipDuplicates: true,
    });
  }
}

export async function replaceGroupStudents(
  client: DbClient,
  tenantId: string,
  groupId: string,
  studentIds: string[],
): Promise<void> {
  await client.groupStudent.deleteMany({
    where: { tenantId, groupId },
  });

  if (studentIds.length) {
    await client.groupStudent.createMany({
      data: studentIds.map((studentId) => ({
        tenantId,
        groupId,
        studentId,
      })),
      skipDuplicates: true,
    });
  }
}
