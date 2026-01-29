// Deterministic E2E data helpers centralize per-run uniqueness and common UI flows.
import { expect, type Page, type TestInfo } from "@playwright/test";
import { DateTime } from "luxon";

import { buildTenantApiPath, buildTenantPath } from "./tenant";

export type CenterSummary = {
  id: string;
  name: string;
  timezone: string;
};

export type UserSummary = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  centers: Array<{ id: string; name: string }>;
};

export type CreatedStudent = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
};

export type CreatedGroup = {
  id: string;
  name: string;
  centerId: string;
  programId: string;
};

export type CreatedSession = {
  id: string;
  startLocal: string;
  endLocal: string;
};

const runId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const testSuffixCache = new Map<string, string>();
let counter = 0;

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableShortHash(value: string) {
  // Compact hash keeps identifiers short enough for validation constraints.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

// Per-test suffix ensures deterministic names within a test while staying unique per run.
export function createTestSuffix(testInfo: TestInfo, label = "e2e"): string {
  const key = `${testInfo.file}-${testInfo.title}-${label}`;
  const cached = testSuffixCache.get(key);
  if (cached) return cached;
  const safeLabel = normalizeToken(label).slice(0, 12) || "e2e";
  const seed = stableShortHash(testInfo.title || label);
  const suffix = `${safeLabel}-${seed}-${runId}-${testSuffixCache.size + 1}`;
  testSuffixCache.set(key, suffix);
  return suffix;
}

// Unique string helper keeps existing tests collision-free across runs.
export function uniqueString(prefix: string): string {
  counter += 1;
  return `${prefix}-${runId}-${counter}`;
}

// API fetch helpers avoid UI-only dependency when resolving required entities.
export async function fetchCenters(page: Page, tenantSlug: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, "/api/centers?includeInactive=true"),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as CenterSummary[];
}

export async function fetchUsers(page: Page, tenantSlug: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenantSlug, "/api/users"),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as UserSummary[];
}

// Resolve a tutor with a center assignment to keep session/group workflows stable.
export async function resolveCenterAndTutor(
  page: Page,
  tenantSlug: string,
  preferredTutorEmail?: string,
) {
  const [centers, users] = await Promise.all([
    fetchCenters(page, tenantSlug),
    fetchUsers(page, tenantSlug),
  ]);

  const tutors = users.filter(
    (user) => user.role === "Tutor" && user.centers.length,
  );
  const preferred = preferredTutorEmail
    ? tutors.find((tutor) => tutor.email === preferredTutorEmail)
    : undefined;
  const tutor = preferred ?? tutors[0];

  if (!tutor) {
    throw new Error("No tutor with center assignment available for E2E.");
  }

  const centerId = tutor.centers[0]?.id;
  const center = centers.find((item) => item.id === centerId) ?? centers[0];
  if (!center) {
    throw new Error("No center available for E2E session setup.");
  }

  return { tutor, center };
}

// Catalog helpers keep create flows readable and scoped to the tenant UI.
export async function createSubject(
  page: Page,
  tenantSlug: string,
  name: string,
) {
  await page.goto(buildTenantPath(tenantSlug, "/admin/subjects"));
  await expect(page.getByTestId("subjects-page")).toBeVisible();

  await page.getByTestId("create-subject-button").click();
  await page.getByTestId("subject-name-input").fill(name);

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/subjects") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("save-subject-button").click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();

  await expect(page.getByTestId("subjects-table")).toContainText(name);
  return { name };
}

export async function createLevel(
  page: Page,
  tenantSlug: string,
  name: string,
) {
  await page.goto(buildTenantPath(tenantSlug, "/admin/levels"));
  await expect(page.getByTestId("levels-page")).toBeVisible();

  await page.getByTestId("create-level-button").click();
  await page.getByTestId("level-name-input").fill(name);
  await page.getByTestId("level-sortorder-input").fill("10");

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/levels") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("save-level-button").click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();

  await expect(page.getByTestId("levels-table")).toContainText(name);
  return { name };
}

export async function createProgram(
  page: Page,
  tenantSlug: string,
  name: string,
  subjectName: string,
) {
  await page.goto(buildTenantPath(tenantSlug, "/admin/programs"));
  await expect(page.getByTestId("programs-page")).toBeVisible();

  await page.getByTestId("create-program-button").click();
  await page.getByTestId("program-name-input").fill(name);
  await expect(page.getByTestId("program-subject-select")).toContainText(
    subjectName,
  );
  await page
    .getByTestId("program-subject-select")
    .selectOption({ label: subjectName });

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/programs") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("save-program-button").click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();

  await expect(page.getByTestId("programs-table")).toContainText(name);
  return { name };
}

