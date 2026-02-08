import "server-only";

import { z } from "zod";

import {
  RequestStatus,
  RequestType,
  SessionType,
  StudentStatus,
  type AttendanceStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type CsvColumn } from "@/lib/reports/adminReportCsv";

// Report IDs are fixed allowlists so unknown reports fail fast with 404.
export const REPORT_IDS = [
  "students",
  "sessions",
  "attendance",
  "requests",
] as const;

export type ReportId = (typeof REPORT_IDS)[number];
export type ReportSortDir = "asc" | "desc";

// Shared list query limits protect against unbounded pagination and exports.
export const REPORT_LIMITS = {
  maxPageSize: 100,
  defaultPageSize: 25,
  maxExportRows: 5000,
  maxSearchLength: 120,
} as const;

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const optionalIdSchema = z.string().trim().min(1).optional();

// Converts a date-only string to UTC start-of-day for deterministic filtering.
function parseDateStart(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

// Builds an exclusive upper bound by adding one day to a date-only value.
function parseDateEndExclusive(value?: string) {
  const start = parseDateStart(value);
  if (!start) return undefined;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// Normalizes display names for student-facing report rows.
function formatStudentName(
  firstName: string,
  lastName: string,
  preferredName?: string | null,
) {
  if (preferredName?.trim()) return preferredName.trim();
  return `${firstName} ${lastName}`.trim();
}

type ReportConfig<
  TFilterSchema extends z.ZodTypeAny,
  TSortField extends string,
  TDbRow,
  TApiRow,
> = {
  reportId: ReportId;
  filterSchema: TFilterSchema;
  allowedSortFields: readonly TSortField[];
  defaultSort: { field: TSortField; dir: ReportSortDir };
  defaultPageSize?: number;
  maxPageSize?: number;
  maxExportRows?: number;
  csvColumns: CsvColumn<TApiRow>[];
  buildWhere: (args: {
    tenantId: string;
    search?: string;
    filters: z.infer<TFilterSchema>;
  }) => Prisma.StudentWhereInput | Prisma.SessionWhereInput | Prisma.AttendanceWhereInput | Prisma.ParentRequestWhereInput;
  buildOrderBy: (
    field: TSortField,
    dir: ReportSortDir,
  ) => Prisma.Enumerable<
    | Prisma.StudentOrderByWithRelationInput
    | Prisma.SessionOrderByWithRelationInput
    | Prisma.AttendanceOrderByWithRelationInput
    | Prisma.ParentRequestOrderByWithRelationInput
  >;
  count: (
    where:
      | Prisma.StudentWhereInput
      | Prisma.SessionWhereInput
      | Prisma.AttendanceWhereInput
      | Prisma.ParentRequestWhereInput,
  ) => Promise<number>;
  findMany: (args: {
    where:
      | Prisma.StudentWhereInput
      | Prisma.SessionWhereInput
      | Prisma.AttendanceWhereInput
      | Prisma.ParentRequestWhereInput;
    orderBy: Prisma.Enumerable<
      | Prisma.StudentOrderByWithRelationInput
      | Prisma.SessionOrderByWithRelationInput
      | Prisma.AttendanceOrderByWithRelationInput
      | Prisma.ParentRequestOrderByWithRelationInput
    >;
    skip: number;
    take: number;
  }) => Promise<TDbRow[]>;
  mapRow: (row: TDbRow) => TApiRow;
};

type StudentFilterSchema = z.ZodObject<{
  status: z.ZodOptional<z.ZodEnum<["ACTIVE", "INACTIVE", "ALL"]>>;
  levelId: z.ZodOptional<z.ZodString>;
  hasParents: z.ZodOptional<z.ZodBoolean>;
}>;

type SessionFilterSchema = z.ZodObject<{
  from: z.ZodOptional<z.ZodString>;
  to: z.ZodOptional<z.ZodString>;
  tutorId: z.ZodOptional<z.ZodString>;
  groupId: z.ZodOptional<z.ZodString>;
  centerId: z.ZodOptional<z.ZodString>;
  sessionType: z.ZodOptional<
    z.ZodEnum<["ONE_ON_ONE", "GROUP", "CLASS"]>
  >;
}>;

type AttendanceFilterSchema = z.ZodObject<{
  from: z.ZodOptional<z.ZodString>;
  to: z.ZodOptional<z.ZodString>;
  studentId: z.ZodOptional<z.ZodString>;
  tutorId: z.ZodOptional<z.ZodString>;
  groupId: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<
    z.ZodEnum<["PRESENT", "ABSENT", "LATE", "EXCUSED", "ALL"]>
  >;
}>;

type RequestFilterSchema = z.ZodObject<{
  from: z.ZodOptional<z.ZodString>;
  to: z.ZodOptional<z.ZodString>;
  studentId: z.ZodOptional<z.ZodString>;
  tutorId: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<
    z.ZodEnum<["PENDING", "APPROVED", "DECLINED", "WITHDRAWN", "ALL"]>
  >;
}>;

const studentFilterSchema: StudentFilterSchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).optional(),
    levelId: optionalIdSchema,
    hasParents: z.boolean().optional(),
  })
  .strict();

