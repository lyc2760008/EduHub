// MMC pilot setup script (tenant + staff + groups + sessions) with staging/prod guardrails.
// NOTE: This script never prints secrets; it relies on DATABASE_URL set in the shell.
import "dotenv/config";

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  GroupType,
  Role,
  SessionType,
  PrismaClient,
  type Prisma,
} from "../../src/generated/prisma/client";
import { generateOccurrences } from "../../src/lib/sessions/generator";
import { isValidTimeZone } from "../../src/lib/timezones/isValidTimeZone";
import type {
  PilotSchedule,
  PilotScheduleGroup,
} from "./mmc-spring-2026.schedule";

const USAGE = `\nUsage: pnpm pilot:mmc:staging|pilot:mmc:prod -- [options]\n\nOptions:\n  --env staging|production         Target environment (default: staging)\n  --tenantSlug <slug>              Tenant slug (default: mmc)\n  --schedule <path>                Schedule file (default: scripts/pilot/mmc-spring-2026.schedule.ts)\n  --dry-run                        Print actions without writing to the database\n  --replace-existing-in-range      Staging-only: delete existing GROUP/CLASS sessions in term range before re-create\n  --confirm-prod                   Required for production runs (even dry-run)\n  --include-test-parents           Create test parents/students (staging only)\n  --help                           Show this help text\n`;

type EnvName = "staging" | "production";

type Args = {
  env: EnvName;
  tenantSlug: string;
  schedulePath: string;
  dryRun: boolean;
  replaceExistingInRange: boolean;
  confirmProd: boolean;
  includeTestParents: boolean;
};

type DbClient = Prisma.TransactionClient | PrismaClient;

type StaffInput = {
  email: string;
  role: Role;
  displayName?: string;
};

type StaffResult = {
  id: string;
  email: string;
  role: Role;
  created: boolean;
  updated: boolean;
};

type GroupResult = {
  id: string;
  name: string;
  created: boolean;
  updated: boolean;
  sessionCreated: number;
  sessionSkipped: number;
};

type Summary = {
  tenantId: string;
  centerIds: Map<string, string>;
  staff: StaffResult[];
  groups: GroupResult[];
  sessionsCreated: number;
  sessionsSkipped: number;
  sessionsDeleted: number;
  sessionConflicts: string[];
  testParentsCreated: string[];
  testStudentsCreated: string[];
};

