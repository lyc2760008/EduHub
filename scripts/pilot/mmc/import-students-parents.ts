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

const USAGE = `\nUsage: pnpm pilot:mmc:import-students-parents [options]\n\nOptions:\n  --tenantSlug <slug>        Tenant slug (default: mmc)\n  --xlsxPath <path>          XLSX path (default: scripts/pilot/mmc/Student Record.xlsx)\n  --sheetName <name>         Optional sheet name (default: auto-detect from supported headers)\n  --allowlistPath <path>     Allowlist file (default: scripts/pilot/mmc/allowlist.txt)\n  --enrollmentsPath <path>   Optional JSON mapping (default: scripts/pilot/mmc/enrollments.json if exists)\n  --autoEnrollProgram <key>  Program key for conservative auto-enroll (default: singapore-math)\n  --dryRun                   Print actions without writing to the database\n  --help                     Show this help text\n`;

type Args = {
  tenantSlug: string;
  xlsxPath: string;
  sheetName?: string;
  allowlistPath: string;
  enrollmentsPath?: string;
  autoEnrollProgram: string;
  dryRun: boolean;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

type EnrollmentOverrides = Record<string, Record<string, string[]>>;

type NormalizedImportRow = {
  studentName: string;
  parentEmail: string;
  parentName: string;
  parentPhone: string;
  grade: string;
  dateOfBirthRaw: unknown;
};

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
  sheetName: undefined,
  allowlistPath: "scripts/pilot/mmc/allowlist.txt",
  autoEnrollProgram: "singapore-math",
  dryRun: false,
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// Support both setup flows: `mmc/setup-spring-2026.ts` and `mmc-setup.ts`.
const GROUP_CODE_NAME_ALIASES: Record<string, string[]> = {
  "sm-kg1-mon-1630": ["K-G1 Singapore Math", "K–G1 Singapore Math"],
  "sm-g7b-tue-1630": ["Grade 7B Singapore Math"],
  "sm-g2-tue-1830": ["Grade 2 Singapore Math"],
  "sm-g8-tue-1930": ["Grade 8 Singapore Math"],
  "sm-g5b-wed-1645": ["Grade 5B Singapore Math"],
  "sm-g6b-7a-wed-1830": ["Grade 6B-7A Singapore Math", "Grade 6B–7A Singapore Math"],
  "sm-g4-thu-1630": ["Grade 4 Singapore Math"],
  "sm-g5a-thu-1830": ["Grade 5A Singapore Math"],
  "wr-g6-7-mon-1800": ["Grade 6-7 Academic Writing & PAT", "Grade 6–7 Academic Writing & PAT"],
  "wr-g11-12-mon-1800": [
    "Grade 11-12 University Prep Writing",
    "Grade 11–12 University Prep Writing",
  ],
  "wr-g6-8-tue-1700": ["Grade 6-8 Literature & Writing", "Grade 6–8 Literature & Writing"],
  "wr-g9-10-tue-1845": ["Grade 9-10 Academic Writing & PAT", "Grade 9–10 Academic Writing & PAT"],
  "wr-g4-6-wed-1830": ["Grade 4-6 Creative Writing", "Grade 4–6 Creative Writing"],
  "wr-g8-9-wed-1830": ["Grade 8-9 Academic Writing & PAT", "Grade 8–9 Academic Writing & PAT"],
  "en-g2-3-fri-1745": [
    "Grade 2-3 English LSRW",
    "Grade 2–3 English LSRW",
    "English LSRW Grade 2-3",
    "English LSRW Grade 2–3",
  ],
  "en-g4-fri-1915": ["Grade 4 English LSRW", "English LSRW Grade 4"],
  "en-g5-sat-1730": ["Grade 5 English LSRW", "English LSRW Grade 5"],
  "en-g7-sat-1900": ["Grade 7 English LSRW", "English LSRW Grade 7"],
};

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
    sheetName: raw.sheetName ? String(raw.sheetName).trim() : undefined,
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

const STUDENT_NAME_HEADERS = ["学生名字", "Student Name"] as const;
const PARENT_EMAIL_HEADERS = ["家长邮箱", "parent email"] as const;
const PARENT_NAME_HEADERS = ["家长称呼", "parent name (wechat name)"] as const;
const PARENT_PHONE_HEADERS = ["家长电话", "parent phone"] as const;
const GRADE_HEADERS = ["在读年级", "Grade"] as const;
const DOB_HEADERS = ["出生日期", "Date of Birth"] as const;

function pickFirstNonEmptyValue(
  row: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value) return value;
  }
  return "";
}

function pickFirstRawValue(
  row: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && !raw.trim()) continue;
    return raw;
  }
  return null;
}

