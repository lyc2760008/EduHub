// E2E tenant fixture helpers ensure test data stays scoped to the e2e tenant.
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

import type {
  AuditActorType,
  AuditEventResult,
  Prisma,
  PrismaClient,
} from "../../../src/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../../src/lib/audit/constants";
import {
  STEP223_INTERNAL_ONLY_SENTINEL,
  STEP223_PROGRESS_NOTE_COUNT,
  buildStep223ParentVisibleNote,
} from "./step203";
import { STEP224_INTERNAL_ONLY_SENTINEL } from "./step224";
import {
  STEP226_AUDIT_EVENT_COUNT,
  STEP226_AUDIT_MARKER,
  STEP226_INTERNAL_ONLY_SENTINEL,
  buildStep226AuditEntityId,
  buildStep226AuditEventId,
  buildStep226MarkerEntityId,
} from "./step226";

// DbClient allows helpers to run with either the full Prisma client or a transaction client.
type DbClient = PrismaClient | Prisma.TransactionClient;

function isPrismaClient(client: DbClient): client is PrismaClient {
  return "$transaction" in client;
}

function resolveTxOption(envName: string, fallbackMs: number) {
  const raw = process.env[envName];
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

async function withTransaction<T>(
  client: DbClient,
  handler: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  // E2E seeding does many upserts/deletes, so raise interactive tx limits above Prisma defaults.
  const maxWait = resolveTxOption("E2E_TX_MAX_WAIT_MS", 10_000);
  const timeout = resolveTxOption("E2E_TX_TIMEOUT_MS", 60_000);

  return isPrismaClient(client)
    ? client.$transaction(handler, { maxWait, timeout })
    : handler(client);
}

const DEFAULT_E2E_TENANT_SLUG = "e2e-testing";
const DEFAULT_E2E_RUN_ID = "local";

function resolveE2ETenantSlug() {
  // Default to the dedicated e2e tenant to avoid polluting demo data.
  return process.env.E2E_TENANT_SLUG || DEFAULT_E2E_TENANT_SLUG;
}

function resolveE2ERunId() {
  // Stable run identifiers keep fixture emails deterministic across runs.
  return process.env.E2E_RUN_ID || DEFAULT_E2E_RUN_ID;
}

type Step226SeedAuditEventsArgs = {
  tx: Prisma.TransactionClient;
  tenantId: string;
  tenantSlug: string;
  runId: string;
  adminUserId: string;
  tutorUserId: string;
};

function resolveStep226EntityType(action: string) {
  if (action === AUDIT_ACTIONS.REQUEST_RESOLVED) {
    return AUDIT_ENTITY_TYPES.REQUEST;
  }
  if (action === AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED) {
    return AUDIT_ENTITY_TYPES.GROUP;
  }
  if (
    action === AUDIT_ACTIONS.PARENT_INVITE_SENT ||
    action === AUDIT_ACTIONS.PARENT_INVITE_RESENT
  ) {
    return AUDIT_ENTITY_TYPES.PARENT;
  }
  return AUDIT_ENTITY_TYPES.SESSION;
}

async function seedStep226AuditEvents({
  tx,
  tenantId,
  tenantSlug,
  runId,
  adminUserId,
  tutorUserId,
}: Step226SeedAuditEventsArgs) {
  const idPrefix = `e2e-${tenantSlug}-${runId}-audit-step226-`;
  const markerEntityId = buildStep226MarkerEntityId(tenantSlug, runId);
  const actionCycle = [
    AUDIT_ACTIONS.REQUEST_RESOLVED,
    AUDIT_ACTIONS.SESSIONS_GENERATED,
    AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED,
    AUDIT_ACTIONS.ATTENDANCE_UPDATED,
    AUDIT_ACTIONS.NOTES_UPDATED,
    AUDIT_ACTIONS.PARENT_INVITE_SENT,
    AUDIT_ACTIONS.PARENT_INVITE_RESENT,
  ] as const;

  // Clear prior Step 22.6 fixture rows so repeated seed runs remain deterministic for pagination checks.
  await tx.auditEvent.deleteMany({
    where: {
      tenantId,
      id: { startsWith: idPrefix },
    },
  });

  const now = DateTime.utc();
  const seedRows = Array.from({ length: STEP226_AUDIT_EVENT_COUNT }, (_, index) => {
    const sequence = index + 1;
    const action = actionCycle[index % actionCycle.length];
    const result: AuditEventResult = sequence % 8 === 0 ? "FAILURE" : "SUCCESS";
    const actorType: AuditActorType = sequence % 9 === 0 ? "SYSTEM" : "USER";
    const actorId =
      actorType === "SYSTEM"
        ? null
        : sequence % 2 === 0
          ? adminUserId
          : tutorUserId;
    const actorDisplay =
      actorType === "SYSTEM"
        ? "System"
        : sequence % 2 === 0
          ? "E2E Admin"
          : "E2E Tutor";

    const fallbackMetadata: Prisma.InputJsonValue =
      result === "FAILURE"
        ? { errorCode: "validation_error" }
        : {
            rowsUpdatedCount: (sequence % 5) + 1,
          };

    const metadataByAction: Record<string, Prisma.InputJsonValue> = {
      [AUDIT_ACTIONS.REQUEST_RESOLVED]: {
        fromStatus: "PENDING",
        toStatus: sequence % 2 === 0 ? "APPROVED" : "DECLINED",
      },
      [AUDIT_ACTIONS.SESSIONS_GENERATED]: {
        sessionsCreatedCount: (sequence % 4) + 1,
        sessionsUpdatedCount: 0,
        sessionsSkippedCount: sequence % 2,
        inputRangeFrom: "2026-02-01",
        inputRangeTo: "2026-02-28",
      },
      [AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED]: {
        sessionsAffectedCount: (sequence % 3) + 1,
        studentsAddedCount: (sequence % 4) + 1,
        totalFutureSessions: 6 + (sequence % 3),
      },
      [AUDIT_ACTIONS.ATTENDANCE_UPDATED]: {
        rowsUpdatedCount: (sequence % 4) + 1,
        presentCount: 1,
        absentCount: 0,
        lateCount: sequence % 2,
        excusedCount: 0,
      },
      [AUDIT_ACTIONS.NOTES_UPDATED]: {
        rowsUpdatedCount: 1,
      },
      [AUDIT_ACTIONS.PARENT_INVITE_SENT]: {
        method: "magic_link",
      },
      [AUDIT_ACTIONS.PARENT_INVITE_RESENT]: {
        method: "magic_link",
      },
    };

    // Keep fixture events within the recent range so default "last 7 days" filters always include them.
    const occurredAt = now.minus({ hours: sequence * 3 }).toJSDate();
    const entityId = buildStep226AuditEntityId(tenantSlug, runId, sequence);
    const metadata = metadataByAction[action] ?? fallbackMetadata;

    return {
      id: buildStep226AuditEventId(tenantSlug, runId, sequence),
      tenantId,
      occurredAt,
      actorType,
      actorId,
      actorDisplay,
      action,
      entityType: resolveStep226EntityType(action),
      entityId,
      result,
      correlationId: `step226-seed-${sequence}`,
      metadata,
    };
  });

  const markerRow = seedRows[5];
  markerRow.entityId = markerEntityId;
  // `filterKeys` is allowlisted by audit redaction and safe for deterministic search/export assertions.
  markerRow.metadata = {
    ...(markerRow.metadata as Record<string, Prisma.InputJsonValue>),
    filterKeys: [STEP226_AUDIT_MARKER],
    rowsUpdatedCount: 2,
  } as Prisma.InputJsonValue;

  const sentinelRow = seedRows[7];
  sentinelRow.metadata = {
    ...(sentinelRow.metadata as Record<string, Prisma.InputJsonValue>),
    // Unsafe keys are intentionally seeded to verify list/detail/export redaction drops them.
    internalNoteText: STEP226_INTERNAL_ONLY_SENTINEL,
    tokenLeakCandidate: "token=seed-should-never-render",
  } as Prisma.InputJsonValue;

  await tx.auditEvent.createMany({
    data: seedRows,
    skipDuplicates: false,
  });
}

async function ensureE2ETenant(prisma: DbClient, slug: string, name?: string) {
  // Create missing e2e tenants on demand to keep local test setup minimal.
  const existing = await prisma.tenant.findFirst({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (existing) {
    return existing;
  }
  if (!slug.toLowerCase().startsWith("e2e")) {
    throw new Error(
      `Refusing to create non-e2e tenant '${slug}' during test seeding.`,
    );
  }
  return prisma.tenant.create({
    data: {
      slug,
      name: name || slug,
    },
    select: { id: true, slug: true, name: true },
  });
}

async function resolvePasswordHash(prisma: DbClient, email: string, password: string) {
  // Reuse an existing hash if it already matches to avoid unnecessary churn.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true },
  });
  if (existingUser?.passwordHash) {
    const matches = await bcrypt.compare(password, existingUser.passwordHash);
    if (matches) {
      return existingUser.passwordHash;
    }
  }
  return bcrypt.hash(password, 10);
}

function sanitizeForEmail(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function assertSafeCleanup(tenantSlug: string) {
  // Cleanup should never run against non-e2e tenants or production environments.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to clean E2E data in production.");
  }
  if (!tenantSlug.toLowerCase().startsWith("e2e")) {
    throw new Error(
      `Refusing to clean tenant '${tenantSlug}'. Slug must start with 'e2e'.`,
    );
  }
}

function assertE2ETenantSlug(tenantSlug: string) {
  // Seeding should only target the dedicated e2e tenant slug prefix.
  if (!tenantSlug.toLowerCase().startsWith("e2e")) {
    throw new Error(
      `Refusing to seed tenant '${tenantSlug}'. Slug must start with 'e2e'.`,
    );
  }
}

export async function getE2ETenant(prisma: DbClient) {
  const tenantSlug = resolveE2ETenantSlug();
  return ensureE2ETenant(
    prisma,
    tenantSlug,
    process.env.E2E_TENANT_NAME || "E2E Testing",
  );
}

export async function upsertE2EFixtures(prisma: DbClient) {
  const tenant = await getE2ETenant(prisma);
  assertE2ETenantSlug(tenant.slug);
  const runId = sanitizeForEmail(resolveE2ERunId());
  const emailSuffix = runId ? `+${runId}` : "";

  const parentAccessCode =
    process.env.E2E_PARENT_ACCESS_CODE || process.env.SEED_DEFAULT_PASSWORD;
  if (!parentAccessCode) {
    throw new Error(
      "Missing E2E_PARENT_ACCESS_CODE or SEED_DEFAULT_PASSWORD for parent access codes.",
    );
  }

  // Parent auth uppercases access codes before hashing, so normalize here.
  const normalizedParentAccessCode = parentAccessCode.trim().toUpperCase();

  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD for e2e admin login.",
    );
  }

  const tutorLoginEmail =
    process.env.E2E_TUTOR_EMAIL || process.env.E2E_TUTOR1_EMAIL;
  const tutorLoginPassword =
    process.env.E2E_TUTOR_PASSWORD || process.env.E2E_TUTOR1_PASSWORD;
  if (!tutorLoginEmail || !tutorLoginPassword) {
    throw new Error(
      "Missing E2E_TUTOR_EMAIL/E2E_TUTOR_PASSWORD (or E2E_TUTOR1_EMAIL/E2E_TUTOR1_PASSWORD) for e2e tutor login.",
    );
  }

  const parentRoleEmail =
    process.env.E2E_PARENT_EMAIL || process.env.SEED_PARENT_EMAIL;
  const parentRolePassword =
    process.env.E2E_PARENT_PASSWORD || process.env.SEED_PARENT_PASSWORD;
  if (!parentRoleEmail || !parentRolePassword) {
    throw new Error(
      "Missing E2E_PARENT_EMAIL/E2E_PARENT_PASSWORD (or SEED_PARENT_EMAIL/SEED_PARENT_PASSWORD) for parent-role login.",
    );
  }

  const normalizedAdminEmail = adminEmail.trim().toLowerCase();
  const normalizedTutorEmail = tutorLoginEmail.trim().toLowerCase();
  const normalizedParentRoleEmail = parentRoleEmail.trim().toLowerCase();

  if (normalizedTutorEmail === normalizedAdminEmail) {
    throw new Error(
      "E2E_TUTOR_EMAIL must differ from E2E_ADMIN_EMAIL to preserve role isolation in tests.",
    );
  }

  if (
    normalizedParentRoleEmail === normalizedAdminEmail ||
    normalizedParentRoleEmail === normalizedTutorEmail
  ) {
    throw new Error(
      "E2E_PARENT_EMAIL must be distinct from admin/tutor emails for role-specific tests.",
    );
  }

  const accessCodeHash = await bcrypt.hash(normalizedParentAccessCode, 10);
  const now = new Date();

  const tutorEmail = `e2e.tutor${emailSuffix}@example.com`;
  const tutorBEmail = `e2e.tutor.b${emailSuffix}@example.com`;
  const parentA0Email = `e2e.parent.a0${emailSuffix}@example.com`;
  const parentA1Email = `e2e.parent.a1${emailSuffix}@example.com`;

  // Guard against overwriting the fixture tutor password when env points at the same user.
  if (
    normalizedTutorEmail === tutorEmail.toLowerCase() &&
    tutorLoginPassword !== normalizedParentAccessCode
  ) {
    throw new Error(
      "E2E_TUTOR_PASSWORD must match E2E_PARENT_ACCESS_CODE when using the e2e.tutor account to keep Step 20.3 tests stable.",
    );
  }

  const secondaryTenantSlug =
    process.env.E2E_SECOND_TENANT_SLUG ||
    (tenant.slug.toLowerCase().startsWith("e2e")
      ? `${tenant.slug}-secondary`
      : process.env.SEED_SECOND_TENANT_SLUG || "acme");
  const secondaryTenant =
    secondaryTenantSlug && secondaryTenantSlug !== tenant.slug
      ? // Ensure a second tenant exists for cross-tenant RBAC checks.
        await ensureE2ETenant(
          prisma,
          secondaryTenantSlug,
          process.env.E2E_SECOND_TENANT_NAME || "E2E Secondary",
        )
      : null;

  const studentId = `e2e-${tenant.slug}-${runId}-student-s1`;
  const unlinkedStudentId = `e2e-${tenant.slug}-${runId}-student-s2`;
  // Step 22.2 fixture: a student whose linked parent is missing an email (button disabled state coverage).
  const missingEmailStudentId = `e2e-${tenant.slug}-${runId}-student-s3`;
  // Parent magic-link eligibility requires at least one linked student; keep a dedicated student for A0
  // so tests can authenticate as a "different parent" without affecting A1's session fixtures.
  const parentA0StudentId = `e2e-${tenant.slug}-${runId}-student-s4`;
  // Step 22.3 requires a linked parent-owned student with no notes for empty-state assertions.
  const progressEmptyStudentId = `e2e-${tenant.slug}-${runId}-student-s5`;
  // Cross-tenant student fixture ensures URL-crafted probing cannot leak records across tenants.
  const crossTenantStudentId = `e2e-${secondaryTenantSlug}-${runId}-student-cross-tenant-s1`;
  const upcomingSessionId = `e2e-${tenant.slug}-${runId}-session-upcoming`;
  const pastSessionId = `e2e-${tenant.slug}-${runId}-session-past`;
  const tutorBSessionId = `e2e-${tenant.slug}-${runId}-session-tutor-b`;
  const unlinkedSessionId = `e2e-${tenant.slug}-${runId}-session-unlinked`;
  // Step 22.4 fixture sessions back Tutor "My Sessions" + "Run Session" deterministic coverage.
  const step224TutorASession1Id = `e2e-${tenant.slug}-${runId}-session-step224-tutor-a-1`;
  const step224TutorASession2Id = `e2e-${tenant.slug}-${runId}-session-step224-tutor-a-2`;
  const step224TutorBSessionId = `e2e-${tenant.slug}-${runId}-session-step224-tutor-b-1`;
  const step224CrossTenantSessionId =
    `e2e-${secondaryTenantSlug}-${runId}-session-step224-cross-tenant-1`;
  const progressSessionIds = Array.from(
    { length: STEP223_PROGRESS_NOTE_COUNT },
    (_, index) =>
      `e2e-${tenant.slug}-${runId}-session-progress-note-${String(index + 1).padStart(2, "0")}`,
  );
  const progressInternalOnlySessionId =
    `e2e-${tenant.slug}-${runId}-session-progress-internal-only`;
  const absenceHappySessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-happy`;
  const absenceDuplicateSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-duplicate`;
  const absenceResolveSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-resolve`;
  const absenceResolvedSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-resolved`;
  const absenceStaffApprovedSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-staff-approved`;
  const absenceStaffPendingSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-staff-pending`;
  const absenceStaffDeclinedSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-staff-declined`;
  // Step 20.6 sessions isolate withdraw/resubmit/auto-assist coverage from prior fixtures.
  const absenceWithdrawFutureSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-withdraw-future`;
  const absenceResubmitSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-resubmit`;
  const absenceApproveLockSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-approve-lock`;
  const absenceDeclineLockSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-decline-lock`;
  const absenceWithdrawPastSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-withdraw-past`;
  const absenceAutoAssistWithdrawnSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-autoassist-withdrawn`;
  const absenceAutoAssistApprovedSessionId =
    `e2e-${tenant.slug}-${runId}-session-absence-autoassist-approved`;

  const centerName = "E2E Center";
  const secondaryCenterName = "E2E Secondary Center";
  const tutorName = "E2E Tutor";
  const tutorBName = "E2E Tutor B";
  const secondaryTutorName = "E2E Secondary Tutor";
  const adminName = "E2E Admin";
  const parentA0Name = { firstName: "E2E Parent", lastName: "A0" };
  const parentA1Name = { firstName: "E2E Parent", lastName: "A1" };
  // Parent email is required by the schema, but an empty string is allowed and exercises the admin UI disabled state.
  const missingEmailParentName = { firstName: "E2E Parent", lastName: "NoEmail" };
  const missingEmailParentEmail = "";
  const studentName = { firstName: "E2E Student", lastName: "S1" };
  const unlinkedStudentName = { firstName: "E2E Student", lastName: "S2" };
  const missingEmailStudentName = { firstName: "E2E Student", lastName: "S3" };
  const parentA0StudentName = { firstName: "E2E Student", lastName: "A0" };
  const progressEmptyStudentName = { firstName: "E2E Student", lastName: "S5 Empty" };
  const crossTenantStudentName = { firstName: "E2E Student", lastName: "CrossTenant" };
  const secondaryTutorEmail = `e2e.tutor.secondary${emailSuffix}@example.com`;

  const timezone = "America/Edmonton";
  const nowLocal = DateTime.now().setZone(timezone);
  // Stagger fixture session seconds to avoid unique constraint collisions across runs.
  let sessionSecondSeed = 1;
  const withUniqueSessionSeconds = (value: DateTime) => {
    const seed = sessionSecondSeed % 60;
    sessionSecondSeed += 1;
    return value.set({ second: seed, millisecond: (seed * 37) % 1000 });
  };

  const upcomingStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 2 }).set({ hour: 10, minute: 0 }),
  );
  const pastStart = withUniqueSessionSeconds(
    nowLocal.minus({ days: 7 }).set({ hour: 9, minute: 0 }),
  );
  const tutorBStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 1 }).set({ hour: 11, minute: 15 }),
  );
  const unlinkedStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 4 }).set({ hour: 14, minute: 30 }),
  );
  const step224TutorAFirstStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 1 }).set({ hour: 8, minute: 10 }),
  );
  const step224TutorASecondStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 2 }).set({ hour: 8, minute: 40 }),
  );
  const step224TutorBOtherStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 1 }).set({ hour: 9, minute: 20 }),
  );
  const step224CrossTenantStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 3 }).set({ hour: 10, minute: 10 }),
  );
  const absenceHappyStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 3 }).set({ hour: 12, minute: 0 }),
  );
  const absenceDuplicateStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 5 }).set({ hour: 13, minute: 0 }),
  );
  const absenceResolveStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 6 }).set({ hour: 15, minute: 0 }),
  );
  const absenceResolvedStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 7 }).set({ hour: 16, minute: 0 }),
  );
  const absenceStaffApprovedStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 8 }).set({ hour: 9, minute: 30 }),
  );
  const absenceStaffPendingStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 9 }).set({ hour: 10, minute: 30 }),
  );
  const absenceStaffDeclinedStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 10 }).set({ hour: 11, minute: 30 }),
  );
  const absenceWithdrawFutureStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 2 }).set({ hour: 14, minute: 0 }),
  );
  const absenceResubmitStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 2 }).set({ hour: 15, minute: 0 }),
  );
  const absenceApproveLockStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 2 }).set({ hour: 16, minute: 0 }),
  );
  const absenceDeclineLockStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 2 }).set({ hour: 17, minute: 0 }),
  );
  const absenceWithdrawPastStart = withUniqueSessionSeconds(
    nowLocal.minus({ minutes: 5 }).set({ second: 0, millisecond: 0 }),
  );
  const absenceAutoAssistWithdrawnStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 3 }).set({ hour: 9, minute: 45 }),
  );
  const absenceAutoAssistApprovedStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 3 }).set({ hour: 10, minute: 45 }),
  );
  const progressNoteStarts = progressSessionIds.map((_, index) =>
    withUniqueSessionSeconds(
      // Keep progress-note sessions far in the future so they do not disturb near-term scheduling tests.
      nowLocal.plus({ days: 120 + index }).set({
        hour: 8 + (index % 6),
        minute: (index * 5) % 60,
      }),
    ),
  );
  const progressInternalOnlyStart = withUniqueSessionSeconds(
    nowLocal.plus({ days: 119 }).set({ hour: 7, minute: 45 }),
  );

  await withTransaction(prisma, async (tx) => {
    const center = await tx.center.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: centerName } },
      update: { timezone, isActive: true },
      create: {
        tenantId: tenant.id,
        name: centerName,
        timezone,
        isActive: true,
      },
    });

    const tutorUser = await tx.user.upsert({
      where: { email: tutorEmail },
      update: { name: tutorName, passwordHash: accessCodeHash },
      create: {
        email: tutorEmail,
        name: tutorName,
        passwordHash: accessCodeHash,
      },
      select: { id: true },
    });

    const tutorBUser = await tx.user.upsert({
      where: { email: tutorBEmail },
      update: { name: tutorBName, passwordHash: accessCodeHash },
      create: {
        email: tutorBEmail,
        name: tutorBName,
        passwordHash: accessCodeHash,
      },
      select: { id: true },
    });

    // Ensure a staff admin exists for E2E login flows against the e2e tenant.
    const adminPasswordHash = await resolvePasswordHash(
      tx,
      adminEmail,
      adminPassword,
    );
    const adminUser = await tx.user.upsert({
      where: { email: adminEmail },
      update: { name: adminName, passwordHash: adminPasswordHash },
      create: {
        email: adminEmail,
        name: adminName,
        passwordHash: adminPasswordHash,
      },
      select: { id: true },
    });

    // Seed the tutor login account used by shared RBAC tests.
    const tutorLoginPasswordHash = await resolvePasswordHash(
      tx,
      tutorLoginEmail,
      tutorLoginPassword,
    );
    const tutorLoginUser = await tx.user.upsert({
      where: { email: tutorLoginEmail },
      update: { name: tutorName, passwordHash: tutorLoginPasswordHash },
      create: {
        email: tutorLoginEmail,
        name: tutorName,
        passwordHash: tutorLoginPasswordHash,
      },
      select: { id: true },
    });

    // Seed a user with the Parent role for RBAC coverage of staff endpoints.
    const parentRolePasswordHash = await resolvePasswordHash(
      tx,
      parentRoleEmail,
      parentRolePassword,
    );
    const parentRoleUser = await tx.user.upsert({
      where: { email: parentRoleEmail },
      update: { name: parentA1Name.firstName, passwordHash: parentRolePasswordHash },
      create: {
        email: parentRoleEmail,
        name: parentA1Name.firstName,
        passwordHash: parentRolePasswordHash,
      },
      select: { id: true },
    });

    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: tutorUser.id },
      },
      update: { role: "Tutor" },
      create: {
        tenantId: tenant.id,
        userId: tutorUser.id,
        role: "Tutor",
      },
    });

    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: adminUser.id },
      },
      update: { role: "Owner" },
      create: {
        tenantId: tenant.id,
        userId: adminUser.id,
        role: "Owner",
      },
    });

    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: tutorLoginUser.id },
      },
      update: { role: "Tutor" },
      create: {
        tenantId: tenant.id,
        userId: tutorLoginUser.id,
        role: "Tutor",
      },
    });

    await tx.staffCenter.upsert({
      where: {
        tenantId_userId_centerId: {
          tenantId: tenant.id,
          userId: tutorLoginUser.id,
          centerId: center.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: tutorLoginUser.id,
        centerId: center.id,
      },
    });

    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: parentRoleUser.id },
      },
      update: { role: "Parent" },
      create: {
        tenantId: tenant.id,
        userId: parentRoleUser.id,
        role: "Parent",
      },
    });

    await tx.staffCenter.upsert({
      where: {
        tenantId_userId_centerId: {
          tenantId: tenant.id,
          userId: adminUser.id,
          centerId: center.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: adminUser.id,
        centerId: center.id,
      },
    });

    await tx.staffCenter.upsert({
      where: {
        tenantId_userId_centerId: {
          tenantId: tenant.id,
          userId: tutorUser.id,
          centerId: center.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: tutorUser.id,
        centerId: center.id,
      },
    });

    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: tutorBUser.id },
      },
      update: { role: "Tutor" },
      create: {
        tenantId: tenant.id,
        userId: tutorBUser.id,
        role: "Tutor",
      },
    });

    await tx.staffCenter.upsert({
      where: {
        tenantId_userId_centerId: {
          tenantId: tenant.id,
          userId: tutorBUser.id,
          centerId: center.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: tutorBUser.id,
        centerId: center.id,
      },
    });

    const parentA0 = await tx.parent.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: parentA0Email } },
      update: {
        firstName: parentA0Name.firstName,
        lastName: parentA0Name.lastName,
        // Reset welcome flag so onboarding tests start from a known state.
        hasSeenWelcome: false,
      },
      create: {
        tenantId: tenant.id,
        firstName: parentA0Name.firstName,
        lastName: parentA0Name.lastName,
        email: parentA0Email,
        // Welcome flag defaults to false; set explicitly for clarity in fixtures.
        hasSeenWelcome: false,
      },
      select: { id: true },
    });

    const parentA1 = await tx.parent.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: parentA1Email } },
      update: {
        firstName: parentA1Name.firstName,
        lastName: parentA1Name.lastName,
        // Reset welcome flag so onboarding tests start from a known state.
        hasSeenWelcome: false,
      },
      create: {
        tenantId: tenant.id,
        firstName: parentA1Name.firstName,
        lastName: parentA1Name.lastName,
        email: parentA1Email,
        // Welcome flag defaults to false; set explicitly for clarity in fixtures.
        hasSeenWelcome: false,
      },
      select: { id: true },
    });

    const missingEmailParent = await tx.parent.upsert({
      where: {
        tenantId_email: { tenantId: tenant.id, email: missingEmailParentEmail },
      },
      update: {
        firstName: missingEmailParentName.firstName,
        lastName: missingEmailParentName.lastName,
        hasSeenWelcome: false,
      },
      create: {
        tenantId: tenant.id,
        firstName: missingEmailParentName.firstName,
        lastName: missingEmailParentName.lastName,
        email: missingEmailParentEmail,
        hasSeenWelcome: false,
      },
      select: { id: true },
    });

    const student = await tx.student.upsert({
      where: { id: studentId },
      update: {
        tenantId: tenant.id,
        firstName: studentName.firstName,
        lastName: studentName.lastName,
        // Use literal enum values to avoid runtime Prisma imports in ESM tests.
        status: "ACTIVE",
      },
      create: {
        id: studentId,
        tenantId: tenant.id,
        firstName: studentName.firstName,
        lastName: studentName.lastName,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const unlinkedStudent = await tx.student.upsert({
      where: { id: unlinkedStudentId },
      update: {
        tenantId: tenant.id,
        firstName: unlinkedStudentName.firstName,
        lastName: unlinkedStudentName.lastName,
        status: "ACTIVE",
      },
      create: {
        id: unlinkedStudentId,
        tenantId: tenant.id,
        firstName: unlinkedStudentName.firstName,
        lastName: unlinkedStudentName.lastName,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const missingEmailStudent = await tx.student.upsert({
      where: { id: missingEmailStudentId },
      update: {
        tenantId: tenant.id,
        firstName: missingEmailStudentName.firstName,
        lastName: missingEmailStudentName.lastName,
        status: "ACTIVE",
      },
      create: {
        id: missingEmailStudentId,
        tenantId: tenant.id,
        firstName: missingEmailStudentName.firstName,
        lastName: missingEmailStudentName.lastName,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const parentA0Student = await tx.student.upsert({
      where: { id: parentA0StudentId },
      update: {
        tenantId: tenant.id,
        firstName: parentA0StudentName.firstName,
        lastName: parentA0StudentName.lastName,
        status: "ACTIVE",
      },
      create: {
        id: parentA0StudentId,
        tenantId: tenant.id,
        firstName: parentA0StudentName.firstName,
        lastName: parentA0StudentName.lastName,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const progressEmptyStudent = await tx.student.upsert({
      where: { id: progressEmptyStudentId },
      update: {
        tenantId: tenant.id,
        firstName: progressEmptyStudentName.firstName,
        lastName: progressEmptyStudentName.lastName,
        status: "ACTIVE",
      },
      create: {
        id: progressEmptyStudentId,
        tenantId: tenant.id,
        firstName: progressEmptyStudentName.firstName,
        lastName: progressEmptyStudentName.lastName,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (secondaryTenant) {
      // Seed a deterministic cross-tenant student so portal RBAC tests can probe with a real foreign ID.
      const crossTenantStudent = await tx.student.upsert({
        where: { id: crossTenantStudentId },
        update: {
          tenantId: secondaryTenant.id,
          firstName: crossTenantStudentName.firstName,
          lastName: crossTenantStudentName.lastName,
          status: "ACTIVE",
        },
        create: {
          id: crossTenantStudentId,
          tenantId: secondaryTenant.id,
          firstName: crossTenantStudentName.firstName,
          lastName: crossTenantStudentName.lastName,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      // Step 22.4 cross-tenant deny tests require a real foreign session id.
      const secondaryCenter = await tx.center.upsert({
        where: {
          tenantId_name: {
            tenantId: secondaryTenant.id,
            name: secondaryCenterName,
          },
        },
        update: { timezone, isActive: true },
        create: {
          tenantId: secondaryTenant.id,
          name: secondaryCenterName,
          timezone,
          isActive: true,
        },
        select: { id: true },
      });

      const secondaryTutorPasswordHash = await resolvePasswordHash(
        tx,
        secondaryTutorEmail,
        normalizedParentAccessCode,
      );
      const secondaryTutor = await tx.user.upsert({
        where: { email: secondaryTutorEmail },
        update: {
          name: secondaryTutorName,
          passwordHash: secondaryTutorPasswordHash,
        },
        create: {
          email: secondaryTutorEmail,
          name: secondaryTutorName,
          passwordHash: secondaryTutorPasswordHash,
        },
        select: { id: true },
      });

      await tx.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId: secondaryTenant.id,
            userId: secondaryTutor.id,
          },
        },
        update: { role: "Tutor" },
        create: {
          tenantId: secondaryTenant.id,
          userId: secondaryTutor.id,
          role: "Tutor",
        },
      });

      await tx.staffCenter.upsert({
        where: {
          tenantId_userId_centerId: {
            tenantId: secondaryTenant.id,
            userId: secondaryTutor.id,
            centerId: secondaryCenter.id,
          },
        },
        update: {},
        create: {
          tenantId: secondaryTenant.id,
          userId: secondaryTutor.id,
          centerId: secondaryCenter.id,
        },
      });

      const step224CrossTenantSession = await tx.session.upsert({
        where: { id: step224CrossTenantSessionId },
        update: {
          tenantId: secondaryTenant.id,
          centerId: secondaryCenter.id,
          tutorId: secondaryTutor.id,
          sessionType: "ONE_ON_ONE",
          startAt: step224CrossTenantStart.toJSDate(),
          endAt: step224CrossTenantStart.plus({ hours: 1 }).toJSDate(),
          timezone,
        },
        create: {
          id: step224CrossTenantSessionId,
          tenantId: secondaryTenant.id,
          centerId: secondaryCenter.id,
          tutorId: secondaryTutor.id,
          sessionType: "ONE_ON_ONE",
          startAt: step224CrossTenantStart.toJSDate(),
          endAt: step224CrossTenantStart.plus({ hours: 1 }).toJSDate(),
          timezone,
        },
        select: { id: true },
      });

      await tx.sessionStudent.upsert({
        where: {
          tenantId_sessionId_studentId: {
            tenantId: secondaryTenant.id,
            sessionId: step224CrossTenantSession.id,
            studentId: crossTenantStudent.id,
          },
        },
        update: {},
        create: {
          tenantId: secondaryTenant.id,
          sessionId: step224CrossTenantSession.id,
          studentId: crossTenantStudent.id,
        },
      });
    }

    await tx.studentParent.upsert({
      where: {
        tenantId_studentId_parentId: {
          tenantId: tenant.id,
          studentId: student.id,
          parentId: parentA1.id,
        },
      },
      update: { relationship: "GUARDIAN" },
      create: {
        tenantId: tenant.id,
        studentId: student.id,
        parentId: parentA1.id,
        relationship: "GUARDIAN",
      },
    });

    await tx.studentParent.upsert({
      where: {
        tenantId_studentId_parentId: {
          tenantId: tenant.id,
          studentId: parentA0Student.id,
          parentId: parentA0.id,
        },
      },
      update: { relationship: "GUARDIAN" },
      create: {
        tenantId: tenant.id,
        studentId: parentA0Student.id,
        parentId: parentA0.id,
        relationship: "GUARDIAN",
      },
    });

    await tx.studentParent.upsert({
      where: {
        tenantId_studentId_parentId: {
          tenantId: tenant.id,
          studentId: progressEmptyStudent.id,
          parentId: parentA1.id,
        },
      },
      update: { relationship: "GUARDIAN" },
      create: {
        tenantId: tenant.id,
        studentId: progressEmptyStudent.id,
        parentId: parentA1.id,
        relationship: "GUARDIAN",
      },
    });

    await tx.studentParent.upsert({
      where: {
        tenantId_studentId_parentId: {
          tenantId: tenant.id,
          studentId: missingEmailStudent.id,
          parentId: missingEmailParent.id,
        },
      },
      update: { relationship: "GUARDIAN" },
      create: {
        tenantId: tenant.id,
        studentId: missingEmailStudent.id,
        parentId: missingEmailParent.id,
        relationship: "GUARDIAN",
      },
    });

    const upcomingSession = await tx.session.upsert({
      where: { id: upcomingSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: upcomingStart.toJSDate(),
        endAt: upcomingStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: upcomingSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: upcomingStart.toJSDate(),
        endAt: upcomingStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const pastSession = await tx.session.upsert({
      where: { id: pastSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: pastSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const tutorBSession = await tx.session.upsert({
      where: { id: tutorBSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorBUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: tutorBStart.toJSDate(),
        endAt: tutorBStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: tutorBSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorBUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: tutorBStart.toJSDate(),
        endAt: tutorBStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const unlinkedSession = await tx.session.upsert({
      where: { id: unlinkedSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorBUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: unlinkedStart.toJSDate(),
        endAt: unlinkedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: unlinkedSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorBUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: unlinkedStart.toJSDate(),
        endAt: unlinkedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    // Step 22.4 tutor sessions are assigned to the runtime tutor login account (E2E_TUTOR_EMAIL).
    const step224OtherTutorId =
      tutorBUser.id === tutorLoginUser.id ? tutorUser.id : tutorBUser.id;
    if (step224OtherTutorId === tutorLoginUser.id) {
      throw new Error(
        "Step 22.4 fixtures require two distinct tutor users (T1 and T2).",
      );
    }

    const step224TutorASession1 = await tx.session.upsert({
      where: { id: step224TutorASession1Id },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorLoginUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: step224TutorAFirstStart.toJSDate(),
        endAt: step224TutorAFirstStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: step224TutorASession1Id,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorLoginUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: step224TutorAFirstStart.toJSDate(),
        endAt: step224TutorAFirstStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const step224TutorASession2 = await tx.session.upsert({
      where: { id: step224TutorASession2Id },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorLoginUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: step224TutorASecondStart.toJSDate(),
        endAt: step224TutorASecondStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: step224TutorASession2Id,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorLoginUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: step224TutorASecondStart.toJSDate(),
        endAt: step224TutorASecondStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const step224TutorBSession = await tx.session.upsert({
      where: { id: step224TutorBSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: step224OtherTutorId,
        sessionType: "ONE_ON_ONE",
        startAt: step224TutorBOtherStart.toJSDate(),
        endAt: step224TutorBOtherStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: step224TutorBSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: step224OtherTutorId,
        sessionType: "ONE_ON_ONE",
        startAt: step224TutorBOtherStart.toJSDate(),
        endAt: step224TutorBOtherStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    // Absence-request sessions keep write-lite tests isolated from core fixtures.
    const absenceHappySession = await tx.session.upsert({
      where: { id: absenceHappySessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceHappyStart.toJSDate(),
        endAt: absenceHappyStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceHappySessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceHappyStart.toJSDate(),
        endAt: absenceHappyStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceDuplicateSession = await tx.session.upsert({
      where: { id: absenceDuplicateSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceDuplicateStart.toJSDate(),
        endAt: absenceDuplicateStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceDuplicateSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceDuplicateStart.toJSDate(),
        endAt: absenceDuplicateStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceResolveSession = await tx.session.upsert({
      where: { id: absenceResolveSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceResolveStart.toJSDate(),
        endAt: absenceResolveStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceResolveSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceResolveStart.toJSDate(),
        endAt: absenceResolveStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceResolvedSession = await tx.session.upsert({
      where: { id: absenceResolvedSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceResolvedStart.toJSDate(),
        endAt: absenceResolvedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceResolvedSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceResolvedStart.toJSDate(),
        endAt: absenceResolvedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    // Step 20.5 staff auto-assist sessions cover approved/pending/declined flows.
    const absenceStaffApprovedSession = await tx.session.upsert({
      where: { id: absenceStaffApprovedSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceStaffApprovedStart.toJSDate(),
        endAt: absenceStaffApprovedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceStaffApprovedSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceStaffApprovedStart.toJSDate(),
        endAt: absenceStaffApprovedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceStaffPendingSession = await tx.session.upsert({
      where: { id: absenceStaffPendingSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceStaffPendingStart.toJSDate(),
        endAt: absenceStaffPendingStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceStaffPendingSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceStaffPendingStart.toJSDate(),
        endAt: absenceStaffPendingStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceStaffDeclinedSession = await tx.session.upsert({
      where: { id: absenceStaffDeclinedSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceStaffDeclinedStart.toJSDate(),
        endAt: absenceStaffDeclinedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceStaffDeclinedSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceStaffDeclinedStart.toJSDate(),
        endAt: absenceStaffDeclinedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    // Step 20.6 sessions are dedicated to withdraw/resubmit and auto-assist hardening tests.
    const absenceWithdrawFutureSession = await tx.session.upsert({
      where: { id: absenceWithdrawFutureSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceWithdrawFutureStart.toJSDate(),
        endAt: absenceWithdrawFutureStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceWithdrawFutureSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceWithdrawFutureStart.toJSDate(),
        endAt: absenceWithdrawFutureStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceResubmitSession = await tx.session.upsert({
      where: { id: absenceResubmitSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceResubmitStart.toJSDate(),
        endAt: absenceResubmitStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceResubmitSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceResubmitStart.toJSDate(),
        endAt: absenceResubmitStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceApproveLockSession = await tx.session.upsert({
      where: { id: absenceApproveLockSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceApproveLockStart.toJSDate(),
        endAt: absenceApproveLockStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceApproveLockSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceApproveLockStart.toJSDate(),
        endAt: absenceApproveLockStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceDeclineLockSession = await tx.session.upsert({
      where: { id: absenceDeclineLockSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceDeclineLockStart.toJSDate(),
        endAt: absenceDeclineLockStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceDeclineLockSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceDeclineLockStart.toJSDate(),
        endAt: absenceDeclineLockStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceWithdrawPastSession = await tx.session.upsert({
      where: { id: absenceWithdrawPastSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceWithdrawPastStart.toJSDate(),
        endAt: absenceWithdrawPastStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceWithdrawPastSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceWithdrawPastStart.toJSDate(),
        endAt: absenceWithdrawPastStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceAutoAssistWithdrawnSession = await tx.session.upsert({
      where: { id: absenceAutoAssistWithdrawnSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceAutoAssistWithdrawnStart.toJSDate(),
        endAt: absenceAutoAssistWithdrawnStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceAutoAssistWithdrawnSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceAutoAssistWithdrawnStart.toJSDate(),
        endAt: absenceAutoAssistWithdrawnStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const absenceAutoAssistApprovedSession = await tx.session.upsert({
      where: { id: absenceAutoAssistApprovedSessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceAutoAssistApprovedStart.toJSDate(),
        endAt: absenceAutoAssistApprovedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: absenceAutoAssistApprovedSessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: absenceAutoAssistApprovedStart.toJSDate(),
        endAt: absenceAutoAssistApprovedStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    const progressNoteSessions = await Promise.all(
      progressSessionIds.map(async (sessionId, index) =>
        tx.session.upsert({
          where: { id: sessionId },
          update: {
            tenantId: tenant.id,
            centerId: center.id,
            tutorId: tutorUser.id,
            sessionType: "ONE_ON_ONE",
            startAt: progressNoteStarts[index].toJSDate(),
            endAt: progressNoteStarts[index].plus({ hours: 1 }).toJSDate(),
            timezone,
          },
          create: {
            id: sessionId,
            tenantId: tenant.id,
            centerId: center.id,
            tutorId: tutorUser.id,
            sessionType: "ONE_ON_ONE",
            startAt: progressNoteStarts[index].toJSDate(),
            endAt: progressNoteStarts[index].plus({ hours: 1 }).toJSDate(),
            timezone,
          },
          select: { id: true },
        }),
      ),
    );

    const progressInternalOnlySession = await tx.session.upsert({
      where: { id: progressInternalOnlySessionId },
      update: {
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: progressInternalOnlyStart.toJSDate(),
        endAt: progressInternalOnlyStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      create: {
        id: progressInternalOnlySessionId,
        tenantId: tenant.id,
        centerId: center.id,
        tutorId: tutorUser.id,
        sessionType: "ONE_ON_ONE",
        startAt: progressInternalOnlyStart.toJSDate(),
        endAt: progressInternalOnlyStart.plus({ hours: 1 }).toJSDate(),
        timezone,
      },
      select: { id: true },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: upcomingSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: upcomingSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorASession1.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorASession1.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorASession1.id,
          studentId: unlinkedStudent.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorASession1.id,
        studentId: unlinkedStudent.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorASession2.id,
          studentId: missingEmailStudent.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorASession2.id,
        studentId: missingEmailStudent.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorBSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorBSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: pastSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: pastSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: tutorBSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: tutorBSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceHappySession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceHappySession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceDuplicateSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceDuplicateSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceResolveSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceResolveSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceResolvedSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceResolvedSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceStaffApprovedSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceStaffApprovedSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceStaffPendingSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceStaffPendingSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceStaffDeclinedSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceStaffDeclinedSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceWithdrawFutureSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceWithdrawFutureSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceResubmitSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceResubmitSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceApproveLockSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceApproveLockSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceDeclineLockSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceDeclineLockSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceWithdrawPastSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceWithdrawPastSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceAutoAssistWithdrawnSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceAutoAssistWithdrawnSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: absenceAutoAssistApprovedSession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: absenceAutoAssistApprovedSession.id,
        studentId: student.id,
      },
    });

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: unlinkedSession.id,
          studentId: unlinkedStudent.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: unlinkedSession.id,
        studentId: unlinkedStudent.id,
      },
    });

    for (const progressSession of progressNoteSessions) {
      await tx.sessionStudent.upsert({
        where: {
          tenantId_sessionId_studentId: {
            tenantId: tenant.id,
            sessionId: progressSession.id,
            studentId: student.id,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          sessionId: progressSession.id,
          studentId: student.id,
        },
      });
    }

    await tx.sessionStudent.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: progressInternalOnlySession.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        sessionId: progressInternalOnlySession.id,
        studentId: student.id,
      },
    });

    // Clear parent requests tied to absence sessions so tests start from a clean slate.
    await tx.parentRequest.deleteMany({
      where: {
        tenantId: tenant.id,
        sessionId: {
          in: [
            absenceHappySession.id,
            absenceDuplicateSession.id,
            absenceResolveSession.id,
            absenceResolvedSession.id,
            absenceStaffApprovedSession.id,
            absenceStaffPendingSession.id,
            absenceStaffDeclinedSession.id,
            absenceWithdrawFutureSession.id,
            absenceResubmitSession.id,
            absenceApproveLockSession.id,
            absenceDeclineLockSession.id,
            absenceWithdrawPastSession.id,
            absenceAutoAssistWithdrawnSession.id,
            absenceAutoAssistApprovedSession.id,
          ],
        },
      },
    });

    // Seed a pending request on a started session to validate withdraw restriction logic.
    await tx.parentRequest.upsert({
      where: {
        tenantId_studentId_sessionId_type: {
          tenantId: tenant.id,
          studentId: student.id,
          sessionId: absenceWithdrawPastSession.id,
          type: "ABSENCE",
        },
      },
      update: {
        parentId: parentA1.id,
        status: "PENDING",
        reasonCode: "OTHER",
        message: "Request created before session start.",
        withdrawnAt: null,
        withdrawnByParentId: null,
        resubmittedAt: null,
        resolvedAt: null,
        resolvedByUserId: null,
      },
      create: {
        tenantId: tenant.id,
        parentId: parentA1.id,
        studentId: student.id,
        sessionId: absenceWithdrawPastSession.id,
        type: "ABSENCE",
        status: "PENDING",
        reasonCode: "OTHER",
        message: "Request created before session start.",
      },
    });

    await tx.attendance.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: pastSession.id,
          studentId: student.id,
        },
      },
      update: {
        status: "PRESENT",
        markedByUserId: tutorUser.id,
        markedAt: now,
      },
      create: {
        tenantId: tenant.id,
        sessionId: pastSession.id,
        studentId: student.id,
        status: "PRESENT",
        markedByUserId: tutorUser.id,
        markedAt: now,
      },
    });

    // Step 22.4 preloads tutor-session attendance rows (including one internal-note sentinel).
    await tx.attendance.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorASession1.id,
          studentId: student.id,
        },
      },
      update: {
        status: "PRESENT",
        note: STEP224_INTERNAL_ONLY_SENTINEL,
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_1",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: tutorLoginUser.id,
        markedAt: now,
      },
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorASession1.id,
        studentId: student.id,
        status: "PRESENT",
        note: STEP224_INTERNAL_ONLY_SENTINEL,
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_1",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: tutorLoginUser.id,
        markedAt: now,
      },
    });

    await tx.attendance.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorASession1.id,
          studentId: unlinkedStudent.id,
        },
      },
      update: {
        status: "LATE",
        note: "STEP224_INTERNAL_NOTE_2",
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_2",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: tutorLoginUser.id,
        markedAt: now,
      },
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorASession1.id,
        studentId: unlinkedStudent.id,
        status: "LATE",
        note: "STEP224_INTERNAL_NOTE_2",
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_2",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: tutorLoginUser.id,
        markedAt: now,
      },
    });

    await tx.attendance.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorASession2.id,
          studentId: missingEmailStudent.id,
        },
      },
      update: {
        status: "ABSENT",
        note: "STEP224_INTERNAL_NOTE_3",
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_3",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: tutorLoginUser.id,
        markedAt: now,
      },
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorASession2.id,
        studentId: missingEmailStudent.id,
        status: "ABSENT",
        note: "STEP224_INTERNAL_NOTE_3",
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_3",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: tutorLoginUser.id,
        markedAt: now,
      },
    });

    await tx.attendance.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: step224TutorBSession.id,
          studentId: student.id,
        },
      },
      update: {
        status: "PRESENT",
        note: "STEP224_INTERNAL_NOTE_OTHER_TUTOR",
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_OTHER_TUTOR",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: step224OtherTutorId,
        markedAt: now,
      },
      create: {
        tenantId: tenant.id,
        sessionId: step224TutorBSession.id,
        studentId: student.id,
        status: "PRESENT",
        note: "STEP224_INTERNAL_NOTE_OTHER_TUTOR",
        parentVisibleNote: "STEP224_PARENT_VISIBLE_NOTE_OTHER_TUTOR",
        parentVisibleNoteUpdatedAt: now,
        markedByUserId: step224OtherTutorId,
        markedAt: now,
      },
    });

    for (let index = 0; index < progressNoteSessions.length; index += 1) {
      const progressSession = progressNoteSessions[index];
      await tx.attendance.upsert({
        where: {
          tenantId_sessionId_studentId: {
            tenantId: tenant.id,
            sessionId: progressSession.id,
            studentId: student.id,
          },
        },
        update: {
          status: "PRESENT",
          // Keep a staff-only note populated to assert API responses never leak internal fields.
          note: `STEP223_INTERNAL_NOTE_${String(index + 1).padStart(2, "0")}`,
          parentVisibleNote: buildStep223ParentVisibleNote(index + 1),
          parentVisibleNoteUpdatedAt: now,
          markedByUserId: tutorUser.id,
          markedAt: now,
        },
        create: {
          tenantId: tenant.id,
          sessionId: progressSession.id,
          studentId: student.id,
          status: "PRESENT",
          note: `STEP223_INTERNAL_NOTE_${String(index + 1).padStart(2, "0")}`,
          parentVisibleNote: buildStep223ParentVisibleNote(index + 1),
          parentVisibleNoteUpdatedAt: now,
          markedByUserId: tutorUser.id,
          markedAt: now,
        },
      });
    }

    await tx.attendance.upsert({
      where: {
        tenantId_sessionId_studentId: {
          tenantId: tenant.id,
          sessionId: progressInternalOnlySession.id,
          studentId: student.id,
        },
      },
      update: {
        status: "PRESENT",
        note: STEP223_INTERNAL_ONLY_SENTINEL,
        // Explicit null parent-visible note drives "no leak" assertions in Step 22.3 tests.
        parentVisibleNote: null,
        parentVisibleNoteUpdatedAt: null,
        markedByUserId: tutorUser.id,
        markedAt: now,
      },
      create: {
        tenantId: tenant.id,
        sessionId: progressInternalOnlySession.id,
        studentId: student.id,
        status: "PRESENT",
        note: STEP223_INTERNAL_ONLY_SENTINEL,
        parentVisibleNote: null,
        parentVisibleNoteUpdatedAt: null,
        markedByUserId: tutorUser.id,
        markedAt: now,
      },
    });

    await seedStep226AuditEvents({
      tx,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      runId,
      adminUserId: adminUser.id,
      tutorUserId: tutorLoginUser.id,
    });

    // ParentA0 is intentionally left without linked students for empty-state tests.
    void parentA0;
    // Tutor B and unlinked student/session support access-control coverage.
    void tutorBUser;
  });

  return {
    tenantSlug: tenant.slug,
    step226AuditMarker: STEP226_AUDIT_MARKER,
    step226AuditMarkerEntityId: buildStep226MarkerEntityId(tenant.slug, runId),
    step226InternalOnlySentinel: STEP226_INTERNAL_ONLY_SENTINEL,
    step226SeededAuditEventCount: STEP226_AUDIT_EVENT_COUNT,
    parentA0Email,
    parentA1Email,
    accessCode: normalizedParentAccessCode,
    tutorAEmail: tutorEmail,
    tutorLoginEmail,
    tutorBEmail,
    studentId,
    unlinkedStudentId,
    missingEmailStudentId,
    progressEmptyStudentId,
    progressSessionIds,
    progressInternalOnlySessionId,
    crossTenantStudentId,
    upcomingSessionId,
    pastSessionId,
    tutorBSessionId,
    step224TutorASession1Id,
    step224TutorASession2Id,
    step224TutorBSessionId,
    step224CrossTenantSessionId,
    unlinkedSessionId,
    absenceHappySessionId,
    absenceDuplicateSessionId,
    absenceResolveSessionId,
    absenceResolvedSessionId,
    absenceStaffApprovedSessionId,
    absenceStaffPendingSessionId,
    absenceStaffDeclinedSessionId,
  };
}

export async function cleanupE2ETenantData(prisma: DbClient) {
  const tenantSlug = resolveE2ETenantSlug();
  assertSafeCleanup(tenantSlug);

  const tenant = await getE2ETenant(prisma);

  await withTransaction(prisma, async (tx) => {
    // Audit rows are tenant-scoped fixtures and should be reset between runs for deterministic paging.
    await tx.auditEvent.deleteMany({ where: { tenantId: tenant.id } });
    // Parent requests must be cleared before sessions/students to satisfy FK constraints.
    await tx.parentRequest.deleteMany({ where: { tenantId: tenant.id } });
    await tx.sessionNote.deleteMany({ where: { tenantId: tenant.id } });
    await tx.attendance.deleteMany({ where: { tenantId: tenant.id } });
    await tx.sessionStudent.deleteMany({ where: { tenantId: tenant.id } });
    await tx.session.deleteMany({ where: { tenantId: tenant.id } });
    await tx.groupTutor.deleteMany({ where: { tenantId: tenant.id } });
    await tx.groupStudent.deleteMany({ where: { tenantId: tenant.id } });
    await tx.staffCenter.deleteMany({ where: { tenantId: tenant.id } });
    await tx.studentParent.deleteMany({ where: { tenantId: tenant.id } });
    await tx.parent.deleteMany({ where: { tenantId: tenant.id } });
    await tx.student.deleteMany({ where: { tenantId: tenant.id } });
    await tx.group.deleteMany({ where: { tenantId: tenant.id } });
    await tx.program.deleteMany({ where: { tenantId: tenant.id } });
    await tx.level.deleteMany({ where: { tenantId: tenant.id } });
    await tx.subject.deleteMany({ where: { tenantId: tenant.id } });
    await tx.center.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tenantMembership.deleteMany({ where: { tenantId: tenant.id } });
  });
}