// Student helpers keep create + parent link flows deterministic.
export async function createStudent(
  page: Page,
  tenantSlug: string,
  input: { firstName: string; lastName: string; levelName?: string },
): Promise<CreatedStudent> {
  await page.goto(buildTenantPath(tenantSlug, "/admin/students"));
  await expect(page.getByTestId("students-page")).toBeVisible();

  await page.getByTestId("create-student-button").click();
  await page.getByTestId("student-first-name-input").fill(input.firstName);
  await page.getByTestId("student-last-name-input").fill(input.lastName);

  if (input.levelName) {
    await page
      .getByTestId("student-level-select")
      .selectOption({ label: input.levelName });
  }

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/students") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("save-student-button").click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();

  const fullName = `${input.firstName} ${input.lastName}`;
  await expect(page.getByTestId("students-table")).toContainText(fullName);

  const studentRow = page.locator('tr[data-testid^="students-row-"]', {
    hasText: fullName,
  });
  const rowTestId = await studentRow.getAttribute("data-testid");
  if (!rowTestId) {
    throw new Error("Expected a students row data-testid to be present.");
  }

  return {
    id: rowTestId.replace("students-row-", ""),
    firstName: input.firstName,
    lastName: input.lastName,
    fullName,
  };
}

export async function linkParent(
  page: Page,
  tenantSlug: string,
  studentId: string,
  parentEmail: string,
) {
  await page.goto(
    buildTenantPath(tenantSlug, `/admin/students/${studentId}?mode=edit`),
  );
  await expect(page.getByTestId("student-detail-page")).toBeVisible();

  await page.getByTestId("parent-link-email").fill(parentEmail);
  await page.getByTestId("parent-link-submit").click();

  await expect(page.getByTestId("parents-table")).toBeVisible();
  await expect(page.getByText(parentEmail)).toBeVisible();
}

// Group helpers keep rostered session prep consistent across E2E suites.
export async function createGroup(
  page: Page,
  tenantSlug: string,
  input: {
    name: string;
    programName: string;
    centerId?: string;
    levelName?: string;
    type?: "GROUP" | "CLASS";
  },
): Promise<CreatedGroup> {
  await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));
  await expect(page.getByTestId("groups-page")).toBeVisible();

  await page.getByTestId("create-group-button").click();
  await page.getByTestId("group-name-input").fill(input.name);

  if (input.type) {
    await page.getByTestId("group-type-select").selectOption(input.type);
  }

  const centerSelect = page.getByTestId("group-center-select");
  if (input.centerId) {
    await centerSelect.selectOption(input.centerId);
  } else {
    await centerSelect.selectOption({ index: 1 });
  }
  const centerId = await centerSelect.inputValue();

  const programSelect = page.getByTestId("group-program-select");
  await programSelect.selectOption({ label: input.programName });
  const programId = await programSelect.inputValue();

  if (input.levelName) {
    await page
      .getByTestId("group-level-select")
      .selectOption({ label: input.levelName });
  }

  await page.getByTestId("group-capacity-input").fill("12");
  await page.getByTestId("group-notes-input").fill("E2E notes");

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/groups") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("save-group-button").click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();

  await expect(page.getByTestId("groups-table")).toContainText(input.name);

  const row = page.getByTestId("groups-table").locator("tr", {
    hasText: input.name,
  });
  const rowTestId = await row.getAttribute("data-testid");
  if (!rowTestId) {
    throw new Error("Expected a group row data-testid to be present.");
  }

  return {
    id: rowTestId.replace("group-row-", ""),
    name: input.name,
    centerId,
    programId,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function assignTutorAndRoster(
  page: Page,
  tenantSlug: string,
  input: { groupId: string; tutorEmail: string; studentName: string },
) {
  await page.goto(
    buildTenantPath(tenantSlug, `/admin/groups/${input.groupId}`),
  );
  await expect(page.getByTestId("group-detail-page")).toBeVisible();

  // TODO(e2e): add data-testid hooks for tutor/student options to avoid label matching.
  const tutorLabel = page
    .getByTestId("assign-tutor-select")
    .getByLabel(new RegExp(escapeRegExp(input.tutorEmail), "i"));
  await tutorLabel.check();

  const tutorSavePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/groups/${input.groupId}/tutors`) &&
      response.request().method() === "PUT",
  );

  await page.getByTestId("save-group-tutors-button").click();
  const tutorSaveResponse = await tutorSavePromise;
  expect(tutorSaveResponse.ok()).toBeTruthy();
  await expect(tutorLabel).toBeChecked();

  await page.getByTestId("student-filter-input").fill(input.studentName);
  const studentLabel = page
    .getByTestId("add-student-select")
    .getByLabel(new RegExp(escapeRegExp(input.studentName), "i"));
  await studentLabel.check();

  const studentSavePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/groups/${input.groupId}/students`) &&
      response.request().method() === "PUT",
  );

  await page.getByTestId("save-group-students-button").click();
  const studentSaveResponse = await studentSavePromise;
  expect(studentSaveResponse.ok()).toBeTruthy();
  await expect(studentLabel).toBeChecked();
}

