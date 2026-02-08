// MMC Spring 2026 pilot setup script: tenant + catalog + groups + sessions (idempotent).
import "dotenv/config";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

import { prisma } from "../../../src/lib/db/prisma";
import { isValidTimeZone } from "../../../src/lib/timezones/isValidTimeZone";
import {
  GroupType,
  Role,
  SessionType,
  type Prisma,
} from "../../../src/generated/prisma/client";
import {
  AUTO_ENROLL_GROUP_BY_GRADE_KEY,
  MMC_LEVELS,
  MMC_PROGRAMS,
  MMC_SCHEDULE,
  buildGroupName,
  type ProgramKey,
} from "./mmc-schedule";

const USAGE = `\nUsage: pnpm pilot:mmc:setup-spring-2026 [options]\n\nOptions:\n  --tenantSlug <slug>         Tenant slug (default: mmc)\n  --tenantName <name>         Tenant name (default: MMC Education Calgary)\n  --centerName <name>         Center name (default: MMC Calgary)\n  --timeZone <IANA>           Timezone (default: America/Edmonton)\n  --termStart <YYYY-MM-DD>    Term start date (default: 2026-02-09)\n  --occurrences <count>       Weekly occurrences per group (default: 18)\n  --excludeDatesFile <path>   Optional file of YYYY-MM-DD blackout dates\n  --teacherMappingFile <path> Optional JSON mapping for tutors\n  --dryRun                    Print actions without writing to the database\n  --help                      Show this help text\n`;

type Args = {
  tenantSlug: string;
  tenantName: string;
  centerName: string;
  timeZone: string;
  termStart: string;
  occurrences: number;
  excludeDatesFile?: string;
  teacherMappingFile?: string;
  dryRun: boolean;
};

type TeacherMapping = {
  programs?: Record<string, string>;
  groups?: Record<string, string>;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

type Summary = {
  tenantCreated: boolean;
  tenantUpdated: boolean;
  centerCreated: boolean;
  centerUpdated: boolean;
  usersCreated: number;
  usersUpdated: number;
  membershipsEnsured: number;
  staffCentersEnsured: number;
  programsCreated: number;
  programsUpdated: number;
  levelsCreated: number;
  levelsUpdated: number;
  groupsCreated: number;
  groupsUpdated: number;
  groupTutorsEnsured: number;
  sessionsCreated: number;
  sessionsSkipped: number;
  sessionConflicts: number;
};

const DEFAULT_ARGS: Args = {
  tenantSlug: "mmc",
  tenantName: "MMC Education Calgary",
  centerName: "MMC Calgary",
  timeZone: "America/Edmonton",
  termStart: "2026-02-09",
  occurrences: 18,
  dryRun: false,
};

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
    tenantName: String(raw.tenantName ?? DEFAULT_ARGS.tenantName).trim(),
    centerName: String(raw.centerName ?? DEFAULT_ARGS.centerName).trim(),
    timeZone: String(raw.timeZone ?? DEFAULT_ARGS.timeZone).trim(),
    termStart: String(raw.termStart ?? DEFAULT_ARGS.termStart).trim(),
    occurrences: Number(raw.occurrences ?? DEFAULT_ARGS.occurrences),
    excludeDatesFile: raw.excludeDatesFile
      ? String(raw.excludeDatesFile).trim()
      : undefined,
    teacherMappingFile: raw.teacherMappingFile
      ? String(raw.teacherMappingFile).trim()
      : undefined,
    dryRun: Boolean(raw.dryRun ?? DEFAULT_ARGS.dryRun),
  };
}

function assertRequired(label: string, value: string) {
  if (!value) throw new Error(`${label} is required.`);
}

function loadExcludeDates(filePath: string, timeZone: string): Set<string> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Exclude dates file not found: ${filePath}`);
  }

  const lines = fs.readFileSync(absolutePath, "utf-8").split(/\r?\n/);
  const dates = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!DATE_REGEX.test(trimmed)) {
      throw new Error(`Invalid exclude date format: ${trimmed}`);
    }
    const parsed = DateTime.fromISO(trimmed, { zone: timeZone });
    if (!parsed.isValid) {
      throw new Error(`Invalid exclude date: ${trimmed}`);
    }
    dates.add(trimmed);
  }

  return dates;
}

function loadTeacherMapping(filePath: string): TeacherMapping {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Teacher mapping file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf-8");
  let parsed: TeacherMapping;
  try {
    parsed = JSON.parse(raw) as TeacherMapping;
  } catch (error) {
    throw new Error(
      `Teacher mapping file must be valid JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  return parsed;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildGroupNotes(
  existingNotes: string | null,
  code: string,
  scheduleLabel: string,
) {
  const codeLine = `MMC Pilot Code: ${code}`;
  const scheduleLine = `Schedule: ${scheduleLabel}`;
  const chunks = existingNotes ? [existingNotes] : [];

  if (!existingNotes?.includes(codeLine)) {
    chunks.push(codeLine);
  }
  if (!existingNotes?.includes(scheduleLine)) {
    chunks.push(scheduleLine);
  }

  return chunks.join("\n").trim() || null;
}

