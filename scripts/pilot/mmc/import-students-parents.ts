// MMC Spring 2026 pilot import script for allowlisted parents/students (idempotent).
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { DateTime } from "luxon";
import * as XLSX from "xlsx";

import { prisma } from "../../../src/lib/db/prisma";
import { type Prisma } from "../../../src/generated/prisma/client";
import {
  AUTO_ENROLL_GROUP_BY_GRADE_KEY,
  MMC_SCHEDULE,
  buildGroupName,
} from "./mmc-schedule";

const USAGE = `\nUsage: pnpm pilot:mmc:import-students-parents [options]\n\nOptions:\n  --tenantSlug <slug>        Tenant slug (default: mmc)\n  --xlsxPath <path>          XLSX path (default: scripts/pilot/mmc/Student Record.xlsx)\n  --sheetName <name>         Sheet name (default: ????)\n  --allowlistPath <path>     Allowlist file (default: scripts/pilot/mmc/allowlist.txt)\n  --enrollmentsPath <path>   Optional JSON mapping (default: scripts/pilot/mmc/enrollments.json if exists)\n  --autoEnrollProgram <key>  Program key for conservative auto-enroll (default: singapore-math)\n  --dryRun                   Print actions without writing to the database\n  --help                     Show this help text\n`;

type Args = {
  tenantSlug: string;
  xlsxPath: string;
  sheetName: string;
  allowlistPath: string;
  enrollmentsPath?: string;
  autoEnrollProgram: string;
  dryRun: boolean;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

type EnrollmentOverrides = Record<string, Record<string, string[]>>;

type Summary = {
  parentsCreated: number;
  parentsUpdated: number;
  parentsReused: number;
  studentsCreated: number;
  studentsReused: number;
  linksCreated: number;
  enrollmentsCreated: number;
  rowsProcessed: number;
  rowsSkipped: number;
  enrollmentWarnings: string[];
};

const DEFAULT_ARGS: Args = {
  tenantSlug: "mmc",
  xlsxPath: "scripts/pilot/mmc/Student Record.xlsx",
  sheetName: "????",
  allowlistPath: "scripts/pilot/mmc/allowlist.txt",
  autoEnrollProgram: "singapore-math",
  dryRun: false,
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);

    if (key === "dryRun" || key === "help") {
      raw[key] = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }

    raw[key] = value;
    i += 1;
  }

  if (raw.help) {
    console.log(USAGE);
    process.exit(0);
  }

  return {
    tenantSlug: String(raw.tenantSlug ?? DEFAULT_ARGS.tenantSlug)
      .trim()
      .toLowerCase(),
    xlsxPath: String(raw.xlsxPath ?? DEFAULT_ARGS.xlsxPath).trim(),
    sheetName: String(raw.sheetName ?? DEFAULT_ARGS.sheetName).trim(),
    allowlistPath: String(raw.allowlistPath ?? DEFAULT_ARGS.allowlistPath).trim(),
    enrollmentsPath: raw.enrollmentsPath
      ? String(raw.enrollmentsPath).trim()
      : undefined,
    autoEnrollProgram: String(
      raw.autoEnrollProgram ?? DEFAULT_ARGS.autoEnrollProgram,
    ).trim(),
    dryRun: Boolean(raw.dryRun ?? DEFAULT_ARGS.dryRun),
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function derivePersonName(rawName: string | null | undefined, fallback: string) {
  const normalized = rawName?.trim();
  if (normalized) {
    const parts = normalized.split(/\s+/);
    if (parts.length > 1) {
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
    }
    return { firstName: normalized, lastName: fallback };
  }
  return { firstName: fallback, lastName: fallback };
}

function deriveStudentName(rawName: string) {
  const normalized = rawName.trim();
  if (!normalized) {
    return { firstName: "Student", lastName: "Unknown" };
  }
  const parts = normalized.split(/\s+/);
  if (parts.length > 1) {
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }
  return { firstName: normalized, lastName: "Student" };
}

function parseDateOnly(value: unknown): { date: Date | null; label: string | null } {
  if (!value) return { date: null, label: null };

  if (value instanceof Date) {
    const date = DateTime.utc(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
    return { date: date.toJSDate(), label: date.toISODate() };
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const date = DateTime.utc(parsed.y, parsed.m, parsed.d);
      return { date: date.toJSDate(), label: date.toISODate() };
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { date: null, label: null };
    if (DATE_REGEX.test(trimmed)) {
      const date = DateTime.fromISO(trimmed, { zone: "utc" });
      return date.isValid
        ? { date: date.toJSDate(), label: date.toISODate() }
        : { date: null, label: null };
    }

    const fallback = DateTime.fromFormat(trimmed, "M/d/yyyy", { zone: "utc" });
    if (fallback.isValid) {
      return { date: fallback.toJSDate(), label: fallback.toISODate() };
    }
  }

  return { date: null, label: null };
}

function loadAllowlist(filePath: string): Set<string> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Allowlist file not found: ${filePath}`);
  }

  const lines = fs.readFileSync(absolutePath, "utf-8").split(/\r?\n/);
  const emails = lines
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"))
    .map((line) => normalizeEmail(line));

  if (!emails.length) {
    throw new Error(
      "Allowlist is empty. Refusing to import without explicit allowlist.",
    );
  }

  return new Set(emails);
}

function loadEnrollmentOverrides(filePath: string): EnrollmentOverrides {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Enrollments file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf-8");
  try {
    return JSON.parse(raw) as EnrollmentOverrides;
  } catch (error) {
    throw new Error(
      `Enrollments file must be valid JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

function buildGroupMap(groups: { id: string; name: string; notes: string | null }[]) {
  const groupByCode = new Map<string, { id: string; name: string }>();

  for (const group of groups) {
    if (!group.notes) continue;
    const match = group.notes.match(/MMC Pilot Code:\s*([^\n]+)/i);
    const code = match?.[1]?.trim();
    if (!code) continue;
    groupByCode.set(code, { id: group.id, name: group.name });
  }

  if (groupByCode.size) return groupByCode;

  for (const item of MMC_SCHEDULE) {
    const expectedName = buildGroupName(item);
    const matched = groups.find((group) => group.name === expectedName);
    if (matched) {
      groupByCode.set(item.code, { id: matched.id, name: matched.name });
    }
  }

  return groupByCode;
}

function normalizeGradeKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return null;

  if (
    cleaned === "K" ||
    cleaned === "KG" ||
    cleaned === "KG1" ||
    cleaned === "K1" ||
    cleaned === "G1" ||
    cleaned === "GRADE1" ||
    cleaned === "1"
  ) {
    return "KG1";
  }

  if (cleaned === "G2" || cleaned === "GRADE2" || cleaned === "2") {
    return "G2";
  }

  if (cleaned === "G4" || cleaned === "GRADE4" || cleaned === "4") {
    return "G4";
  }

  if (cleaned === "G8" || cleaned === "GRADE8" || cleaned === "8") {
    return "G8";
  }

  return null;
}

async function ensureParent(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  input: { email: string; name: string | null; phone: string | null },
) {
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await client.parent.findUnique({
    where: { tenantId_email: { tenantId, email: normalizedEmail } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });

  const fallback = normalizedEmail.split("@")[0] || "Parent";
  const derived = derivePersonName(input.name, fallback);

  if (!existing) {
    summary.parentsCreated += 1;
    if (args.dryRun) {
      return {
        id: `dryrun-parent-${normalizedEmail}`,
        email: normalizedEmail,
        firstName: derived.firstName,
        lastName: derived.lastName,
      };
    }

    return client.parent.create({
      data: {
        tenantId,
        email: normalizedEmail,
        firstName: derived.firstName,
        lastName: derived.lastName,
        phone: input.phone ?? undefined,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }

  summary.parentsReused += 1;

  const updates: { firstName?: string; lastName?: string; phone?: string | null } = {};

  if (!existing.firstName && derived.firstName) {
    updates.firstName = derived.firstName;
  }
  if (!existing.lastName && derived.lastName) {
    updates.lastName = derived.lastName;
  }
  if (!existing.phone && input.phone) {
    updates.phone = input.phone;
  }

  if (Object.keys(updates).length) {
    summary.parentsUpdated += 1;
    if (!args.dryRun) {
      return client.parent.update({
        where: { id: existing.id },
        data: updates,
        select: { id: true, email: true, firstName: true, lastName: true },
      });
    }
  }

  return existing;
}

async function ensureStudent(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  parentId: string,
  input: {
    name: string;
    grade: string | null;
    dateOfBirth: Date | null;
    levelId: string | null;
  },
) {
  const studentName = deriveStudentName(input.name);

  const existingLinked = await client.studentParent.findFirst({
    where: {
      tenantId,
      parentId,
      student: {
        firstName: studentName.firstName,
        lastName: studentName.lastName,
      },
    },
    select: { student: { select: { id: true, firstName: true, lastName: true, levelId: true } } },
  });

  if (existingLinked?.student) {
    summary.studentsReused += 1;
    if (!args.dryRun && !existingLinked.student.levelId && input.levelId) {
      await client.student.update({
        where: { id: existingLinked.student.id },
        data: { levelId: input.levelId },
      });
    }
    return existingLinked.student;
  }

  if (input.dateOfBirth) {
    const start = DateTime.fromJSDate(input.dateOfBirth, { zone: "utc" })
      .startOf("day")
      .toJSDate();
    const end = DateTime.fromJSDate(input.dateOfBirth, { zone: "utc" })
      .plus({ days: 1 })
      .startOf("day")
      .toJSDate();

    const existingByDob = await client.student.findFirst({
      where: {
        tenantId,
        firstName: studentName.firstName,
        lastName: studentName.lastName,
        dateOfBirth: {
          gte: start,
          lt: end,
        },
      },
      select: { id: true, firstName: true, lastName: true, levelId: true },
    });

    if (existingByDob) {
      summary.studentsReused += 1;
      if (!args.dryRun && !existingByDob.levelId && input.levelId) {
        await client.student.update({
          where: { id: existingByDob.id },
          data: { levelId: input.levelId },
        });
      }
      return existingByDob;
    }
  }

  summary.studentsCreated += 1;
  if (args.dryRun) {
    return {
      id: `dryrun-student-${normalizeName(input.name)}`,
      firstName: studentName.firstName,
      lastName: studentName.lastName,
      levelId: input.levelId,
    };
  }

  return client.student.create({
    data: {
      tenantId,
      firstName: studentName.firstName,
      lastName: studentName.lastName,
      grade: input.grade ?? undefined,
      dateOfBirth: input.dateOfBirth ?? undefined,
      levelId: input.levelId ?? undefined,
    },
    select: { id: true, firstName: true, lastName: true, levelId: true },
  });
}

async function ensureStudentParentLink(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  studentId: string,
  parentId: string,
) {
  const existing = await client.studentParent.findUnique({
    where: {
      tenantId_studentId_parentId: {
        tenantId,
        studentId,
        parentId,
      },
    },
    select: { id: true },
  });

  if (existing) return;

  summary.linksCreated += 1;
  if (args.dryRun) return;

  await client.studentParent.create({
    data: {
      tenantId,
      studentId,
      parentId,
    },
  });
}

async function ensureEnrollments(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  studentId: string,
  groupIds: string[],
) {
  if (!groupIds.length) return;

  if (args.dryRun) {
    summary.enrollmentsCreated += groupIds.length;
    return;
  }

  const result = await client.groupStudent.createMany({
    data: groupIds.map((groupId) => ({
      tenantId,
      groupId,
      studentId,
    })),
    skipDuplicates: true,
  });

  summary.enrollmentsCreated += result.count;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const allowlist = loadAllowlist(args.allowlistPath);
  const xlsxAbsolute = path.resolve(args.xlsxPath);
  if (!fs.existsSync(xlsxAbsolute)) {
    throw new Error(`XLSX file not found: ${args.xlsxPath}`);
  }

  const enrollmentsPath =
    args.enrollmentsPath ||
    (fs.existsSync(path.resolve("scripts/pilot/mmc/enrollments.json"))
      ? "scripts/pilot/mmc/enrollments.json"
      : undefined);

  const enrollmentOverrides = enrollmentsPath
    ? loadEnrollmentOverrides(enrollmentsPath)
    : null;

  const workbook = XLSX.readFile(xlsxAbsolute, { cellDates: true });
  const sheet = workbook.Sheets[args.sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${args.sheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { slug: args.tenantSlug },
    select: { id: true, slug: true },
  });

  if (!tenant) {
    throw new Error(`Tenant not found for slug ${args.tenantSlug}`);
  }

  const levels = await prisma.level.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  });
  const levelByName = new Map(levels.map((level) => [level.name, level.id]));

  const groups = await prisma.group.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, notes: true },
  });
  const groupByCode = buildGroupMap(groups);

  const enrollmentMap = enrollmentOverrides
    ? Object.fromEntries(
        Object.entries(enrollmentOverrides).map(([email, students]) => [
          normalizeEmail(email),
          Object.fromEntries(
            Object.entries(students).map(([studentName, codes]) => [
              normalizeName(studentName),
              codes,
            ]),
          ),
        ]),
      )
    : null;

  const summary: Summary = {
    parentsCreated: 0,
    parentsUpdated: 0,
    parentsReused: 0,
    studentsCreated: 0,
    studentsReused: 0,
    linksCreated: 0,
    enrollmentsCreated: 0,
    rowsProcessed: 0,
    rowsSkipped: 0,
    enrollmentWarnings: [],
  };

  const processRow = async (client: DbClient, row: Record<string, unknown>) => {
    const studentNameRaw = String(row["学生名字"] ?? "").trim();
    const parentEmailRaw = String(row["家长邮箱"] ?? "").trim();

    if (!studentNameRaw || !parentEmailRaw) {
      summary.rowsSkipped += 1;
      return;
    }

    const normalizedParentEmail = normalizeEmail(parentEmailRaw);
    if (!allowlist.has(normalizedParentEmail)) {
      summary.rowsSkipped += 1;
      return;
    }

    const parentNameRaw = String(row["家长称呼"] ?? "").trim();
    const parentPhoneRaw = String(row["家长电话"] ?? "").trim();
    const gradeRaw = String(row["在读年级"] ?? "").trim();
    const dobRaw = row["出生日期"];

    const { date: dateOfBirth } = parseDateOnly(dobRaw);

    const gradeKey = normalizeGradeKey(gradeRaw);
    const autoEnrollCode = gradeKey
      ? AUTO_ENROLL_GROUP_BY_GRADE_KEY[gradeKey]
      : null;

    let levelId: string | null = null;
    if (gradeKey === "KG1") levelId = levelByName.get("K–G1") ?? null;
    if (gradeKey === "G2") levelId = levelByName.get("Grade 2") ?? null;
    if (gradeKey === "G4") levelId = levelByName.get("Grade 4") ?? null;
    if (gradeKey === "G8") levelId = levelByName.get("Grade 8") ?? null;

    const parent = await ensureParent(client, args, summary, tenant.id, {
      email: normalizedParentEmail,
      name: parentNameRaw || null,
      phone: parentPhoneRaw || null,
    });

    const student = await ensureStudent(client, args, summary, tenant.id, parent.id, {
      name: studentNameRaw,
      grade: gradeRaw || null,
      dateOfBirth,
      levelId,
    });

    await ensureStudentParentLink(client, args, summary, tenant.id, student.id, parent.id);

    const enrollmentCodes: string[] = [];
    if (enrollmentMap) {
      const studentOverrides = enrollmentMap[normalizedParentEmail];
      const overrideCodes = studentOverrides?.[normalizeName(studentNameRaw)] ?? null;
      if (overrideCodes) {
        enrollmentCodes.push(...overrideCodes);
      } else {
        summary.enrollmentWarnings.push(
          `${studentNameRaw} (${normalizedParentEmail}) has no enrollment override; add to enrollments.json.`,
        );
      }
    } else if (args.autoEnrollProgram === "singapore-math" && autoEnrollCode) {
      enrollmentCodes.push(autoEnrollCode);
    } else {
      summary.enrollmentWarnings.push(
        `${studentNameRaw} (${normalizedParentEmail}) not auto-enrolled; add enrollments.json if needed.`,
      );
    }

    const groupIds: string[] = [];
    for (const code of enrollmentCodes) {
      const group = groupByCode.get(code);
      if (!group) {
        summary.enrollmentWarnings.push(
          `Enrollment group not found for code ${code} (student ${studentNameRaw}).`,
        );
        continue;
      }
      groupIds.push(group.id);
    }

    await ensureEnrollments(client, args, summary, tenant.id, student.id, groupIds);

    summary.rowsProcessed += 1;
  };

  if (args.dryRun) {
    for (const row of rows) {
      await processRow(prisma, row);
    }
  } else {
    for (const row of rows) {
      await prisma.$transaction(async (tx) => {
        await processRow(tx, row);
      });
    }
  }

  console.log("MMC pilot import complete.");
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Dry run: ${args.dryRun ? "yes" : "no"}`);
  console.log("Summary:");
  console.log(
    JSON.stringify(
      {
        rowsProcessed: summary.rowsProcessed,
        rowsSkipped: summary.rowsSkipped,
        parentsCreated: summary.parentsCreated,
        parentsUpdated: summary.parentsUpdated,
        parentsReused: summary.parentsReused,
        studentsCreated: summary.studentsCreated,
        studentsReused: summary.studentsReused,
        linksCreated: summary.linksCreated,
        enrollmentsCreated: summary.enrollmentsCreated,
        enrollmentWarningsCount: summary.enrollmentWarnings.length,
      },
      null,
      2,
    ),
  );

  if (summary.enrollmentWarnings.length) {
    console.log("Enrollment warnings:");
    for (const warning of summary.enrollmentWarnings) {
      console.log(`- ${warning}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(
      "MMC pilot import failed:",
      error instanceof Error ? error.message : error,
    );
    console.log(USAGE);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

