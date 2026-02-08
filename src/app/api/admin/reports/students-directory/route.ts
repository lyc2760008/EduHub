import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { type Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  formatDisplayName,
  mapStatusFilterToStudentStatuses,
  type ActiveInactiveAll,
} from "@/lib/reports/adminReportUtils";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const querySchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
    programId: z.string().trim().min(1).optional(),
    levelId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
  })
  .strict();

function buildGradeLevel(grade: string | null, levelName: string | null) {
  if (grade && levelName) return `${grade} / ${levelName}`;
  return grade ?? levelName ?? null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireRole(req, ADMIN_ROLES);
  if (ctx instanceof Response) return ctx;

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const tenantId = ctx.tenant.tenantId;
  const { status, programId, levelId, groupId } = parsed.data;
  const statuses = mapStatusFilterToStudentStatuses(status as ActiveInactiveAll);

  const andFilters: Prisma.StudentWhereInput[] = [];
  if (groupId) {
    andFilters.push({
      groupStudents: {
        some: { groupId },
      },
    });
  }
  if (programId) {
    andFilters.push({
      groupStudents: {
        some: { group: { programId } },
      },
    });
  }
  if (levelId) {
    andFilters.push({
      OR: [
        { levelId },
        {
          groupStudents: {
            some: { group: { levelId } },
          },
        },
      ],
    });
  }

  const where: Prisma.StudentWhereInput = {
    tenantId,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(andFilters.length ? { AND: andFilters } : {}),
  };

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      status: true,
      grade: true,
      level: { select: { name: true } },
      groupStudents: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              program: {
                select: {
                  name: true,
                  subject: { select: { name: true } },
                },
              },
              tutors: {
                select: {
                  user: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      },
      parents: {
        select: {
          parent: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  const rows = students.map((student) => {
    const groups = student.groupStudents
      .map((entry) => entry.group)
      .sort((left, right) => left.name.localeCompare(right.name));
    const primaryGroup = groups[0];
    const primaryTutor = primaryGroup?.tutors
      .map((entry) => entry.user.name?.trim() || entry.user.email)
      .sort((left, right) => left.localeCompare(right))[0];

    const programSubject = primaryGroup
      ? primaryGroup.program.subject?.name
        ? `${primaryGroup.program.name} (${primaryGroup.program.subject.name})`
        : primaryGroup.program.name
      : null;
    const parentEmails = student.parents.map((entry) => entry.parent.email);

    return {
      studentId: student.id,
      studentName: formatDisplayName(
        student.firstName,
        student.lastName,
        student.preferredName,
      ),
      status: student.status,
      gradeLevel: buildGradeLevel(student.grade, student.level?.name ?? null),
      programSubject,
      groupName: primaryGroup?.name ?? null,
      primaryTutor: primaryTutor ?? null,
      parentEmails,
      groupNames: groups.map((group) => group.name),
    };
  });

  return NextResponse.json({
    meta: {
      status,
      filters: { programId: programId ?? null, levelId: levelId ?? null, groupId: groupId ?? null },
    },
    rows,
  });
}