function buildScheduleLabel(weekday: number, startTime: string, duration: number) {
  const weekdayLabels: Record<number, string> = {
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
    7: "Sun",
  };
  const [hour, minute] = startTime.split(":").map((part) => Number(part));
  const hour12 = hour % 12 || 12;
  const suffix = hour >= 12 ? "PM" : "AM";
  const minuteLabel = minute.toString().padStart(2, "0");
  return `${weekdayLabels[weekday]} ${hour12}:${minuteLabel} ${suffix} (${duration} min)`;
}

function computeFirstDate(termStart: DateTime, weekday: number): DateTime {
  const delta = (weekday - termStart.weekday + 7) % 7;
  return termStart.plus({ days: delta });
}

function buildSessionOccurrences(
  termStart: string,
  timeZone: string,
  weekday: number,
  startTime: string,
  durationMinutes: number,
  occurrences: number,
  excludeDates: Set<string>,
) {
  const startDate = DateTime.fromISO(termStart, { zone: timeZone }).startOf("day");
  if (!startDate.isValid) {
    throw new Error(`Invalid termStart date: ${termStart}`);
  }

  const firstDate = computeFirstDate(startDate, weekday);
  const results: { startAt: Date; endAt: Date; localDate: string }[] = [];

  for (let i = 0; i < occurrences; i += 1) {
    const localDate = firstDate.plus({ weeks: i }).toISODate();
    if (!localDate) continue;
    if (excludeDates.has(localDate)) continue;

    const [hour, minute] = startTime.split(":").map((part) => Number(part));
    const localStart = DateTime.fromISO(localDate, { zone: timeZone }).set({
      hour,
      minute,
      second: 0,
      millisecond: 0,
    });
    if (!localStart.isValid) {
      throw new Error(`Invalid local start for ${localDate} ${startTime}`);
    }

    const localEnd = localStart.plus({ minutes: durationMinutes });

    results.push({
      startAt: localStart.toUTC().toJSDate(),
      endAt: localEnd.toUTC().toJSDate(),
      localDate,
    });
  }

  return results;
}

function buildTutorLookup(mapping: TeacherMapping | null) {
  const defaultByProgram = new Map<ProgramKey, string>();
  for (const program of MMC_PROGRAMS) {
    defaultByProgram.set(program.key, normalizeEmail(program.defaultTutorEmail));
  }

  const programOverrides = mapping?.programs ?? {};
  const groupOverrides = mapping?.groups ?? {};

  const normalizedProgramOverrides = new Map<string, string>();
  for (const [key, value] of Object.entries(programOverrides)) {
    normalizedProgramOverrides.set(key.trim(), normalizeEmail(value));
  }

  const normalizedGroupOverrides = new Map<string, string>();
  for (const [key, value] of Object.entries(groupOverrides)) {
    normalizedGroupOverrides.set(key.trim(), normalizeEmail(value));
  }

  return {
    resolveTutorEmail(item: (typeof MMC_SCHEDULE)[number]) {
      const groupOverride = normalizedGroupOverrides.get(item.code);
      if (groupOverride) return groupOverride;

      const programOverride = normalizedProgramOverrides.get(item.programKey);
      if (programOverride) return programOverride;

      return defaultByProgram.get(item.programKey) ?? "";
    },
  };
}

