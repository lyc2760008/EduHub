// Helpers for parent portal Playwright tests (tenant routing + seeded parent credentials).
import { expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { loginAsAdmin } from "./auth";
import {
  createStudentAndLinkParent,
  loginAsParentWithAccessCode,
} from "./parent-auth";
import { resolveCenterAndTutor, uniqueString } from "./data";
import { buildTenantApiPath, buildTenantPath } from "./tenant";

type ParentAccessCredentials = {
  email: string;
  accessCode: string;
};

type PortalSeedData = {
  parent0: ParentAccessCredentials;
  parent1: ParentAccessCredentials;
  parent1StudentIds: string[];
  unlinkedStudentId: string;
};

type PortalSortingFixtures = {
  tenantSlug: string;
  parent: ParentAccessCredentials;
  studentId: string;
  upcomingSessions: Array<{ sessionId: string; startAt: string }>;
  pastSessions: Array<{ sessionId: string; startAt: string }>;
};

type ParentCreateResponse = {
  parent?: { id?: string; email?: string };
};

type StudentCreateResponse = {
  student?: { id?: string };
};

type SessionCreateResponse = {
  session?: { id?: string };
};

let portalSeedPromise: Promise<PortalSeedData> | null = null;
let portalSortingPromise: Promise<PortalSortingFixtures> | null = null;
// Incremental seed helps avoid session unique constraint collisions.
let portalSessionSeed = 0;

function isTransientNetworkError(error: unknown) {
  // Treat connection resets as transient so seed helpers can retry once.
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|socket hang up|ECONNREFUSED/i.test(error.message);
}

async function postWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page["request"]["post"]>[1],
  attempts = 2,
) {
  // Retry a single time on transient network errors seen during E2E seeding.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.request.post(url, options);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

export function resolvePortalTenantSlug() {
  // Default to the dedicated e2e tenant to avoid polluting demo data.
  return process.env.E2E_TENANT_SLUG || "e2e-testing";
}

export function buildPortalPath(tenantSlug: string, suffix = "") {
  const normalizedSuffix = suffix
    ? suffix.startsWith("/")
      ? suffix
      : `/${suffix}`
    : "";
  return buildTenantPath(tenantSlug, `/portal${normalizedSuffix}`);
}

export function buildPortalApiPath(tenantSlug: string, suffix = "") {
  const normalizedSuffix = suffix
    ? suffix.startsWith("/")
      ? suffix
      : `/${suffix}`
    : "";
  return buildTenantApiPath(tenantSlug, `/api/portal${normalizedSuffix}`);
}

async function createParentWithoutStudents(page: Page, tenantSlug: string) {
  // Legacy helper name: parents must now be linked to at least one student to authenticate
  // via magic links. We keep the "without students" naming to avoid churn in seed callers,
  // but we actually link the parent to a student that has no sessions.
  const uniqueToken = uniqueString("portal-parent0");
  const parentEmail = `e2e.parent0.${uniqueToken}@example.com`;
  const response = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/parents"),
    {
      data: {
        firstName: `E2E-${uniqueToken}`,
        lastName: "Parent0",
        email: parentEmail,
      },
    },
  );
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as ParentCreateResponse;
  const parentId = payload.parent?.id;
  if (!parentId) {
    throw new Error("Expected parent id in parent create response.");
  }

  // Create a student but intentionally do not create any sessions for it.
  const studentResponse = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/students"),
    {
      data: {
        firstName: `E2E-${uniqueToken}`,
        lastName: "Student0",
      },
    },
  );
  expect(studentResponse.status()).toBe(201);
  const studentPayload = (await studentResponse.json()) as StudentCreateResponse;
  const studentId = studentPayload.student?.id;
  if (!studentId) {
    throw new Error("Expected student id in student create response.");
  }

  const linkResponse = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, `/api/students/${studentId}/parents`),
    { data: { parentEmail } },
  );
  expect(linkResponse.status()).toBe(201);

  return { parentId, parentEmail };
}

async function createUnlinkedStudent(page: Page, tenantSlug: string) {
  // Keep unlinked student creation API-driven to avoid UI dependencies in RBAC tests.
  const uniqueToken = uniqueString("portal-unlinked-student");
  const response = await postWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/students"),
    {
      data: {
        firstName: `E2E-${uniqueToken}`,
        lastName: "Unlinked",
      },
    },
  );
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as StudentCreateResponse;
  const studentId = payload.student?.id;
  if (!studentId) {
    throw new Error("Expected student id in student create response.");
  }
  return studentId;
}