const sessionFilterSchema: SessionFilterSchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    tutorId: optionalIdSchema,
    groupId: optionalIdSchema,
    centerId: optionalIdSchema,
    sessionType: z.enum(["ONE_ON_ONE", "GROUP", "CLASS"]).optional(),
  })
  .strict();

const attendanceFilterSchema: AttendanceFilterSchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    studentId: optionalIdSchema,
    tutorId: optionalIdSchema,
    groupId: optionalIdSchema,
    status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "ALL"]).optional(),
  })
  .strict();

const requestFilterSchema: RequestFilterSchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    studentId: optionalIdSchema,
    tutorId: optionalIdSchema,
    status: z
      .enum(["PENDING", "APPROVED", "DECLINED", "WITHDRAWN", "ALL"])
      .optional(),
  })
  .strict();

type StudentDbRow = Prisma.StudentGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    preferredName: true;
    status: true;
    level: { select: { name: true } };
    _count: { select: { parents: true } };
    createdAt: true;
  };
}>;

type SessionDbRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    startAt: true;
    endAt: true;
    sessionType: true;
    createdAt: true;
    center: { select: { name: true } };
    tutor: { select: { name: true; email: true } };
    group: {
      select: {
        name: true;
        program: { select: { name: true } };
      };
    };
    _count: { select: { sessionStudents: true } };
  };
}>;

type AttendanceDbRow = Prisma.AttendanceGetPayload<{
  select: {
    id: true;
    status: true;
    markedAt: true;
    student: {
      select: {
        firstName: true;
        lastName: true;
        preferredName: true;
      };
    };
    session: {
      select: {
        startAt: true;
        sessionType: true;
        tutor: { select: { name: true; email: true } };
        group: { select: { name: true } };
      };
    };
  };
}>;

type RequestDbRow = Prisma.ParentRequestGetPayload<{
  select: {
    id: true;
    status: true;
    createdAt: true;
    updatedAt: true;
    student: {
      select: {
        firstName: true;
        lastName: true;
        preferredName: true;
      };
    };
    parent: { select: { email: true } };
    session: {
      select: {
        startAt: true;
        tutor: { select: { name: true; email: true } };
      };
    };
  };
}>;

const studentsConfig: ReportConfig<
  StudentFilterSchema,
  "name" | "status" | "createdAt",
  StudentDbRow,
  {
    id: string;
    name: string;
    status: StudentStatus;
    levelName: string | null;
    parentCount: number;
    createdAt: string;
  }