// Session helpers keep one-off + generator creation consistent for regression runs.
export async function createOneOffSession(
  page: Page,
  tenantSlug: string,
  input: { centerId: string; tutorId: string; studentId: string; minuteSeed: number },
): Promise<CreatedSession> {
  await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
  await expect(page.getByTestId("sessions-list-page")).toBeVisible();

  await page.getByTestId("sessions-filter-center").selectOption(input.centerId);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("sessions-filter-tutor").selectOption(input.tutorId);
  await page.waitForLoadState("networkidle");

  await page.getByTestId("sessions-create-button").click();

  const modalHeading = page.getByRole("heading", {
    name: /create one-off session/i,
  });
  const modal = modalHeading.locator("..").locator("..");

  // TODO(e2e): add session modal data-testid hooks to avoid label selectors.
  await modal.getByLabel(/center/i).selectOption(input.centerId);
  await modal.getByLabel(/tutor/i).selectOption(input.tutorId);
  await modal.getByLabel(/type/i).selectOption("ONE_ON_ONE");
  await modal
    .getByTestId("one-to-one-student-select")
    .selectOption(input.studentId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const startAt = DateTime.now()
      .plus({ days: 2 + attempt })
      .set({
        hour: 9 + attempt,
        minute: (input.minuteSeed + attempt * 7) % 55,
        second: 0,
        millisecond: 0,
      });
    const endAt = startAt.plus({ hours: 1 });
    const startLocal = startAt.toFormat("yyyy-LL-dd'T'HH:mm");
    const endLocal = endAt.toFormat("yyyy-LL-dd'T'HH:mm");

    await modal.getByTestId("sessions-one-off-start").fill(startLocal);
    await modal.getByTestId("sessions-one-off-end").fill(endLocal);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/sessions") &&
        response.request().method() === "POST",
    );

    await modal.locator('button[type="submit"]').click();
    const createResponse = await createResponsePromise;

    if (createResponse.status() === 201) {
      const payload = (await createResponse.json()) as {
        session?: { id?: string };
      };
      const sessionId = payload.session?.id;
      if (!sessionId) {
        throw new Error("Expected session id in one-off create response.");
      }

      await modalHeading.waitFor({ state: "detached", timeout: 5000 });
      return { id: sessionId, startLocal, endLocal };
    }

    if (createResponse.status() !== 409) {
      throw new Error(
        `Unexpected one-off session create status ${createResponse.status()}.`,
      );
    }
  }

  throw new Error("Unable to create a unique one-off session after retries.");
}

export async function generateRecurringSessions(
  page: Page,
  tenantSlug: string,
  input: {
    centerId: string;
    tutorId: string;
    studentId: string;
    startDate: string;
    endDate: string;
    weekday: number;
    startTime?: string;
    endTime?: string;
  },
) {
  await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
  await expect(page.getByTestId("sessions-list-page")).toBeVisible();

  await page.getByTestId("sessions-filter-center").selectOption(input.centerId);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("sessions-filter-tutor").selectOption(input.tutorId);
  await page.waitForLoadState("networkidle");

  await page.getByTestId("sessions-generate-button").click();
  const modalHeading = page.getByRole("heading", {
    name: /generate recurring sessions/i,
  });
  const modal = modalHeading.locator("..").locator("..");

  // TODO(e2e): add generator modal data-testid hooks to avoid label selectors.
  await modal.getByLabel(/center/i).selectOption(input.centerId);
  await modal.getByLabel(/tutor/i).selectOption(input.tutorId);
  await modal.getByLabel(/type/i).selectOption("ONE_ON_ONE");
  await modal.getByLabel(/student/i).selectOption(input.studentId);
  await modal.getByLabel(/start date/i).fill(input.startDate);
  await modal.getByLabel(/end date/i).fill(input.endDate);

  const weekdayCheckboxes = modal.getByRole("checkbox");
  await weekdayCheckboxes.nth(input.weekday - 1).check();
  const startTime = input.startTime ?? "09:00";
  const endTime = input.endTime ?? "10:00";
  await modal.getByLabel(/start time/i).fill(startTime);
  await modal.getByLabel(/end time/i).fill(endTime);

  await page.getByTestId("generator-preview-button").click();
  const previewCountText = await page
    .getByTestId("generator-preview-count")
    .innerText();
  if (Number(previewCountText) <= 0) {
    throw new Error("Expected recurring session preview count to be > 0.");
  }

  const commitResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/sessions/generate") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("generator-confirm-button").click();
  const commitResponse = await commitResponsePromise;
  if (!commitResponse.ok()) {
    throw new Error(
      `Recurring session generate failed with ${commitResponse.status()}.`,
    );
  }

  await modalHeading.waitFor({ state: "detached", timeout: 5000 });
}

// Attendance + notes helpers keep session detail assertions consistent.
export async function markAttendance(
  page: Page,
  input: { studentId: string; status: string; note?: string },
) {
  await page
    .getByTestId(`attendance-status-select-${input.studentId}`)
    .selectOption(input.status);
  if (input.note) {
    await page.getByTestId(`attendance-note-${input.studentId}`).fill(input.note);
  }
}

export async function saveNotes(
  page: Page,
  input: { internalNote: string; parentVisibleNote: string },
) {
  await page.getByTestId("notes-internal-input").fill(input.internalNote);
  await page
    .getByTestId("notes-parent-visible-input")
    .fill(input.parentVisibleNote);
  await page.getByTestId("notes-save-button").click();
  await expect(page.getByTestId("notes-saved-toast")).toBeVisible();
}
