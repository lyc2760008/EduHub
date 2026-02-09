// Attendance E2E helpers keep roster lookups and tenant-safe API paths consistent.
import { expect, type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { buildTenantApiPath } from "./tenant";
import { uniqueString } from "./data";

export type UserSummary = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  centers: Array<{ id: string; name: string }>;
};

type CenterSummary = {
  id: string;
  name: string;
  timezone: string;
};

type ProgramSummary = {
  id: string;
  name: string;
};

type StudentSummary = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

export type SessionListItem = {
  id: string;
  tutorId: string;
  sessionType: string;
  startAt: string;
  endAt: string;
  timezone: string;
};

export type AttendanceRosterItem = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  };
  attendance: {
    status: string;
    note: string | null;
    markedAt: string;
    markedByUserId: string;
  } | null;
};

export type AttendancePayload = {
  roster: AttendanceRosterItem[];
};

function isTransientNetworkError(error: unknown) {
  // Treat connection resets as transient so attendance helpers can retry once.
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|socket hang up|ECONNREFUSED/i.test(error.message);
}

async function getWithRetry(
  page: Page,
  url: string,
  attempts = 2,
) {
  // Retry a single time on transient network errors seen during E2E runs.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await page.request.get(url);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

async function fetchCenters(page: Page, tenantSlug: string) {
  const response = await getWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/centers?includeInactive=true"),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as CenterSummary[];
}

async function fetchPrograms(page: Page, tenantSlug: string) {
  const response = await getWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/programs"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as unknown;
  // /api/programs follows the Step 21.3 admin table contract (rows/totalCount/...), but some tests
  // still treat it as a simple array. Normalize the response to keep E2E helpers stable.
  if (Array.isArray(payload)) return payload as ProgramSummary[];
  if (payload && typeof payload === "object") {
    const rows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as ProgramSummary[];
    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) return items as ProgramSummary[];
  }
  throw new Error("Unexpected /api/programs response shape for attendance E2E.");
}

async function createProgram(page: Page, tenantSlug: string) {
  const response = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/programs"),
    { data: { name: uniqueString("e2e-program") } },
  );
  expect(response.status()).toBe(201);
  return (await response.json()) as ProgramSummary;
}

async function fetchStudents(page: Page, tenantSlug: string) {
  const response = await getWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/students?pageSize=50"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { students: StudentSummary[] };
  return payload.students;
}

async function createStudent(page: Page, tenantSlug: string) {
  const response = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/students"),
    {
      data: {
        firstName: uniqueString("E2E"),
        lastName: "Student",
      },
    },
  );
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as { student: StudentSummary };
  return payload.student;
}

async function createGroup(
  page: Page,
  tenantSlug: string,
  input: {
    centerId: string;
    programId: string;
    tutorId: string;
    studentIds: string[];
  },
) {
  const response = await page.request.post(
    buildTenantApiPath(tenantSlug, "/api/groups"),
    {
      data: {
        name: uniqueString("e2e-group"),
        type: "GROUP",
        centerId: input.centerId,
        programId: input.programId,
        tutorIds: [input.tutorId],
        studentIds: input.studentIds,
      },
    },
  );
  expect(response.status()).toBe(201);
  return (await response.json()) as { group: { id: string } };
}

async function createSession(
  page: Page,
  tenantSlug: string,
  input: {
    centerId: string;
    tutorId: string;
    groupId: string;
    timezone: string;
  },
) {
  // Retry with varying start times to avoid unique constraint conflicts.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const startAt = DateTime.now()
      .setZone(input.timezone)
      .plus({ days: 2 + attempt })
      .set({ hour: 9 + attempt, minute: (attempt * 7) % 55, second: 0, millisecond: 0 });
    const endAt = startAt.plus({ hours: 1 });

    const response = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions"),
      {
        data: {
          centerId: input.centerId,
          tutorId: input.tutorId,
          sessionType: "GROUP",
          groupId: input.groupId,
          startAt: startAt.toISO(),
          endAt: endAt.toISO(),
          timezone: input.timezone,
        },
      },
    );

    if (response.status() === 201) {
      return (await response.json()) as {
        session: {
          id: string;
          startAt: string;
          endAt: string;
          timezone: string;
        };
      };
    }

    if (response.status() !== 409) {
      expect(response.status()).toBe(201);
    }
  }

  throw new Error("Unable to create a unique session after retries.");
}