function normalizeRow(row: Record<string, unknown>): NormalizedImportRow {
  return {
    studentName: pickFirstNonEmptyValue(row, STUDENT_NAME_HEADERS),
    parentEmail: pickFirstNonEmptyValue(row, PARENT_EMAIL_HEADERS),
    parentName: pickFirstNonEmptyValue(row, PARENT_NAME_HEADERS),
    parentPhone: pickFirstNonEmptyValue(row, PARENT_PHONE_HEADERS),
    grade: pickFirstNonEmptyValue(row, GRADE_HEADERS),
    dateOfBirthRaw: pickFirstRawValue(row, DOB_HEADERS),
  };
}

function detectSheetName(
  workbook: XLSX.WorkBook,
  preferredSheetName?: string,
): string {
  if (preferredSheetName) {
    if (!workbook.Sheets[preferredSheetName]) {
      throw new Error(`Sheet not found: ${preferredSheetName}`);
    }
    return preferredSheetName;
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });
    const hasSupportedRows = rows.some((row) => {
      const normalized = normalizeRow(row);
      return Boolean(normalized.studentName && normalized.parentEmail);
    });
    if (hasSupportedRows) {
      return sheetName;
    }
  }

  throw new Error(
    "No sheet with supported headers was found. Expected Student Name/parent email or 学生名字/家长邮箱.",
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeGroupLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

  // Fallback when groups were created by scripts that do not persist code in `notes`.
  const groupsByNormalizedName = new Map<string, { id: string; name: string }>();
  for (const group of groups) {
    groupsByNormalizedName.set(normalizeGroupLabel(group.name), {
      id: group.id,
      name: group.name,
    });
  }

  for (const item of MMC_SCHEDULE) {
    const candidateNames = new Set<string>([
      buildGroupName(item),
      item.displayName,
      ...(GROUP_CODE_NAME_ALIASES[item.code] ?? []),
    ]);

    let matched: { id: string; name: string } | undefined;
    for (const candidateName of candidateNames) {
      const byName = groupsByNormalizedName.get(normalizeGroupLabel(candidateName));
      if (byName) {
        matched = byName;
        break;
      }
    }

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
  const sheetName = detectSheetName(workbook, args.sheetName);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  const rows = rawRows.map((row) => normalizeRow(row));

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

  const processRow = async (
    client: DbClient,
    row: NormalizedImportRow,
    rowIndex: number,
  ) => {
    const studentNameRaw = row.studentName.trim();
    const parentEmailRaw = row.parentEmail.trim();

    if (!studentNameRaw || !parentEmailRaw) {
      summary.rowsSkipped += 1;
      return;
    }

    const normalizedParentEmail = normalizeEmail(parentEmailRaw);
    if (!allowlist.has(normalizedParentEmail)) {
      summary.rowsSkipped += 1;
      return;
    }

    const parentNameRaw = row.parentName.trim();
    const parentPhoneRaw = row.parentPhone.trim();
    const gradeRaw = row.grade.trim();
    const dobRaw = row.dateOfBirthRaw;

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
    // Keep warning output non-sensitive; use row index only (no names/emails).
    const rowLabel = `row ${rowIndex + 2}`;
    if (enrollmentMap) {
      const studentOverrides = enrollmentMap[normalizedParentEmail];
      const overrideCodes = studentOverrides?.[normalizeName(studentNameRaw)] ?? null;
      if (overrideCodes) {
        enrollmentCodes.push(...overrideCodes);
      } else {
        summary.enrollmentWarnings.push(
          `${rowLabel} has no enrollment override; add to enrollments.json.`,
        );
      }
    } else if (args.autoEnrollProgram === "singapore-math" && autoEnrollCode) {
      enrollmentCodes.push(autoEnrollCode);
    } else {
      summary.enrollmentWarnings.push(
        `${rowLabel} not auto-enrolled; add enrollments.json if needed.`,
      );
    }

    const groupIds: string[] = [];
    for (const code of enrollmentCodes) {
      const group = groupByCode.get(code);
      if (!group) {
        summary.enrollmentWarnings.push(
          `Enrollment group not found for code ${code} (${rowLabel}).`,
        );
        continue;
      }
      groupIds.push(group.id);
    }

    await ensureEnrollments(client, args, summary, tenant.id, student.id, groupIds);

    summary.rowsProcessed += 1;
  };

  if (args.dryRun) {
    for (const [index, row] of rows.entries()) {
      await processRow(prisma, row, index);
    }
  } else {
    for (const [index, row] of rows.entries()) {
      await prisma.$transaction(async (tx) => {
        await processRow(tx, row, index);
      });
    }
  }

  console.log("MMC pilot import complete.");
  console.log(`Sheet used: ${sheetName}`);
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

