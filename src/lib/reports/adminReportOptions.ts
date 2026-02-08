import { prisma } from "@/lib/db/prisma";
import { getUsersForTenant } from "@/lib/users/data";
import { formatDisplayName } from "@/lib/reports/adminReportUtils";

export type AdminReportTutorOption = {
  id: string;
  name: string;
};

export type AdminReportGroupOption = {
  id: string;
  name: string;
};

export type AdminReportStudentOption = {
  id: string;
  name: string;
};

export type AdminReportCenterOption = {
  id: string;
  name: string;
};

export type AdminReportProgramOption = {
  id: string;
  name: string;
};

export type AdminReportLevelOption = {
  id: string;
  name: string;
};

export type AdminReportOptions = {
  tutors: AdminReportTutorOption[];
  groups: AdminReportGroupOption[];
  students: AdminReportStudentOption[];
  centers: AdminReportCenterOption[];
  programs: AdminReportProgramOption[];
  levels: AdminReportLevelOption[];
};

export async function getAdminReportOptions(
  tenantId: string,
): Promise<AdminReportOptions> {
  const [users, groups, students, centers, programs, levels] = await Promise.all([
    getUsersForTenant(prisma, tenantId),
    prisma.group.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({
      where: { tenantId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
      },
    }),
    prisma.center.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.program.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subject: { select: { name: true } },
      },
    }),
    prisma.level.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const tutors = users
    .filter((user) => user.role === "Tutor")
    .map((user) => ({
      id: user.id,
      name: user.name?.trim() || user.email,
    }));

  return {
    tutors,
    groups,
    students: students.map((student) => ({
      id: student.id,
      name: formatDisplayName(
        student.firstName,
        student.lastName,
        student.preferredName,
      ),
    })),
    centers,
    programs: programs.map((program) => ({
      id: program.id,
      name: program.subject?.name
        ? `${program.name} (${program.subject.name})`
        : program.name,
    })),
    levels,
  };
}