async function ensureTenant(client: DbClient, args: Args, summary: Summary) {
  const existing = await client.tenant.findUnique({
    where: { slug: args.tenantSlug },
    select: { id: true, name: true, slug: true, timeZone: true },
  });

  if (!existing) {
    if (args.dryRun) {
      summary.tenantCreated = true;
      return {
        id: `dryrun-tenant-${args.tenantSlug}`,
        name: args.tenantName,
        slug: args.tenantSlug,
        timeZone: args.timeZone,
      };
    }

    summary.tenantCreated = true;
    return client.tenant.create({
      data: {
        name: args.tenantName,
        slug: args.tenantSlug,
        timeZone: args.timeZone,
      },
    });
  }

  const needsUpdate =
    existing.name !== args.tenantName || existing.timeZone !== args.timeZone;

  if (needsUpdate) {
    summary.tenantUpdated = true;
    if (!args.dryRun) {
      return client.tenant.update({
        where: { id: existing.id },
        data: {
          name: args.tenantName,
          timeZone: args.timeZone,
        },
      });
    }
  }

  return existing;
}

async function ensureCenter(
  client: DbClient,
  tenantId: string,
  args: Args,
  summary: Summary,
) {
  const existing = await client.center.findUnique({
    where: {
      tenantId_name: {
        tenantId,
        name: args.centerName,
      },
    },
    select: { id: true, name: true, timezone: true },
  });

  if (!existing) {
    summary.centerCreated = true;
    if (args.dryRun) {
      return {
        id: `dryrun-center-${tenantId}`,
        name: args.centerName,
        timezone: args.timeZone,
      };
    }

    return client.center.create({
      data: {
        tenantId,
        name: args.centerName,
        timezone: args.timeZone,
      },
    });
  }

  if (existing.timezone !== args.timeZone) {
    summary.centerUpdated = true;
    if (!args.dryRun) {
      return client.center.update({
        where: { id: existing.id },
        data: { timezone: args.timeZone },
      });
    }
  }

  return existing;
}

async function ensureUser(
  client: DbClient,
  args: Args,
  summary: Summary,
  input: { email: string; name: string },
) {
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await client.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true },
  });

  if (!existing) {
    summary.usersCreated += 1;
    if (args.dryRun) {
      return { id: `dryrun-user-${normalizedEmail}`, email: normalizedEmail };
    }

    const passwordHash = await bcrypt.hash(randomUUID(), 10);
    return client.user.create({
      data: {
        email: normalizedEmail,
        name: input.name,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });
  }

  if (!existing.name && input.name) {
    summary.usersUpdated += 1;
    if (!args.dryRun) {
      return client.user.update({
        where: { id: existing.id },
        data: { name: input.name },
        select: { id: true, email: true, name: true },
      });
    }
  }

  return existing;
}

async function ensureMembership(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  userId: string,
  role: Role,
) {
  summary.membershipsEnsured += 1;
  if (args.dryRun) return;

  await client.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId,
        userId,
      },
    },
    update: { role },
    create: { tenantId, userId, role },
  });
}

async function ensureStaffCenter(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  userId: string,
  centerId: string,
) {
  summary.staffCentersEnsured += 1;
  if (args.dryRun) return;

  await client.staffCenter.upsert({
    where: {
      tenantId_userId_centerId: {
        tenantId,
        userId,
        centerId,
      },
    },
    update: {},
    create: { tenantId, userId, centerId },
  });
}