function buildSessionWindow(
  timezone: string,
  offsetDays: number,
  minuteSeed: number,
) {
  // Normalize session times to a predictable hour so report filters can target them.
  const randomSeed =
    minuteSeed + Math.floor(Math.random() * 10000) + Date.now() % 10000;
  const startAt = DateTime.now()
    .setZone(timezone)
    .plus({ days: offsetDays })
    .set({
      hour: 8 + (randomSeed % 10),
      minute: randomSeed % 60,
      // Seconds add extra entropy to avoid startAt collisions.
      second: (randomSeed * 7) % 60,
      millisecond: (randomSeed * 97) % 1000,
    });
  const endAt = startAt.plus({ hours: 1 });
  return { startAt: startAt.toISO(), endAt: endAt.toISO() };
}

async function createPortalSession(
  page: Page,
  tenantSlug: string,
  input: {
    centerId: string;
    tutorId: string;
    studentId: string;
    timezone: string;
    offsetDays: number;
  },
) {
  // One-off session creation ensures portal upcoming/attendance data exists.
  portalSessionSeed += 1;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { startAt, endAt } = buildSessionWindow(
      input.timezone,
      // Shift day offsets as well as minutes so retries escape unique constraints.
      input.offsetDays + attempt * 2,
      portalSessionSeed + attempt * 11,
    );
    if (!startAt || !endAt) {
      throw new Error("Unable to build session timestamps for portal E2E.");
    }

    const response = await postWithRetry(
      page,
      buildTenantApiPath(tenantSlug, "/api/sessions"),
      {
        data: {
          centerId: input.centerId,
          tutorId: input.tutorId,
          sessionType: "ONE_ON_ONE",
          studentId: input.studentId,
          startAt,
          endAt,
          timezone: input.timezone,
        },
      },
    );

    if (response.status() === 201) {
      const payload = (await response.json()) as SessionCreateResponse;
      const sessionId = payload.session?.id;
      if (!sessionId) {
        throw new Error("Expected session id in session create response.");
      }
      return { sessionId, startAt };
    }

    if (response.status() !== 409) {
      let details = "";
      try {
        details = JSON.stringify(await response.json());
      } catch {
        // Response body can be empty for non-JSON errors.
      }
      throw new Error(
        `Unexpected session create status ${response.status()} for portal seed. ${details}`,
      );
    }
  }

  throw new Error("Unable to create a portal session after retries.");
}

async function seedPortalData(
  page: Page,
  tenantSlug: string,
): Promise<PortalSeedData> {
  // Seed minimal portal fixtures using admin APIs when env-based fixtures are missing.
  await loginAsAdmin(page, tenantSlug);

  const parent0Record = await createParentWithoutStudents(page, tenantSlug);
  // Parent auth is magic-link based; access codes are deprecated and ignored by the login helper.
  const parent0AccessCode = "MAGIC_LINK";

  const { studentId, parentId, parentEmail } = await createStudentAndLinkParent(
    page,
    tenantSlug,
  );
  const parent1AccessCode = "MAGIC_LINK";

  const unlinkedStudentId = await createUnlinkedStudent(page, tenantSlug);
  const { tutor, center } = await resolveCenterAndTutor(page, tenantSlug);
  const timezone = center.timezone || "America/Edmonton";

  await createPortalSession(page, tenantSlug, {
    centerId: center.id,
    tutorId: tutor.id,
    studentId,
    timezone,
    offsetDays: 3,
  });

  const pastSession = await createPortalSession(page, tenantSlug, {
    centerId: center.id,
    tutorId: tutor.id,
    studentId,
    timezone,
    offsetDays: -7,
  });

  const attendanceResponse = await page.request.put(
    buildTenantApiPath(tenantSlug, `/api/sessions/${pastSession.sessionId}/attendance`),
    {
      data: {
        items: [{ studentId, status: "PRESENT" }],
      },
    },
  );
  expect(attendanceResponse.ok()).toBeTruthy();

  // Clear admin session cookies before returning to parent login flows.
  await page.context().clearCookies();

  return {
    parent0: { email: parent0Record.parentEmail, accessCode: parent0AccessCode },
    parent1: { email: parentEmail, accessCode: parent1AccessCode },
    parent1StudentIds: [studentId],
    unlinkedStudentId,
  };
}