> = {
  reportId: "students",
  filterSchema: studentFilterSchema,
  allowedSortFields: ["name", "status", "createdAt"],
  defaultSort: { field: "name", dir: "asc" },
  csvColumns: [
    { key: "name", header: "Name", getValue: (row) => row.name },
    { key: "status", header: "Status", getValue: (row) => row.status },
    { key: "levelName", header: "Level", getValue: (row) => row.levelName ?? "" },
    {
      key: "parentCount",
      header: "Parent Count",
      getValue: (row) => row.parentCount,
    },
    {
      key: "createdAt",
      header: "Created At",
      getValue: (row) => row.createdAt,
    },
  ],
  buildWhere: ({ tenantId, search, filters }) => {
    const andFilters: Prisma.StudentWhereInput[] = [{ tenantId }];
    if (search) {
      andFilters.push({
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { preferredName: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (filters.status === "ACTIVE") {
      andFilters.push({ status: StudentStatus.ACTIVE });
    }
    if (filters.status === "INACTIVE") {
      andFilters.push({ status: { in: [StudentStatus.INACTIVE, StudentStatus.ARCHIVED] } });
    }
    if (filters.levelId) {
      andFilters.push({ levelId: filters.levelId });
    }
    if (typeof filters.hasParents === "boolean") {
      andFilters.push({
        parents: filters.hasParents ? { some: {} } : { none: {} },
      });
    }
    return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
  },
  buildOrderBy: (field, dir) => {
    if (field === "status") return [{ status: dir }];
    if (field === "createdAt") return [{ createdAt: dir }];
    return [{ lastName: dir }, { firstName: dir }];
  },
  count: (where) =>
    prisma.student.count({ where: where as Prisma.StudentWhereInput }),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.student.findMany({
      where: where as Prisma.StudentWhereInput,
      orderBy: orderBy as Prisma.Enumerable<Prisma.StudentOrderByWithRelationInput>,
      skip,
      take,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        status: true,
        level: { select: { name: true } },
        _count: { select: { parents: true } },
        createdAt: true,
      },
    }),
  mapRow: (row) => ({
    id: row.id,
    name: formatStudentName(row.firstName, row.lastName, row.preferredName),
    status: row.status,
    levelName: row.level?.name ?? null,
    parentCount: row._count.parents,
    createdAt: row.createdAt.toISOString(),
  }),
};

const sessionsConfig: ReportConfig<
  SessionFilterSchema,
  "startAt" | "endAt" | "createdAt",
  SessionDbRow,
  {
    id: string;
    startAt: string;
    endAt: string;
    sessionType: SessionType;
    centerName: string;
    tutorName: string;
    groupName: string | null;
    programName: string | null;
    rosterCount: number;
  }
> = {
  reportId: "sessions",
  filterSchema: sessionFilterSchema,
  allowedSortFields: ["startAt", "endAt", "createdAt"],
  defaultSort: { field: "startAt", dir: "asc" },
  csvColumns: [
    { key: "startAt", header: "Start At", getValue: (row) => row.startAt },
    { key: "endAt", header: "End At", getValue: (row) => row.endAt },
    {
      key: "sessionType",
      header: "Session Type",
      getValue: (row) => row.sessionType,
    },
    { key: "centerName", header: "Center", getValue: (row) => row.centerName },
    { key: "tutorName", header: "Tutor", getValue: (row) => row.tutorName },
    {
      key: "groupName",
      header: "Group",
      getValue: (row) => row.groupName ?? "",
    },
    {
      key: "programName",
      header: "Program",
      getValue: (row) => row.programName ?? "",
    },
    {
      key: "rosterCount",
      header: "Roster Count",
      getValue: (row) => row.rosterCount,
    },
  ],
  buildWhere: ({ tenantId, search, filters }) => {
    const andFilters: Prisma.SessionWhereInput[] = [{ tenantId }];
    if (search) {
      andFilters.push({
        OR: [
          { tutor: { name: { contains: search, mode: "insensitive" } } },
          { tutor: { email: { contains: search, mode: "insensitive" } } },
          { center: { name: { contains: search, mode: "insensitive" } } },
          { group: { name: { contains: search, mode: "insensitive" } } },
          { group: { program: { name: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }
    const start = parseDateStart(filters.from);
    const endExclusive = parseDateEndExclusive(filters.to);
    if (start || endExclusive) {
      andFilters.push({
        startAt: {
          ...(start ? { gte: start } : {}),
          ...(endExclusive ? { lt: endExclusive } : {}),
        },
      });
    }
    if (filters.tutorId) andFilters.push({ tutorId: filters.tutorId });
    if (filters.groupId) andFilters.push({ groupId: filters.groupId });
    if (filters.centerId) andFilters.push({ centerId: filters.centerId });
    if (filters.sessionType) andFilters.push({ sessionType: filters.sessionType });

    return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
  },
  buildOrderBy: (field, dir) => {
    if (field === "endAt") return [{ endAt: dir }];
    if (field === "createdAt") return [{ createdAt: dir }];
    return [{ startAt: dir }];
  },
  count: (where) =>
    prisma.session.count({ where: where as Prisma.SessionWhereInput }),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.session.findMany({
      where: where as Prisma.SessionWhereInput,
      orderBy: orderBy as Prisma.Enumerable<Prisma.SessionOrderByWithRelationInput>,
      skip,
      take,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        sessionType: true,
        createdAt: true,
        center: { select: { name: true } },
        tutor: { select: { name: true, email: true } },
        group: {
          select: {
            name: true,
            program: { select: { name: true } },
          },
        },
        _count: { select: { sessionStudents: true } },
      },
    }),
  mapRow: (row) => ({
    id: row.id,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    sessionType: row.sessionType,
    centerName: row.center.name,
    tutorName: row.tutor.name?.trim() || row.tutor.email,
    groupName: row.group?.name ?? null,
    programName: row.group?.program.name ?? null,
    rosterCount: row._count.sessionStudents,
  }),
};

const attendanceConfig: ReportConfig<
  AttendanceFilterSchema,
  "markedAt" | "status" | "sessionStartAt",
  AttendanceDbRow,
  {
    id: string;
    status: AttendanceStatus;
    markedAt: string;
    studentName: string;
    sessionStartAt: string;
    sessionType: SessionType;
    tutorName: string;
    groupName: string | null;
  }
> = {
  reportId: "attendance",
  filterSchema: attendanceFilterSchema,
  allowedSortFields: ["markedAt", "status", "sessionStartAt"],
  defaultSort: { field: "markedAt", dir: "desc" },
  csvColumns: [
    { key: "status", header: "Status", getValue: (row) => row.status },
    { key: "markedAt", header: "Marked At", getValue: (row) => row.markedAt },
    { key: "studentName", header: "Student", getValue: (row) => row.studentName },
    {
      key: "sessionStartAt",
      header: "Session Start",
      getValue: (row) => row.sessionStartAt,
    },
    {
      key: "sessionType",
      header: "Session Type",
      getValue: (row) => row.sessionType,
    },
    { key: "tutorName", header: "Tutor", getValue: (row) => row.tutorName },
    { key: "groupName", header: "Group", getValue: (row) => row.groupName ?? "" },
  ],
  buildWhere: ({ tenantId, search, filters }) => {
    const andFilters: Prisma.AttendanceWhereInput[] = [{ tenantId }];
    if (search) {
      andFilters.push({
        OR: [
          { student: { firstName: { contains: search, mode: "insensitive" } } },
          { student: { lastName: { contains: search, mode: "insensitive" } } },
          { student: { preferredName: { contains: search, mode: "insensitive" } } },
          { session: { tutor: { name: { contains: search, mode: "insensitive" } } } },
          { session: { tutor: { email: { contains: search, mode: "insensitive" } } } },
          { session: { group: { name: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }
    const start = parseDateStart(filters.from);
    const endExclusive = parseDateEndExclusive(filters.to);
    if (start || endExclusive) {
      andFilters.push({
        session: {
          startAt: {
            ...(start ? { gte: start } : {}),
            ...(endExclusive ? { lt: endExclusive } : {}),
          },
        },
      });
    }
    if (filters.studentId) andFilters.push({ studentId: filters.studentId });
    if (filters.tutorId) andFilters.push({ session: { tutorId: filters.tutorId } });
    if (filters.groupId) andFilters.push({ session: { groupId: filters.groupId } });
    if (filters.status && filters.status !== "ALL") {
      andFilters.push({ status: filters.status as AttendanceStatus });
    }
    return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
  },
  buildOrderBy: (field, dir) => {
    if (field === "status") return [{ status: dir }, { markedAt: "desc" }];
    if (field === "sessionStartAt") return [{ session: { startAt: dir } }];
    return [{ markedAt: dir }];
  },
  count: (where) =>
    prisma.attendance.count({ where: where as Prisma.AttendanceWhereInput }),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.attendance.findMany({
      where: where as Prisma.AttendanceWhereInput,
      orderBy: orderBy as Prisma.Enumerable<Prisma.AttendanceOrderByWithRelationInput>,
      skip,
      take,
      select: {
        id: true,
        status: true,
        markedAt: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
        session: {
          select: {
            startAt: true,
            sessionType: true,
            tutor: { select: { name: true, email: true } },
            group: { select: { name: true } },
          },
        },
      },
    }),
  mapRow: (row) => ({
    id: row.id,
    status: row.status,
    markedAt: row.markedAt.toISOString(),
    studentName: formatStudentName(
      row.student.firstName,
      row.student.lastName,
      row.student.preferredName,
    ),
    sessionStartAt: row.session.startAt.toISOString(),
    sessionType: row.session.sessionType,
    tutorName: row.session.tutor.name?.trim() || row.session.tutor.email,
    groupName: row.session.group?.name ?? null,
  }),
};

const requestsConfig: ReportConfig<
  RequestFilterSchema,
  "createdAt" | "updatedAt" | "status",
  RequestDbRow,
  {
    id: string;
    status: RequestStatus;
    createdAt: string;
    updatedAt: string;
    studentName: string;
    parentEmail: string;
    sessionStartAt: string;
    tutorName: string;
  }
> = {
  reportId: "requests",
  filterSchema: requestFilterSchema,
  allowedSortFields: ["createdAt", "updatedAt", "status"],
  defaultSort: { field: "createdAt", dir: "desc" },
  csvColumns: [
    { key: "status", header: "Status", getValue: (row) => row.status },
    { key: "createdAt", header: "Created At", getValue: (row) => row.createdAt },
    { key: "updatedAt", header: "Updated At", getValue: (row) => row.updatedAt },
    { key: "studentName", header: "Student", getValue: (row) => row.studentName },
    {
      key: "parentEmail",
      header: "Parent Email",
      getValue: (row) => row.parentEmail,
    },
    {
      key: "sessionStartAt",
      header: "Session Start",
      getValue: (row) => row.sessionStartAt,
    },
    { key: "tutorName", header: "Tutor", getValue: (row) => row.tutorName },
  ],
  buildWhere: ({ tenantId, search, filters }) => {
    const andFilters: Prisma.ParentRequestWhereInput[] = [
      { tenantId },
      { type: RequestType.ABSENCE },
    ];
    if (search) {
      andFilters.push({
        OR: [
          { parent: { email: { contains: search, mode: "insensitive" } } },
          { student: { firstName: { contains: search, mode: "insensitive" } } },
          { student: { lastName: { contains: search, mode: "insensitive" } } },
          { student: { preferredName: { contains: search, mode: "insensitive" } } },
          { session: { tutor: { name: { contains: search, mode: "insensitive" } } } },
          { session: { tutor: { email: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }
    const start = parseDateStart(filters.from);
    const endExclusive = parseDateEndExclusive(filters.to);
    if (start || endExclusive) {
      andFilters.push({
        createdAt: {
          ...(start ? { gte: start } : {}),
          ...(endExclusive ? { lt: endExclusive } : {}),
        },
      });
    }
    if (filters.studentId) andFilters.push({ studentId: filters.studentId });
    if (filters.tutorId) andFilters.push({ session: { tutorId: filters.tutorId } });
    if (filters.status && filters.status !== "ALL") {
      andFilters.push({ status: filters.status as RequestStatus });
    }
    return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
  },
  buildOrderBy: (field, dir) => {
    if (field === "updatedAt") return [{ updatedAt: dir }];
    if (field === "status") return [{ status: dir }, { createdAt: "desc" }];
    return [{ createdAt: dir }];
  },
  count: (where) =>
    prisma.parentRequest.count({ where: where as Prisma.ParentRequestWhereInput }),
  findMany: ({ where, orderBy, skip, take }) =>
    prisma.parentRequest.findMany({
      where: where as Prisma.ParentRequestWhereInput,
      orderBy: orderBy as Prisma.Enumerable<Prisma.ParentRequestOrderByWithRelationInput>,
      skip,
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
        parent: { select: { email: true } },
        session: {
          select: {
            startAt: true,
            tutor: { select: { name: true, email: true } },
          },
        },
      },
    }),
  mapRow: (row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    studentName: formatStudentName(
      row.student.firstName,
      row.student.lastName,
      row.student.preferredName,
    ),
    parentEmail: row.parent.email,
    sessionStartAt: row.session.startAt.toISOString(),
    tutorName: row.session.tutor.name?.trim() || row.session.tutor.email,
  }),
};

// Exported map is the single source of truth for report query allowlists.
export const reportConfigs = {
  students: studentsConfig,
  sessions: sessionsConfig,
  attendance: attendanceConfig,
  requests: requestsConfig,
} as const;

export type ReportConfigMap = typeof reportConfigs;
