// E2E tenant fixture helpers ensure test data stays scoped to the e2e tenant.
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

import type { PrismaClient } from "../../../src/generated/prisma/client";

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

async function ensureE2ETenant(
  prisma: PrismaClient,
  slug: string,
  name?: string,
) {
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

async function resolvePasswordHash(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
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

export async function getE2ETenant(prisma: PrismaClient) {
  const tenantSlug = resolveE2ETenantSlug();
  return ensureE2ETenant(
    prisma,
    tenantSlug,
    process.env.E2E_TENANT_NAME || "E2E Testing",
  );
}

export async function upsertE2EFixtures(prisma: PrismaClient) {
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
  if (secondaryTenantSlug && secondaryTenantSlug !== tenant.slug) {
    // Ensure a second tenant exists for cross-tenant RBAC checks.
    await ensureE2ETenant(
      prisma,
      secondaryTenantSlug,
      process.env.E2E_SECOND_TENANT_NAME || "E2E Secondary",
    );
  }

  const studentId = `e2e-${tenant.slug}-${runId}-student-s1`;
  const unlinkedStudentId = `e2e-${tenant.slug}-${runId}-student-s2`;
  const upcomingSessionId = `e2e-${tenant.slug}-${runId}-session-upcoming`;
  const pastSessionId = `e2e-${tenant.slug}-${runId}-session-past`;
  const tutorBSessionId = `e2e-${tenant.slug}-${runId}-session-tutor-b`;
  const unlinkedSessionId = `e2e-${tenant.slug}-${runId}-session-unlinked`;
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
  const tutorName = "E2E Tutor";
  const tutorBName = "E2E Tutor B";
  const adminName = "E2E Admin";
  const parentA0Name = { firstName: "E2E Parent", lastName: "A0" };
  const parentA1Name = { firstName: "E2E Parent", lastName: "A1" };
  const studentName = { firstName: "E2E Student", lastName: "S1" };
  const unlinkedStudentName = { firstName: "E2E Student", lastName: "S2" };

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

  await prisma.$transaction(async (tx) => {
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
        accessCodeHash,
        accessCodeUpdatedAt: now,
        // Reset welcome flag so onboarding tests start from a known state.
        hasSeenWelcome: false,
      },
      create: {
        tenantId: tenant.id,
        firstName: parentA0Name.firstName,
        lastName: parentA0Name.lastName,
        email: parentA0Email,
        accessCodeHash,
        accessCodeUpdatedAt: now,
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
        accessCodeHash,
        accessCodeUpdatedAt: now,
        // Reset welcome flag so onboarding tests start from a known state.
        hasSeenWelcome: false,
      },
      create: {
        tenantId: tenant.id,
        firstName: parentA1Name.firstName,
        lastName: parentA1Name.lastName,
        email: parentA1Email,
        accessCodeHash,
        accessCodeUpdatedAt: now,
        // Welcome flag defaults to false; set explicitly for clarity in fixtures.
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

    // ParentA0 is intentionally left without linked students for empty-state tests.
    void parentA0;
    // Tutor B and unlinked student/session support access-control coverage.
    void tutorBUser;
  });

  return {
    tenantSlug: tenant.slug,
    parentA0Email,
    parentA1Email,
    accessCode: normalizedParentAccessCode,
    tutorAEmail: tutorEmail,
    tutorBEmail,
    studentId,
    unlinkedStudentId,
    upcomingSessionId,
    pastSessionId,
    tutorBSessionId,
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

export async function cleanupE2ETenantData(prisma: PrismaClient) {
  const tenantSlug = resolveE2ETenantSlug();
  assertSafeCleanup(tenantSlug);

  const tenant = await getE2ETenant(prisma);

  await prisma.$transaction(async (tx) => {
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
