// Go-live helper utilities keep staging tests resilient without relying on pre-seeded fixtures.
import { type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { loginAsAdmin } from "./auth";
import { resolveCenterAndTutor, uniqueString } from "./data";
import {
  createStudentAndLinkParentForEmail,
  prepareParentAccessCode,
} from "./parent-auth";
import { buildTenantApiPath } from "./tenant";

export type GoLiveParentAccess = {
  email: string;
  accessCode: string;
  parentId?: string;
  studentId?: string;
};

type GoLiveAbsenceTarget = {
  sessionId: string;
  studentId: string;
};

async function createGoLiveSession(
  page: Page,
  tenantSlug: string,
  input: { studentId: string; tutorEmail?: string },
) {
  // Use API-level session creation to keep go-live smoke tests deterministic.
  const { tutor, center } = await resolveCenterAndTutor(
    page,
    tenantSlug,
    input.tutorEmail,
  );
  const timezone = center.timezone || "America/Edmonton";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const startAt = DateTime.now()
      .setZone(timezone)
      .plus({ days: 2 + attempt })
      .set({ hour: 10 + attempt, minute: (attempt * 11) % 50, second: 0, millisecond: 0 });
    const endAt = startAt.plus({ hours: 1 });

    const response = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions"),
      {
        data: {
          centerId: center.id,
          tutorId: tutor.id,
          sessionType: "ONE_ON_ONE",
          studentId: input.studentId,
          startAt: startAt.toISO(),
          endAt: endAt.toISO(),
          timezone,
        },
      },
    );

    if (response.status() === 201) {
      const payload = (await response.json()) as { session?: { id?: string } };
      const sessionId = payload.session?.id;
      if (!sessionId) {
        throw new Error("Expected session id after go-live session create.");
      }
      return sessionId;
    }

    if (response.status() !== 409) {
      throw new Error(
        `Unexpected session create status ${response.status()} for go-live.`,
      );
    }
  }

  throw new Error("Unable to create a unique go-live session after retries.");
}

export async function resolveGoLiveParentAccess(
  page: Page,
  tenantSlug: string,
) : Promise<GoLiveParentAccess> {
  // Prefer a dedicated portal-access email to avoid colliding with staff "Parent" logins.
  const explicitEmail =
    process.env.E2E_PARENT_ACCESS_EMAIL || process.env.E2E_PARENT_EMAIL;
  const explicitAccessCode = process.env.E2E_PARENT_ACCESS_CODE;

  if (
    process.env.E2E_PARENT_ACCESS_EMAIL &&
    explicitEmail &&
    explicitAccessCode
  ) {
    // Use the explicitly configured parent access-code credentials when provided.
    return { email: explicitEmail, accessCode: explicitAccessCode };
  }

  await loginAsAdmin(page, tenantSlug);

  // Fall back to creating a disposable parent + access code when env creds are incomplete.
  const seeded = await prepareParentAccessCode(page, tenantSlug);
  await page.context().clearCookies();
  return {
    email: seeded.parentEmail,
    accessCode: seeded.accessCode,
    parentId: seeded.parentId,
    studentId: seeded.studentId,
  };
}

export async function ensureGoLiveAbsenceTarget(
  page: Page,
  tenantSlug: string,
  parentAccess: GoLiveParentAccess,
): Promise<GoLiveAbsenceTarget> {
  const preferredSessionId = process.env.E2E_GO_LIVE_SESSION_ID;
  const preferredStudentId = process.env.E2E_GO_LIVE_STUDENT_ID;
  if (preferredSessionId && preferredStudentId) {
    return { sessionId: preferredSessionId, studentId: preferredStudentId };
  }

  // Ensure we have a parent-linked student to anchor the absence request.
  let studentId = parentAccess.studentId;
  if (!studentId) {
    await loginAsAdmin(page, tenantSlug);
    const created = await createStudentAndLinkParentForEmail(
      page,
      tenantSlug,
      parentAccess.email,
      { firstName: "GoLive", lastName: uniqueString("Student") },
    );
    studentId = created.studentId;
  }

  if (!studentId) {
    throw new Error("Unable to resolve a student id for go-live absence tests.");
  }

  await loginAsAdmin(page, tenantSlug);
  // Ensure the parent/student link exists so portal requests can be created.
  const linkResponse = await page.request.get(
    buildTenantApiPath(tenantSlug, `/api/students/${studentId}/parents`),
  );
  if (linkResponse.status() === 200) {
    const payload = (await linkResponse.json()) as {
      parents?: Array<{ parent?: { email?: string } }>;
    };
    const hasLink = payload.parents?.some(
      (entry) =>
        entry.parent?.email?.toLowerCase() ===
        parentAccess.email.toLowerCase(),
    );
    if (!hasLink) {
      const relink = await page.request.post(
        buildTenantApiPath(tenantSlug, `/api/students/${studentId}/parents`),
        { data: { parentEmail: parentAccess.email } },
      );
      if (relink.status() !== 201 && relink.status() !== 409) {
        throw new Error(
          `Unexpected parent relink status ${relink.status()} for go-live.`,
        );
      }
    }
  }

  await loginAsAdmin(page, tenantSlug);
  const sessionId = await createGoLiveSession(page, tenantSlug, {
    studentId,
    tutorEmail: process.env.E2E_TUTOR_EMAIL,
  });

  // Verify the created session is rostered with the target student to avoid portal empty states.
  const attendanceResponse = await page.request.get(
    buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}/attendance`),
  );
  if (attendanceResponse.status() !== 200) {
    throw new Error(
      `Unable to fetch attendance for go-live session (${attendanceResponse.status()}).`,
    );
  }
  const attendancePayload = (await attendanceResponse.json()) as {
    roster?: Array<{ student?: { id?: string } }>;
  };
  const hasRoster = attendancePayload.roster?.some(
    (entry) => entry.student?.id === studentId,
  );
  if (!hasRoster) {
    throw new Error("Go-live session roster does not include the target student.");
  }

  await page.context().clearCookies();
  return { sessionId, studentId };
}