const DEFAULTS: Args = {
  env: "staging",
  tenantSlug: "mmc",
  schedulePath: "scripts/pilot/mmc-spring-2026.schedule.ts",
  dryRun: false,
  replaceExistingInRange: false,
  confirmProd: false,
  includeTestParents: false,
};

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORBIDDEN_FLAGS = new Set(["--reset", "--truncate", "--delete", "--drop", "--wipe"]);
const TENANT_NAME = "MMC Education Calgary";
const REQUIRED_TIMEZONE = "America/Edmonton";

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string | boolean> = {};
  const booleanFlags = new Set([
    "dry-run",
    "replace-existing-in-range",
    "confirm-prod",
    "include-test-parents",
    "help",
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;

    if (FORBIDDEN_FLAGS.has(token)) {
      throw new Error(`Forbidden destructive flag detected: ${token}`);
    }

    const key = token.slice(2);

    if (booleanFlags.has(key)) {
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

  const envValue = String(raw.env ?? DEFAULTS.env).trim().toLowerCase();
  if (envValue !== "staging" && envValue !== "production") {
    throw new Error("--env must be staging or production.");
  }

  return {
    env: envValue as EnvName,
    tenantSlug: String(raw.tenantSlug ?? DEFAULTS.tenantSlug)
      .trim()
      .toLowerCase(),
    schedulePath: String(raw.schedule ?? DEFAULTS.schedulePath).trim(),
    dryRun: Boolean(raw["dry-run"] ?? DEFAULTS.dryRun),
    replaceExistingInRange: Boolean(
      raw["replace-existing-in-range"] ?? DEFAULTS.replaceExistingInRange,
    ),
    confirmProd: Boolean(raw["confirm-prod"] ?? DEFAULTS.confirmProd),
    includeTestParents: Boolean(
      raw["include-test-parents"] ?? DEFAULTS.includeTestParents,
    ),
  };
}

function assertRequired(label: string, value: string) {
  if (!value) throw new Error(`${label} is required.`);
}

function ensureSafeArgs(args: Args) {
  if (!SLUG_REGEX.test(args.tenantSlug)) {
    throw new Error("tenantSlug must be lowercase and contain letters, numbers, and dashes.");
  }

  if (args.env === "production" && !args.confirmProd) {
    throw new Error("--confirm-prod is required for production runs.");
  }

  if (args.env === "production" && args.includeTestParents) {
    throw new Error("--include-test-parents is not allowed in production.");
  }

  if (args.env === "production" && args.replaceExistingInRange) {
    throw new Error("--replace-existing-in-range is not allowed in production.");
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function deriveDisplayName(email: string, fallback: string) {
  const prefix = email.split("@")[0]?.replace(/\./g, " ").trim();
  if (!prefix) return fallback;
  return prefix
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function computeEndTime(startTime: string, durationMinutes: number, timeZone: string) {
  if (!TIME_REGEX.test(startTime)) {
    throw new Error(`Invalid startTimeLocal format: ${startTime}`);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`durationMinutes must be positive for ${startTime}`);
  }

  const [hour, minute] = startTime.split(":").map((part) => Number(part));
  const base = DateTime.fromObject(
    { year: 2000, month: 1, day: 1, hour, minute },
    { zone: timeZone },
  );
  const end = base.plus({ minutes: durationMinutes });

  if (!base.isValid || !end.isValid) {
    throw new Error("Invalid time calculation for session duration.");
  }

  if (end <= base) {
    throw new Error(
      `durationMinutes crosses midnight; adjust schedule for start ${startTime}.`,
    );
  }

  return end.toFormat("HH:mm");
}

function computeTermRangeUtc(schedule: PilotSchedule) {
  // Convert the local inclusive term dates into UTC [start, endExclusive) bounds for deletes.
  const localStart = DateTime.fromISO(schedule.term.startDate, {
    zone: schedule.term.timeZone,
  }).startOf("day");
  const localEndExclusive = DateTime.fromISO(schedule.term.endDate, {
    zone: schedule.term.timeZone,
  })
    .plus({ days: 1 })
    .startOf("day");

  if (!localStart.isValid || !localEndExclusive.isValid) {
    throw new Error("Invalid term range when computing UTC boundaries.");
  }

  return {
    startAtUtc: localStart.toUTC().toJSDate(),
    endAtUtcExclusive: localEndExclusive.toUTC().toJSDate(),
  };
}

async function replaceExistingSessionsInTermRange(
  client: DbClient,
  args: Args,
  tenantId: string,
  schedule: PilotSchedule,
) {
  const range = computeTermRangeUtc(schedule);
  const where: Prisma.SessionWhereInput = {
    tenantId,
    // Keep replacement scope focused on generated schedule rows.
    sessionType: { in: [SessionType.GROUP, SessionType.CLASS] },
    startAt: {
      gte: range.startAtUtc,
      lt: range.endAtUtcExclusive,
    },
  };

  if (args.dryRun) {
    return client.session.count({ where });
  }

  const result = await client.session.deleteMany({ where });
  return result.count;
}

async function loadSchedule(schedulePath: string): Promise<PilotSchedule> {
  const absolutePath = path.resolve(schedulePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Schedule file not found: ${schedulePath}`);
  }

  // Load the schedule dynamically so --schedule can point to a different file.
  const scheduleModule = await import(pathToFileURL(absolutePath).href);
  const schedule =
    (scheduleModule.MMC_SPRING_2026_SCHEDULE as PilotSchedule | undefined) ??
    (scheduleModule.default as PilotSchedule | undefined) ??
    (scheduleModule.schedule as PilotSchedule | undefined);

  if (!schedule) {
    throw new Error(
      "Schedule module must export MMC_SPRING_2026_SCHEDULE, default, or schedule.",
    );
  }

  return schedule;
}

function validateSchedule(schedule: PilotSchedule) {
  if (!DATE_REGEX.test(schedule.term.startDate)) {
    throw new Error("Schedule term startDate must be YYYY-MM-DD.");
  }
  if (!DATE_REGEX.test(schedule.term.endDate)) {
    throw new Error("Schedule term endDate must be YYYY-MM-DD.");
  }
  if (!isValidTimeZone(schedule.term.timeZone)) {
    throw new Error("Schedule term timeZone must be a valid IANA timezone.");
  }
  if (schedule.term.timeZone !== REQUIRED_TIMEZONE) {
    throw new Error(`Schedule timeZone must be ${REQUIRED_TIMEZONE}.`);
  }

  const start = DateTime.fromISO(schedule.term.startDate, {
    zone: schedule.term.timeZone,
  });
  const end = DateTime.fromISO(schedule.term.endDate, {
    zone: schedule.term.timeZone,
  });
  if (!start.isValid || !end.isValid || end < start) {
    throw new Error("Schedule term date range is invalid.");
  }

  if (!schedule.groups.length) {
    throw new Error("Schedule groups must contain at least one entry.");
  }

  for (const group of schedule.groups) {
    if (!group.name.trim()) {
      throw new Error("Each schedule group must include a name.");
    }
    if (!EMAIL_REGEX.test(group.tutorEmail)) {
      throw new Error(`Invalid tutorEmail in schedule: ${group.tutorEmail}`);
    }
    if (!Number.isInteger(group.dayOfWeek) || group.dayOfWeek < 1 || group.dayOfWeek > 7) {
      throw new Error(`dayOfWeek must be 1-7 for ${group.name}`);
    }
    if (!TIME_REGEX.test(group.startTimeLocal)) {
      throw new Error(`startTimeLocal must be HH:mm for ${group.name}`);
    }
    if (group.type !== "GROUP" && group.type !== "CLASS") {
      throw new Error(`type must be GROUP or CLASS for ${group.name}`);
    }
  }
}

function buildPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function ensureTenant(client: DbClient, args: Args, schedule: PilotSchedule) {
  const existing = await client.tenant.findUnique({
    where: { slug: args.tenantSlug },
    select: { id: true, name: true, timeZone: true },
  });

  if (!existing) {
    if (args.dryRun) {
      return {
        id: `dryrun-tenant-${args.tenantSlug}`,
        name: TENANT_NAME,
        timeZone: schedule.term.timeZone,
        created: true,
        updated: false,
      };
    }

    const created = await client.tenant.create({
      data: {
        name: TENANT_NAME,
        slug: args.tenantSlug,
        timeZone: schedule.term.timeZone,
      },
      select: { id: true, name: true, timeZone: true },
    });

    return { ...created, created: true, updated: false };
  }

  const needsUpdate =
    existing.name !== TENANT_NAME || existing.timeZone !== schedule.term.timeZone;

  if (needsUpdate && !args.dryRun) {
    const updated = await client.tenant.update({
      where: { id: existing.id },
      data: { name: TENANT_NAME, timeZone: schedule.term.timeZone },
      select: { id: true, name: true, timeZone: true },
    });

    return { ...updated, created: false, updated: true };
  }

  return { ...existing, created: false, updated: needsUpdate };
}

async function ensureCenter(
  client: DbClient,
  args: Args,
  tenantId: string,
  name: string,
  timeZone: string,
) {
  const existing = await client.center.findUnique({
    where: { tenantId_name: { tenantId, name } },
    select: { id: true, timezone: true, isActive: true },
  });

  if (!existing) {
    if (args.dryRun) {
      return {
        id: `dryrun-center-${name.replace(/\s+/g, "-")}`,
        created: true,
        updated: false,
      };
    }

    const created = await client.center.create({
      data: { tenantId, name, timezone: timeZone, isActive: true },
      select: { id: true },
    });

    return { id: created.id, created: true, updated: false };
  }

  const needsUpdate = existing.timezone !== timeZone || !existing.isActive;
  if (needsUpdate && !args.dryRun) {
    await client.center.update({
      where: { id: existing.id },
      data: { timezone: timeZone, isActive: true },
    });
  }

  return { id: existing.id, created: false, updated: needsUpdate };
}

async function ensureUser(
  client: DbClient,
  args: Args,
  input: StaffInput,
): Promise<StaffResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await client.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true },
  });

  const desiredName = input.displayName ?? deriveDisplayName(normalizedEmail, "Staff");

  if (!existing) {
    if (args.dryRun) {
      return {
        id: `dryrun-user-${normalizedEmail}`,
        email: normalizedEmail,
        role: input.role,
        created: true,
        updated: false,
      };
    }

    const passwordHash = await bcrypt.hash(randomBytes(16).toString("hex"), 10);
    const created = await client.user.create({
      data: {
        email: normalizedEmail,
        name: desiredName,
        passwordHash,
      },
      select: { id: true },
    });

    return {
      id: created.id,
      email: normalizedEmail,
      role: input.role,
      created: true,
      updated: false,
    };
  }

  let updated = false;
  if (!existing.name && desiredName && !args.dryRun) {
    await client.user.update({
      where: { id: existing.id },
      data: { name: desiredName },
    });
    updated = true;
  }

  return {
    id: existing.id,
    email: normalizedEmail,
    role: input.role,
    created: false,
    updated,
  };
}

async function ensureMembership(
  client: DbClient,
  args: Args,
  tenantId: string,
  userId: string,
  role: Role,
) {
  if (args.dryRun) return;

  await client.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { role },
    create: { tenantId, userId, role },
  });
}

async function ensureStaffCenter(
  client: DbClient,
  args: Args,
  tenantId: string,
  userId: string,
  centerId: string,
) {
  if (args.dryRun) return;

  await client.staffCenter.upsert({
    where: { tenantId_userId_centerId: { tenantId, userId, centerId } },
    update: {},
    create: { tenantId, userId, centerId },
  });
}

async function ensureProgram(
  client: DbClient,
  args: Args,
  tenantId: string,
  programName: string,
) {
  const existing = await client.program.findUnique({
    where: { tenantId_name: { tenantId, name: programName } },
    select: { id: true, isActive: true },
  });

  if (!existing) {
    if (args.dryRun) {
      return { id: `dryrun-program-${programName}` };
    }

    const created = await client.program.create({
      data: { tenantId, name: programName, isActive: true },
      select: { id: true },
    });

    return { id: created.id };
  }

  if (!existing.isActive && !args.dryRun) {
    await client.program.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
  }

  return { id: existing.id };
}

async function ensureLevel(
  client: DbClient,
  args: Args,
  tenantId: string,
  levelName: string,
) {
  const existing = await client.level.findUnique({
    where: { tenantId_name: { tenantId, name: levelName } },
    select: { id: true, isActive: true },
  });

  if (!existing) {
    if (args.dryRun) {
      return { id: `dryrun-level-${levelName}` };
    }

    const created = await client.level.create({
      data: { tenantId, name: levelName, isActive: true },
      select: { id: true },
    });

    return { id: created.id };
  }

  if (!existing.isActive && !args.dryRun) {
    await client.level.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
  }

  return { id: existing.id };
}

async function ensureGroup(
  client: DbClient,
  args: Args,
  tenantId: string,
  centerId: string,
  group: PilotScheduleGroup,
  programId: string,
  levelId: string | null,
) {
  const groupName = group.name.trim();
  const existing = await client.group.findFirst({
    where: { tenantId, centerId, name: groupName },
    select: { id: true, type: true, programId: true, levelId: true, isActive: true },
  });

  const desiredType = group.type === "CLASS" ? GroupType.CLASS : GroupType.GROUP;

  if (!existing) {
    if (args.dryRun) {
      return { id: `dryrun-group-${groupName}`, created: true, updated: false };
    }

    const created = await client.group.create({
      data: {
        tenantId,
        centerId,
        name: groupName,
        type: desiredType,
        programId,
        levelId: levelId ?? undefined,
        isActive: true,
        notes: group.notes?.trim() || null,
      },
      select: { id: true },
    });

    return { id: created.id, created: true, updated: false };
  }

  const needsUpdate =
    existing.type !== desiredType ||
    existing.programId !== programId ||
    existing.levelId !== levelId ||
    !existing.isActive;

  if (needsUpdate && !args.dryRun) {
    await client.group.update({
      where: { id: existing.id },
      data: {
        type: desiredType,
        programId,
        levelId: levelId ?? undefined,
        isActive: true,
        notes: group.notes?.trim() || null,
      },
    });
  }

  return { id: existing.id, created: false, updated: needsUpdate };
}

async function ensureGroupTutor(
  client: DbClient,
  args: Args,
  tenantId: string,
  groupId: string,
  tutorId: string,
) {
  if (args.dryRun) return;

  await client.groupTutor.upsert({
    where: { tenantId_groupId_userId: { tenantId, groupId, userId: tutorId } },
    update: {},
    create: { tenantId, groupId, userId: tutorId },
  });
}

async function ensureTestParentsAndStudents(
  client: DbClient,
  args: Args,
  tenantId: string,
  summary: Summary,
) {
  const testEntries = [
    {
      parentEmail: "mmc.parent.test1@example.com",
      parentFirst: "MMC",
      parentLast: "Parent Test1",
      studentFirst: "MMC",
      studentLast: "Student Test1",
      grade: "G4",
    },
    {
      parentEmail: "mmc.parent.test2@example.com",
      parentFirst: "MMC",
      parentLast: "Parent Test2",
      studentFirst: "MMC",
      studentLast: "Student Test2",
      grade: "G6",
    },
  ];

  for (const entry of testEntries) {
    const normalizedEmail = normalizeEmail(entry.parentEmail);
    const existingParent = await client.parent.findUnique({
      where: { tenantId_email: { tenantId, email: normalizedEmail } },
      select: { id: true },
    });

    let parentId = existingParent?.id ?? null;

    if (!parentId) {
      if (args.dryRun) {
        parentId = `dryrun-parent-${normalizedEmail}`;
      } else {
        const createdParent = await client.parent.create({
          data: {
            tenantId,
            email: normalizedEmail,
            firstName: entry.parentFirst,
            lastName: entry.parentLast,
          },
          select: { id: true },
        });
        parentId = createdParent.id;
      }
      summary.testParentsCreated.push(parentId);
    }

    const existingStudent = await client.student.findFirst({
      where: {
        tenantId,
        firstName: entry.studentFirst,
        lastName: entry.studentLast,
      },
      select: { id: true },
    });

    let studentId = existingStudent?.id ?? null;

    if (!studentId) {
      if (args.dryRun) {
        studentId = `dryrun-student-${entry.studentFirst}-${entry.studentLast}`;
      } else {
        const createdStudent = await client.student.create({
          data: {
            tenantId,
            firstName: entry.studentFirst,
            lastName: entry.studentLast,
            grade: entry.grade,
          },
          select: { id: true },
        });
        studentId = createdStudent.id;
      }
      summary.testStudentsCreated.push(studentId);
    }

    if (!args.dryRun) {
      await client.studentParent.upsert({
        where: { tenantId_studentId_parentId: { tenantId, studentId, parentId } },
        update: {},
        create: { tenantId, studentId, parentId },
      });
    }
  }
}

function getGitCommitHash() {
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function appendDeployLog(
  env: EnvName,
  args: Args,
  schedule: PilotSchedule,
  summary: Summary,
) {
  const logPath = path.resolve(
    `docs/devops/deploy-logs/step-21.2-mmc-${env}.md`,
  );

  const nowLocal = DateTime.now();
  const nowUtc = nowLocal.toUTC();

  const groupLines = summary.groups.map(
    (group) =>
      `- ${group.name} (groupId: ${group.id}): sessions created ${group.sessionCreated}, skipped ${group.sessionSkipped}`,
  );

  const staffLines = summary.staff.map(
    (staff) =>
      `- ${staff.email} -> ${staff.id} (role: ${staff.role}, created: ${
        staff.created ? "yes" : "no"
      }, updated: ${staff.updated ? "yes" : "no"})`,
  );

  const parentLine = summary.testParentsCreated.length
    ? `- Test parent IDs: ${summary.testParentsCreated.join(", ")}`
    : "- Test parent IDs: none";

  const studentLine = summary.testStudentsCreated.length
    ? `- Test student IDs: ${summary.testStudentsCreated.join(", ")}`
    : "- Test student IDs: none";

  const conflictLines = summary.sessionConflicts.length
    ? summary.sessionConflicts.map((conflict) => `- ${conflict}`)
    : ["- none"];

  const entry = [
    "",
    `## Run - ${nowLocal.toFormat("yyyy-LL-dd HH:mm")}`,
    "",
    `- Timestamp (local): ${nowLocal.toFormat("yyyy-LL-dd HH:mm")}`,
    `- Timestamp (UTC): ${nowUtc.toFormat("yyyy-LL-dd HH:mm")}`,
    `- Environment: ${env}`,
    `- Dry run: ${args.dryRun ? "yes" : "no"}`,
    `- Replace existing in range: ${args.replaceExistingInRange ? "yes" : "no"}`,
    `- Git commit: ${getGitCommitHash()}`,
    `- Tenant slug: ${args.tenantSlug}`,
    `- Tenant ID: ${summary.tenantId}`,
    "",
    "### Staff",
    ...staffLines,
    "",
    "### Groups & Sessions",
    ...groupLines,
    "",
    "### Session Conflicts",
    ...conflictLines,
    "",
    "### Totals",
    `- Sessions deleted: ${summary.sessionsDeleted}`,
    `- Sessions created: ${summary.sessionsCreated}`,
    `- Sessions skipped: ${summary.sessionsSkipped}`,
    "",
    "### Test Parents/Students (staging-only)",
    parentLine,
    studentLine,
    "",
    `- Schedule source: ${args.schedulePath}`,
    `- Term range: ${schedule.term.startDate} to ${schedule.term.endDate} (${schedule.term.timeZone})`,
    "",
  ].join("\n");

  fs.appendFileSync(logPath, entry, "utf-8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  assertRequired("tenantSlug", args.tenantSlug);
  assertRequired("schedule", args.schedulePath);

  ensureSafeArgs(args);

  const schedule = await loadSchedule(args.schedulePath);
  validateSchedule(schedule);

  const summary: Summary = {
    tenantId: "",
    centerIds: new Map<string, string>(),
    staff: [],
    groups: [],
    sessionsCreated: 0,
    sessionsSkipped: 0,
    sessionsDeleted: 0,
    sessionConflicts: [],
    testParentsCreated: [],
    testStudentsCreated: [],
  };

  let prisma: PrismaClient | null = null;

  try {
    prisma = buildPrismaClient();

    const tenant = await ensureTenant(prisma, args, schedule);
    summary.tenantId = tenant.id;

    const centerNameDefault =
      schedule.defaultCenterName?.trim() || TENANT_NAME;

    const staffInputs: StaffInput[] = [
      {
        email: "hanka.ilott@gmail.com",
        role: Role.Tutor,
      },
      {
        email: "nicolemacarthur@mywic.ca",
        role: Role.Tutor,
      },
      {
        email: "mmceducationcalgary@gmail.com",
        role: Role.Admin,
        displayName: "MMC Admin",
      },
    ];

    const staffByEmail = new Map<string, StaffResult>();

    for (const staff of staffInputs) {
      const ensured = await ensureUser(prisma, args, staff);
      await ensureMembership(prisma, args, tenant.id, ensured.id, staff.role);

      // Admins can still be assigned as tutors via groupTutor even with single-role membership.
      staffByEmail.set(normalizeEmail(staff.email), ensured);
      summary.staff.push(ensured);
    }

    const centerByName = new Map<string, string>();
    const programByName = new Map<string, string>();
    const levelByName = new Map<string, string>();

    const groupsWithCenters: Array<{ group: PilotScheduleGroup; centerId: string }> = [];

    for (const group of schedule.groups) {
      const resolvedCenterName = group.centerName?.trim() || centerNameDefault;
      if (!resolvedCenterName) {
        throw new Error(`Center name is required for group ${group.name}`);
      }

      if (!centerByName.has(resolvedCenterName)) {
        const center = await ensureCenter(
          prisma,
          args,
          tenant.id,
          resolvedCenterName,
          schedule.term.timeZone,
        );
        centerByName.set(resolvedCenterName, center.id);
        summary.centerIds.set(resolvedCenterName, center.id);
      }

      groupsWithCenters.push({
        group,
        centerId: centerByName.get(resolvedCenterName)!,
      });
    }

    // Ensure staff are linked to every center used by the schedule.
    for (const centerId of centerByName.values()) {
      for (const staff of staffByEmail.values()) {
        await ensureStaffCenter(prisma, args, tenant.id, staff.id, centerId);
      }
    }

    for (const { group, centerId } of groupsWithCenters) {
      const programName = group.programName?.trim() || "MMC Pilot Program";
      if (!programByName.has(programName)) {
        const program = await ensureProgram(prisma, args, tenant.id, programName);
        programByName.set(programName, program.id);
      }

      let levelId: string | null = null;
      if (group.levelName?.trim()) {
        const levelName = group.levelName.trim();
        if (!levelByName.has(levelName)) {
          const level = await ensureLevel(prisma, args, tenant.id, levelName);
          levelByName.set(levelName, level.id);
        }
        levelId = levelByName.get(levelName) ?? null;
      }

      const groupName = group.name.trim();

      const ensuredGroup = await ensureGroup(
        prisma,
        args,
        tenant.id,
        centerId,
        group,
        programByName.get(programName)!,
        levelId,
      );

      const tutorEmail = normalizeEmail(group.tutorEmail);
      const tutor = staffByEmail.get(tutorEmail);
      if (!tutor) {
        throw new Error(`Tutor not found in staff list: ${group.tutorEmail}`);
      }

      await ensureGroupTutor(prisma, args, tenant.id, ensuredGroup.id, tutor.id);

      summary.groups.push({
        id: ensuredGroup.id,
        name: groupName,
        created: ensuredGroup.created,
        updated: ensuredGroup.updated,
        sessionCreated: 0,
        sessionSkipped: 0,
      });
    }

    const groupByName = new Map(
      summary.groups.map((group) => [group.name, group]),
    );

    const candidates: Array<{
      key: string;
      groupId: string;
      groupName: string;
      data: {
        tenantId: string;
        centerId: string;
        tutorId: string;
        sessionType: SessionType;
        groupId: string;
        startAt: Date;
        endAt: Date;
        timezone: string;
      };
    }> = [];

    for (const { group, centerId } of groupsWithCenters) {
      const groupName = group.name.trim();
      const tutor = staffByEmail.get(normalizeEmail(group.tutorEmail));
      if (!tutor) {
        throw new Error(`Tutor missing for group ${groupName}`);
      }

      const groupRecord = groupByName.get(groupName);
      if (!groupRecord) {
        throw new Error(`Group lookup failed for ${groupName}`);
      }

      const endTimeLocal = computeEndTime(
        group.startTimeLocal,
        group.durationMinutes,
        schedule.term.timeZone,
      );

      const occurrences = generateOccurrences({
        startDate: schedule.term.startDate,
        endDate: schedule.term.endDate,
        weekdays: [group.dayOfWeek],
        startTime: group.startTimeLocal,
        endTime: endTimeLocal,
        timezone: schedule.term.timeZone,
      });

      for (const occurrence of occurrences) {
        const key = `${tutor.id}-${centerId}-${occurrence.startAtUtc.getTime()}`;
        candidates.push({
          key,
          groupId: groupRecord.id,
          groupName,
          data: {
            tenantId: tenant.id,
            centerId,
            tutorId: tutor.id,
            sessionType:
              group.type === "CLASS" ? SessionType.CLASS : SessionType.GROUP,
            groupId: groupRecord.id,
            startAt: occurrence.startAtUtc,
            endAt: occurrence.endAtUtc,
            timezone: schedule.term.timeZone,
          },
        });
      }
    }

    if (args.replaceExistingInRange) {
      // Staging-only replacement path; production is blocked in ensureSafeArgs.
      summary.sessionsDeleted = await replaceExistingSessionsInTermRange(
        prisma,
        args,
        tenant.id,
        schedule,
      );
    }

    const candidateByKey = new Map<string, typeof candidates[number]>();
    for (const candidate of candidates) {
      if (candidateByKey.has(candidate.key)) {
        summary.sessionConflicts.push(
          `Overlap for ${candidate.key} (group: ${candidate.groupName}).`,
        );
        continue;
      }
      candidateByKey.set(candidate.key, candidate);
    }

    const uniqueCandidates = Array.from(candidateByKey.values());

    const existingSessions = uniqueCandidates.length
      ? await prisma.session.findMany({
          where: {
            tenantId: tenant.id,
            centerId: {
              in: Array.from(
                new Set(uniqueCandidates.map((candidate) => candidate.data.centerId)),
              ),
            },
            startAt: { in: uniqueCandidates.map((candidate) => candidate.data.startAt) },
          },
          select: { tutorId: true, centerId: true, startAt: true },
        })
      : [];

    const existingKeys = new Set(
      existingSessions.map(
        (session) => `${session.tutorId}-${session.centerId}-${session.startAt.getTime()}`,
      ),
    );

    const toCreate = uniqueCandidates.filter(
      (candidate) => !existingKeys.has(candidate.key),
    );

    for (const candidate of uniqueCandidates) {
      const groupResult = summary.groups.find(
        (group) => group.name === candidate.groupName,
      );
      if (!groupResult) continue;

      if (existingKeys.has(candidate.key)) {
        groupResult.sessionSkipped += 1;
        summary.sessionsSkipped += 1;
      } else {
        groupResult.sessionCreated += 1;
        summary.sessionsCreated += 1;
      }
    }

    if (!args.dryRun && toCreate.length) {
      const result = await prisma.session.createMany({
        data: toCreate.map((candidate) => candidate.data),
        skipDuplicates: true,
      });

      if (result.count !== toCreate.length) {
        const diff = toCreate.length - result.count;
        summary.sessionsCreated -= diff;
        summary.sessionsSkipped += diff;
      }
    }

    if (args.includeTestParents) {
      await ensureTestParentsAndStudents(prisma, args, tenant.id, summary);
    }

    appendDeployLog(args.env, args, schedule, summary);

    console.log("MMC pilot setup complete.");
    console.log(`Tenant ID: ${summary.tenantId}`);
    console.log(`Dry run: ${args.dryRun ? "yes" : "no"}`);
    console.log("Summary:");
    console.log(
      JSON.stringify(
        {
          staffCount: summary.staff.length,
          groupsCount: summary.groups.length,
          sessionsDeleted: summary.sessionsDeleted,
          sessionsCreated: summary.sessionsCreated,
          sessionsSkipped: summary.sessionsSkipped,
          sessionConflicts: summary.sessionConflicts.length,
          testParentsCreated: summary.testParentsCreated.length,
          testStudentsCreated: summary.testStudentsCreated.length,
        },
        null,
        2,
      ),
    );
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

main().catch((error) => {
  console.error(
    "MMC pilot setup failed:",
    error instanceof Error ? error.message : error,
  );
  console.log(USAGE);
  process.exitCode = 1;
});