async function ensurePrograms(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
) {
  const programMap = new Map<string, { id: string; name: string }>();

  for (const program of MMC_PROGRAMS) {
    const existing = await client.program.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: program.name,
        },
      },
      select: { id: true, name: true, isActive: true },
    });

    if (!existing) {
      summary.programsCreated += 1;
      if (args.dryRun) {
        programMap.set(program.key, {
          id: `dryrun-program-${program.key}`,
          name: program.name,
        });
        continue;
      }

      const created = await client.program.create({
        data: {
          tenantId,
          name: program.name,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      programMap.set(program.key, created);
      continue;
    }

    if (!existing.isActive) {
      summary.programsUpdated += 1;
      if (!args.dryRun) {
        await client.program.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
    }

    programMap.set(program.key, { id: existing.id, name: existing.name });
  }

  return programMap;
}

async function ensureLevels(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
) {
  const levelMap = new Map<string, { id: string; name: string }>();

  for (const level of MMC_LEVELS) {
    const existing = await client.level.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: level.name,
        },
      },
      select: { id: true, name: true, sortOrder: true, isActive: true },
    });

    if (!existing) {
      summary.levelsCreated += 1;
      if (args.dryRun) {
        levelMap.set(level.code, {
          id: `dryrun-level-${level.code}`,
          name: level.name,
        });
        continue;
      }

      const created = await client.level.create({
        data: {
          tenantId,
          name: level.name,
          sortOrder: level.sortOrder,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      levelMap.set(level.code, created);
      continue;
    }

    if (existing.sortOrder !== level.sortOrder || !existing.isActive) {
      summary.levelsUpdated += 1;
      if (!args.dryRun) {
        await client.level.update({
          where: { id: existing.id },
          data: {
            sortOrder: level.sortOrder,
            isActive: true,
          },
        });
      }
    }

    levelMap.set(level.code, { id: existing.id, name: existing.name });
  }

  return levelMap;
}

async function ensureGroups(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  centerId: string,
  programMap: Map<string, { id: string; name: string }>,
  levelMap: Map<string, { id: string; name: string }>,
) {
  const groupMap = new Map<string, { id: string; name: string }>();

  for (const item of MMC_SCHEDULE) {
    const program = programMap.get(item.programKey);
    if (!program) {
      throw new Error(`Missing program for ${item.programKey}`);
    }

    const level = levelMap.get(item.levelCode);
    if (!level) {
      throw new Error(`Missing level for ${item.levelCode}`);
    }

    const groupName = buildGroupName(item);
    const scheduleLabel = buildScheduleLabel(
      item.weekday,
      item.startTime,
      item.durationMinutes,
    );

    const existing = await client.group.findFirst({
      where: {
        tenantId,
        centerId,
        name: groupName,
      },
      select: {
        id: true,
        notes: true,
        programId: true,
        levelId: true,
        type: true,
        isActive: true,
      },
    });

    const nextNotes = buildGroupNotes(existing?.notes ?? null, item.code, scheduleLabel);

    if (!existing) {
      summary.groupsCreated += 1;
      if (args.dryRun) {
        groupMap.set(item.code, { id: `dryrun-group-${item.code}`, name: groupName });
        continue;
      }

      const created = await client.group.create({
        data: {
          tenantId,
          centerId,
          programId: program.id,
          levelId: level.id,
          name: groupName,
          type: GroupType.GROUP,
          isActive: true,
          notes: nextNotes,
        },
        select: { id: true, name: true },
      });
      groupMap.set(item.code, created);
      continue;
    }

    const needsUpdate =
      existing.programId !== program.id ||
      existing.levelId !== level.id ||
      existing.type !== GroupType.GROUP ||
      !existing.isActive ||
      existing.notes !== nextNotes;

    if (needsUpdate) {
      summary.groupsUpdated += 1;
      if (!args.dryRun) {
        await client.group.update({
          where: { id: existing.id },
          data: {
            programId: program.id,
            levelId: level.id,
            type: GroupType.GROUP,
            isActive: true,
            notes: nextNotes,
          },
        });
      }
    }

    groupMap.set(item.code, { id: existing.id, name: groupName });
  }

  return groupMap;
}

async function ensureGroupTutors(
  client: DbClient,
  args: Args,
  summary: Summary,
  tenantId: string,
  groupId: string,
  tutorId: string,
) {
  summary.groupTutorsEnsured += 1;
  if (args.dryRun) return;

  await client.groupTutor.upsert({
    where: {
      tenantId_groupId_userId: {
        tenantId,
        groupId,
        userId: tutorId,
      },
    },
    update: {},
    create: { tenantId, groupId, userId: tutorId },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  assertRequired("tenantSlug", args.tenantSlug);
  assertRequired("tenantName", args.tenantName);
  assertRequired("centerName", args.centerName);
  assertRequired("timeZone", args.timeZone);
  assertRequired("termStart", args.termStart);

  if (!SLUG_REGEX.test(args.tenantSlug)) {
    throw new Error("tenantSlug must be lowercase and contain letters, numbers, and dashes.");
  }

  if (!DATE_REGEX.test(args.termStart)) {
    throw new Error("termStart must be formatted as YYYY-MM-DD.");
  }

  if (!Number.isFinite(args.occurrences) || args.occurrences <= 0) {
    throw new Error("occurrences must be a positive number.");
  }

  if (!isValidTimeZone(args.timeZone)) {
    throw new Error("timeZone must be a valid IANA timezone.");
  }

  const excludeDates = args.excludeDatesFile
    ? loadExcludeDates(args.excludeDatesFile, args.timeZone)
    : new Set<string>();

  const teacherMapping = args.teacherMappingFile
    ? loadTeacherMapping(args.teacherMappingFile)
    : null;

  const tutorResolver = buildTutorLookup(teacherMapping);

  const knownTeacherEmails = new Set(
    MMC_PROGRAMS.map((program) => normalizeEmail(program.defaultTutorEmail)),
  );

  if (teacherMapping?.programs || teacherMapping?.groups) {
    const referencedEmails = new Set<string>();
    for (const email of Object.values(teacherMapping.programs ?? {})) {
      referencedEmails.add(normalizeEmail(email));
    }
    for (const email of Object.values(teacherMapping.groups ?? {})) {
      referencedEmails.add(normalizeEmail(email));
    }

    for (const email of referencedEmails) {
      if (!knownTeacherEmails.has(email)) {
        throw new Error(
          `Teacher mapping references ${email}, but only the three MMC teacher emails are allowed.`,
        );
      }
    }
  }

  const summary: Summary = {
    tenantCreated: false,
    tenantUpdated: false,
    centerCreated: false,
    centerUpdated: false,
    usersCreated: 0,
    usersUpdated: 0,
    membershipsEnsured: 0,
    staffCentersEnsured: 0,
    programsCreated: 0,
    programsUpdated: 0,
    levelsCreated: 0,
    levelsUpdated: 0,
    groupsCreated: 0,
    groupsUpdated: 0,
    groupTutorsEnsured: 0,
    sessionsCreated: 0,
    sessionsSkipped: 0,
    sessionConflicts: 0,
  };

  const run = async (client: DbClient) => {
    const tenant = await ensureTenant(client, args, summary);
    const center = await ensureCenter(client, tenant.id, args, summary);

    const teacherInputs = [
      {
        email: "hanka.ilott@gmail.com",
        name: "Hana Ilott",
        role: Role.Tutor,
      },
      {
        email: "nicolemacarthur@mywic.ca",
        name: "Nicole MacArthur",
        role: Role.Tutor,
      },
      {
        email: "mmceducationcalgary@gmail.com",
        name: "Flora Fan",
        role: Role.Admin,
      },
    ];

    const userByEmail = new Map<string, { id: string; role: Role }>();

    for (const teacher of teacherInputs) {
      if (args.dryRun) {
        const user = await ensureUser(client, args, summary, {
          email: teacher.email,
          name: teacher.name,
        });

        await ensureMembership(
          client,
          args,
          summary,
          tenant.id,
          user.id,
          teacher.role,
        );
        await ensureStaffCenter(
          client,
          args,
          summary,
          tenant.id,
          user.id,
          center.id,
        );

        userByEmail.set(normalizeEmail(teacher.email), {
          id: user.id,
          role: teacher.role,
        });
        continue;
      }

      const user = await prisma.$transaction(async (tx) => {
        const ensuredUser = await ensureUser(tx, args, summary, {
          email: teacher.email,
          name: teacher.name,
        });

        await ensureMembership(
          tx,
          args,
          summary,
          tenant.id,
          ensuredUser.id,
          teacher.role,
        );
        await ensureStaffCenter(
          tx,
          args,
          summary,
          tenant.id,
          ensuredUser.id,
          center.id,
        );

        return ensuredUser;
      });

      userByEmail.set(normalizeEmail(teacher.email), {
        id: user.id,
        role: teacher.role,
      });
    }

    const programMap = await ensurePrograms(client, args, summary, tenant.id);
    const levelMap = await ensureLevels(client, args, summary, tenant.id);
    const groupMap = await ensureGroups(
      client,
      args,
      summary,
      tenant.id,
      center.id,
      programMap,
      levelMap,
    );

    const tutorConflicts = new Map<string, string[]>();

    for (const item of MMC_SCHEDULE) {
      const tutorEmail = tutorResolver.resolveTutorEmail(item);
      const tutor = userByEmail.get(tutorEmail);
      if (!tutor) {
        throw new Error(`Tutor not found for ${item.code} (${tutorEmail}).`);
      }

      const group = groupMap.get(item.code);
      if (!group) {
        throw new Error(`Group not found for ${item.code}`);
      }

      const overlapKey = `${tutor.id}-${item.weekday}-${item.startTime}`;
      const overlaps = tutorConflicts.get(overlapKey) ?? [];
      overlaps.push(item.code);
      tutorConflicts.set(overlapKey, overlaps);

      await ensureGroupTutors(client, args, summary, tenant.id, group.id, tutor.id);
    }

    for (const [key, codes] of tutorConflicts.entries()) {
      if (codes.length > 1) {
        summary.sessionConflicts += codes.length - 1;
        console.warn(
          `Tutor schedule conflict detected (${key}). Groups: ${codes.join(", ")}.`,
        );
      }
    }

    const candidates: {
      key: string;
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
      groupCode: string;
      localDate: string;
    }[] = [];

    for (const item of MMC_SCHEDULE) {
      const tutorEmail = tutorResolver.resolveTutorEmail(item);
      const tutor = userByEmail.get(tutorEmail);
      if (!tutor) {
        throw new Error(`Tutor not found for ${item.code} (${tutorEmail}).`);
      }

      const group = groupMap.get(item.code);
      if (!group) {
        throw new Error(`Group not found for ${item.code}`);
      }

      const occurrences = buildSessionOccurrences(
        args.termStart,
        args.timeZone,
        item.weekday,
        item.startTime,
        item.durationMinutes,
        args.occurrences,
        excludeDates,
      );

      for (const occurrence of occurrences) {
        const key = `${tutor.id}-${center.id}-${occurrence.startAt.getTime()}`;
        candidates.push({
          key,
          data: {
            tenantId: tenant.id,
            centerId: center.id,
            tutorId: tutor.id,
            sessionType: SessionType.GROUP,
            groupId: group.id,
            startAt: occurrence.startAt,
            endAt: occurrence.endAt,
            timezone: args.timeZone,
          },
          groupCode: item.code,
          localDate: occurrence.localDate,
        });
      }
    }

    const existingSessions = await client.session.findMany({
      where: {
        tenantId: tenant.id,
        centerId: center.id,
        startAt: {
          in: candidates.map((candidate) => candidate.data.startAt),
        },
      },
      select: { tutorId: true, startAt: true },
    });

    const existingKeys = new Set(
      existingSessions.map(
        (session) =>
          `${session.tutorId}-${center.id}-${session.startAt.getTime()}`,
      ),
    );

    const toCreate: typeof candidates = [];
    const occupiedKeys = new Set(existingKeys);

    for (const candidate of candidates) {
      if (occupiedKeys.has(candidate.key)) {
        summary.sessionsSkipped += 1;
        continue;
      }

      occupiedKeys.add(candidate.key);
      toCreate.push(candidate);
    }

    if (!args.dryRun && toCreate.length) {
      const createResult = await client.session.createMany({
        data: toCreate.map((candidate) => candidate.data),
        skipDuplicates: true,
      });
      summary.sessionsCreated += createResult.count;
      summary.sessionsSkipped += toCreate.length - createResult.count;
    }

    if (args.dryRun) {
      summary.sessionsCreated += toCreate.length;
    }

    return { tenant, center };
  };

  // Keep transactions scoped to small multi-write blocks to avoid timeout.
  const result = await run(prisma);

  console.log("MMC pilot setup complete.");
  console.log(`Tenant ID: ${result.tenant.id}`);
  console.log(`Center ID: ${result.center.id}`);
  console.log(`Dry run: ${args.dryRun ? "yes" : "no"}`);
  console.log("Summary:");
  console.log(
    JSON.stringify(
      {
        tenantCreated: summary.tenantCreated,
        tenantUpdated: summary.tenantUpdated,
        centerCreated: summary.centerCreated,
        centerUpdated: summary.centerUpdated,
        usersCreated: summary.usersCreated,
        usersUpdated: summary.usersUpdated,
        membershipsEnsured: summary.membershipsEnsured,
        staffCentersEnsured: summary.staffCentersEnsured,
        programsCreated: summary.programsCreated,
        programsUpdated: summary.programsUpdated,
        levelsCreated: summary.levelsCreated,
        levelsUpdated: summary.levelsUpdated,
        groupsCreated: summary.groupsCreated,
        groupsUpdated: summary.groupsUpdated,
        groupTutorsEnsured: summary.groupTutorsEnsured,
        sessionsCreated: summary.sessionsCreated,
        sessionsSkipped: summary.sessionsSkipped,
        sessionConflicts: summary.sessionConflicts,
        occurrencesPerGroup: args.occurrences,
        excludeDatesCount: excludeDates.size,
      },
      null,
      2,
    ),
  );

  console.log("Auto-enroll mapping (Singapore Math only):");
  console.log(JSON.stringify(AUTO_ENROLL_GROUP_BY_GRADE_KEY, null, 2));
}

main()
  .catch((error) => {
    console.error(
      "MMC pilot setup failed:",
      error instanceof Error ? error.message : error,
    );
    console.log(USAGE);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