async function ensurePortalSeedData(page: Page, tenantSlug: string) {
  // Cache seeded data per worker to avoid duplicate API setup in related tests.
  if (!portalSeedPromise) {
    portalSeedPromise = seedPortalData(page, tenantSlug);
  }
  return portalSeedPromise;
}

export async function resolveParent0Credentials(
  page: Page,
): Promise<ParentAccessCredentials> {
  const email = process.env.E2E_PARENT0_EMAIL;
  const accessCode = process.env.E2E_PARENT0_ACCESS_CODE;
  if (email && accessCode) {
    return { email, accessCode };
  }
  const seed = await ensurePortalSeedData(page, resolvePortalTenantSlug());
  return seed.parent0;
}

export async function resolveParent1Credentials(
  page: Page,
): Promise<ParentAccessCredentials> {
  const email = process.env.E2E_PARENT1_EMAIL;
  const accessCode = process.env.E2E_PARENT1_ACCESS_CODE;
  if (email && accessCode) {
    return { email, accessCode };
  }
  const seed = await ensurePortalSeedData(page, resolvePortalTenantSlug());
  return seed.parent1;
}

export async function resolveParent1StudentIds(page: Page) {
  const raw =
    process.env.E2E_PARENT1_STUDENT_IDS || process.env.E2E_PARENT1_STUDENT_ID;
  if (raw) {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const seed = await ensurePortalSeedData(page, resolvePortalTenantSlug());
  return seed.parent1StudentIds;
}

export async function resolveUnlinkedStudentId(page: Page) {
  const value = process.env.E2E_UNLINKED_STUDENT_ID;
  if (value) {
    return value.trim();
  }
  const seed = await ensurePortalSeedData(page, resolvePortalTenantSlug());
  return seed.unlinkedStudentId;
}

export async function loginParentWithAccessCode(
  page: Page,
  tenantSlug: string,
  credentials: ParentAccessCredentials,
) {
  // Wrapper keeps portal logins consistent across specs.
  await loginAsParentWithAccessCode(
    page,
    tenantSlug,
    credentials.email,
    credentials.accessCode,
  );
}

export async function ensurePortalSortingFixtures(page: Page) {
  // Create a minimal set of sessions/attendance for ordering smoke tests.
  if (!portalSortingPromise) {
    portalSortingPromise = (async () => {
      const tenantSlug = resolvePortalTenantSlug();
      if (tenantSlug !== "e2e-testing") {
        throw new Error(
          `Portal sorting fixtures must target the dedicated e2e tenant; got ${tenantSlug}.`,
        );
      }
      const seed = await ensurePortalSeedData(page, tenantSlug);
      const studentId = seed.parent1StudentIds[0];

      await loginAsAdmin(page, tenantSlug);
      const { tutor, center } = await resolveCenterAndTutor(page, tenantSlug);
      const timezone = center.timezone || "America/Edmonton";

      const upcomingSessions = await Promise.all([
        createPortalSession(page, tenantSlug, {
          centerId: center.id,
          tutorId: tutor.id,
          studentId,
          timezone,
          offsetDays: 2,
        }),
        createPortalSession(page, tenantSlug, {
          centerId: center.id,
          tutorId: tutor.id,
          studentId,
          timezone,
          offsetDays: 5,
        }),
      ]);

      const pastSessions = await Promise.all([
        createPortalSession(page, tenantSlug, {
          centerId: center.id,
          tutorId: tutor.id,
          studentId,
          timezone,
          offsetDays: -12,
        }),
        createPortalSession(page, tenantSlug, {
          centerId: center.id,
          tutorId: tutor.id,
          studentId,
          timezone,
          offsetDays: -4,
        }),
      ]);

      for (const past of pastSessions) {
        const attendanceResponse = await page.request.put(
          buildTenantApiPath(tenantSlug, `/api/sessions/${past.sessionId}/attendance`),
          { data: { items: [{ studentId, status: "PRESENT" }] } },
        );
        expect(attendanceResponse.ok()).toBeTruthy();
      }

      // Clear admin session cookies before returning to parent login flows.
      await page.context().clearCookies();

      return {
        tenantSlug,
        parent: seed.parent1,
        studentId,
        upcomingSessions,
        pastSessions,
      };
    })();
  }

  return portalSortingPromise;
}