export async function fetchUsers(page: Page, tenantSlug: string) {
  const response = await getWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/users"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as unknown;
  // /api/users follows the Step 21.3 admin table contract (rows/totalCount/...).
  if (Array.isArray(payload)) return payload as UserSummary[];
  if (payload && typeof payload === "object") {
    const rows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as UserSummary[];
    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) return items as UserSummary[];
  }
  throw new Error("Unexpected /api/users response shape for attendance E2E.");
}

export async function fetchSessions(page: Page, tenantSlug: string) {
  const response = await getWithRetry(
    page,
    buildTenantApiPath(tenantSlug, "/api/sessions"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { sessions: SessionListItem[] };
  return payload.sessions;
}

export async function fetchAttendance(
  page: Page,
  tenantSlug: string,
  sessionId: string,
) {
  const response = await getWithRetry(
    page,
    buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}/attendance`),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as AttendancePayload;
}

export async function findSessionForTutor(
  page: Page,
  tenantSlug: string,
  tutorId: string,
  minimumRosterSize = 2,
) {
  const sessions = await fetchSessions(page, tenantSlug);
  const tutorSessions = sessions.filter((session) => session.tutorId === tutorId);

  for (const session of tutorSessions) {
    const attendance = await fetchAttendance(page, tenantSlug, session.id);
    if (attendance.roster.length >= minimumRosterSize) {
      return { session, attendance };
    }
  }

  throw new Error(
    `No upcoming sessions found for tutor ${tutorId} with roster >= ${minimumRosterSize}. ` +
      "Create a future group/class session with multiple students before running attendance E2E.",
  );
}

export async function ensureSessionForTutorWithRoster(
  page: Page,
  tenantSlug: string,
  tutor: UserSummary,
  minimumRosterSize = 2,
) {
  try {
    return await findSessionForTutor(page, tenantSlug, tutor.id, minimumRosterSize);
  } catch {
    // Fall back to creating the minimal data needed for a rostered session.
  }

  if (!tutor.centers.length) {
    throw new Error(
      `Tutor ${tutor.email} has no center assignment. Assign them to a center for attendance E2E.`,
    );
  }

  const centers = await fetchCenters(page, tenantSlug);
  const centerId = tutor.centers[0]?.id;
  const center = centers.find((item) => item.id === centerId);
  if (!center) {
    throw new Error("Tutor center assignment not found in centers list.");
  }

  let programs = await fetchPrograms(page, tenantSlug);
  if (!programs.length) {
    const created = await createProgram(page, tenantSlug);
    programs = [created];
  }

  let students = await fetchStudents(page, tenantSlug);
  while (students.length < minimumRosterSize) {
    const created = await createStudent(page, tenantSlug);
    students = [created, ...students];
  }

  const selectedStudentIds = students.slice(0, minimumRosterSize).map((s) => s.id);
  const createdGroup = await createGroup(page, tenantSlug, {
    centerId: center.id,
    programId: programs[0].id,
    tutorId: tutor.id,
    studentIds: selectedStudentIds,
  });

  const createdSession = await createSession(page, tenantSlug, {
    centerId: center.id,
    tutorId: tutor.id,
    groupId: createdGroup.group.id,
    timezone: center.timezone || "America/Edmonton",
  });

  const attendance = await fetchAttendance(
    page,
    tenantSlug,
    createdSession.session.id,
  );
  return {
    session: {
      id: createdSession.session.id,
      tutorId: tutor.id,
      sessionType: "GROUP",
      startAt: createdSession.session.startAt,
      endAt: createdSession.session.endAt,
      timezone: createdSession.session.timezone,
    },
    attendance,
  };
}

export function buildOtherTenantApiUrl(
  tenantSlug: string,
  suffix: string,
) {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  // Path fallback keeps cookies attached to the current host for cross-tenant checks.
  return `/t/${tenantSlug}${normalizedSuffix}`;
}
