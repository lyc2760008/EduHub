// Sessions UI regression coverage: admin create/generate + tutor read-only.
// Required env vars: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TUTOR_EMAIL, E2E_TUTOR_PASSWORD, E2E_TENANT_SLUG (optional), E2E_BASE_URL (optional).
import { expect, test, type Page } from "@playwright/test";
import { DateTime } from "luxon";

import { loginViaUI } from "..\/helpers/auth";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

type Center = { id: string; name: string; timezone: string };
type User = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  centers: Array<{ id: string; name: string }>;
};
type Student = { id: string };
type StudentCreateResponse = { student?: Student };

function nextWeekRange(timezone: string) {
  const start = DateTime.now()
    .setZone(timezone)
    .plus({ days: 7 })
    .startOf("day");
  const end = start.plus({ days: 6 });
  return {
    startDate: start.toISODate() ?? "",
    endDate: end.toISODate() ?? "",
  };
}

function futureDateTime(
  timezone: string,
  daysFromNow: number,
  hour: number,
  minute: number,
) {
  const dt = DateTime.now()
    .setZone(timezone)
    .plus({ days: daysFromNow })
    .set({ hour, minute, second: 0, millisecond: 0 });
  return dt.toFormat("yyyy-LL-dd'T'HH:mm");
}

function isTransientNetworkError(error: unknown) {
  // Treat connection resets as transient so the full suite can retry once.
  if (!(error instanceof Error)) return false;
  return /ECONNRESET|socket hang up|ECONNREFUSED/i.test(error.message);
}

async function postWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page["request"]["post"]>[1],
  attempts = 2,
) {
  // Retry a single time on transient network errors seen during full-suite load.
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

async function fetchCenters(page: Page, tenant: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenant, "/api/centers?includeInactive=true"),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as Center[];
}

async function fetchUsers(page: Page, tenant: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenant, "/api/users"),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as User[];
}

async function fetchStudents(page: Page, tenant: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenant, "/api/students?pageSize=50"),
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { students: Student[] };
  return payload.students;
}

async function applySessionsListFilters(
  page: Page,
  input: { centerId: string; tutorId: string },
) {
  // Sessions filters now live in a sheet; open/apply/close to keep tests aligned with toolkit UX.
  await page.getByTestId("sessions-list-search-filters-button").click();
  await expect(page.getByTestId("admin-filters-sheet")).toBeVisible();

  const centerFilterResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/sessions") &&
      response.request().method() === "GET",
  );
  await page.getByTestId("sessions-filter-center").selectOption(input.centerId);
  await centerFilterResponse;

  const tutorFilterResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/sessions") &&
      response.request().method() === "GET",
  );
  await page.getByTestId("sessions-filter-tutor").selectOption(input.tutorId);
  await tutorFilterResponse;

  await page.getByTestId("admin-filters-sheet-close").click();
  await expect(page.getByTestId("admin-filters-sheet")).toHaveCount(0);
}

let studentCounter = 0;

function buildStudentName() {
  studentCounter += 1;
  return `E2E${Date.now()}-${studentCounter}`;
}

// Ensure at least one student exists so session creation can select a roster.
async function ensureStudent(page: Page, tenant: string) {
  const students = await fetchStudents(page, tenant);
  if (students.length) {
    return { student: students[0], created: false };
  }

  const response = await page.request.post(
    buildTenantApiPath(tenant, "/api/students"),
    {
      data: {
        firstName: buildStudentName(),
        lastName: "Session",
      },
    },
  );
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as StudentCreateResponse;
  if (!payload.student?.id) {
    throw new Error("Expected student id in create student response.");
  }
  return { student: payload.student, created: true };
}

// Tagged for Playwright suite filtering.
test.describe("[slow] [regression] Sessions - admin UI", () => {
  test("Admin can create a one-off session and open detail", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });
    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));

    const [centers, users, studentResult] = await Promise.all([
      fetchCenters(page, tenantSlug),
      fetchUsers(page, tenantSlug),
      ensureStudent(page, tenantSlug),
    ]);

    const tutor = users.find(
      (user) => user.role === "Tutor" && user.centers.length,
    );
    if (!tutor) {
      throw new Error("No tutor with center assignment available for test.");
    }

    const centerId = tutor.centers[0]?.id;
    const center = centers.find((item) => item.id === centerId) ?? centers[0];
    if (!center) {
      throw new Error("No center available for test.");
    }

    const { created } = studentResult;

    if (created) {
      // Refresh sessions page so admin options include the newly created student.
      await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    }

    await applySessionsListFilters(page, {
      centerId: center.id,
      tutorId: tutor.id,
    });

    await page.getByTestId("sessions-create-button").click();

    const modal = page
      .getByRole("heading", { name: /create one-off session/i })
      .locator("..")
      .locator("..");

    await modal.getByLabel(/center/i).selectOption(center.id);
    await modal.getByLabel(/tutor/i).selectOption(tutor.id);
    await modal.getByLabel(/type/i).selectOption("ONE_ON_ONE");
    // Wait for students to load before selecting any available student.
    const studentSelect = modal.getByTestId("one-to-one-student-select");
    await expect.poll(async () => studentSelect.locator("option").count()).toBeGreaterThan(1);
    const fallbackStudentValue = await studentSelect
      .locator("option")
      .nth(1)
      .getAttribute("value");
    if (!fallbackStudentValue) {
      throw new Error("Expected at least one student option in one-off modal.");
    }
    await studentSelect.selectOption(fallbackStudentValue);

    const timezone = center.timezone || "America/Edmonton";
    const minuteSeed = (Date.now() % 45) + 10;
    const heading = page.getByRole("heading", {
      name: /create one-off session/i,
    });
    const saveButton = modal.getByRole("button", { name: /create session/i });

    let createdSessionId: string | null = null;
    let createdStartAt: string | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const minute = (minuteSeed + attempt) % 55;
      const dayOffset = 3 + attempt;
      const startAt = futureDateTime(timezone, dayOffset, 9 + attempt, minute);
      const endAt = futureDateTime(timezone, dayOffset, 10 + attempt, minute);

      // Use test ids to avoid locale-specific labels in E2E.
      await modal.getByTestId("sessions-one-off-start").fill(startAt);
      await modal.getByTestId("sessions-one-off-end").fill(endAt);
      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/sessions") &&
          response.request().method() === "POST",
      );
      await saveButton.click();
      const createResponse = await createResponsePromise;

      if (createResponse.status() === 201) {
        const payload = (await createResponse.json()) as {
          session?: { id?: string };
        };
        createdSessionId = payload.session?.id ?? null;
      } else if (createResponse.status() !== 409) {
        throw new Error(
          `Unexpected one-off session create status ${createResponse.status()}.`,
        );
      }

      const closed = await heading
        .waitFor({ state: "detached", timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (closed && createdSessionId) {
        createdStartAt = startAt;
        break;
      }

      await expect(saveButton).toBeEnabled();
    }

    if (!createdStartAt) {
      throw new Error("One-off session create failed after retries.");
    }
    if (!createdSessionId) {
      throw new Error("Expected one-off session id after successful creation.");
    }

    // Navigate by id to avoid pagination-induced flakiness in long-lived fixtures.
    await page.goto(
      buildTenantPath(tenantSlug, `/admin/sessions/${createdSessionId}`),
    );

    await expect(page.getByTestId("session-detail-title")).toBeVisible();
    await expect(page.getByTestId("session-detail-roster")).toBeVisible();
  });

  test("Admin can preview and confirm recurring sessions", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });
    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));

    const [centers, users, studentResult] = await Promise.all([
      fetchCenters(page, tenantSlug),
      fetchUsers(page, tenantSlug),
      ensureStudent(page, tenantSlug),
    ]);

    const tutor = users.find(
      (user) => user.role === "Tutor" && user.centers.length,
    );
    if (!tutor) {
      throw new Error("No tutor with center assignment available for test.");
    }

    const centerId = tutor.centers[0]?.id;
    const center = centers.find((item) => item.id === centerId) ?? centers[0];
    if (!center) {
      throw new Error("No center available for test.");
    }

    const { created } = studentResult;

    if (created) {
      // Refresh sessions page so admin options include the newly created student.
      await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));
    }

    await applySessionsListFilters(page, {
      centerId: center.id,
      tutorId: tutor.id,
    });

    await page.getByTestId("sessions-generate-button").click();

    const modal = page
      .getByRole("heading", { name: /generate recurring sessions/i })
      .locator("..")
      .locator("..");

    await modal.getByLabel(/center/i).selectOption(center.id);
    await modal.getByLabel(/tutor/i).selectOption(tutor.id);
    await modal.getByLabel(/type/i).selectOption("ONE_ON_ONE");
    // Wait for students to load before selecting any available student.
    const studentSelect = modal.locator("#sessions-generator-student");
    await expect.poll(async () => studentSelect.locator("option").count()).toBeGreaterThan(1);
    const fallbackStudentValue = await studentSelect
      .locator("option")
      .nth(1)
      .getAttribute("value");
    if (!fallbackStudentValue) {
      throw new Error("Expected at least one student option in generator modal.");
    }
    await studentSelect.selectOption(fallbackStudentValue);

    const timezone = center.timezone || "America/Edmonton";
    const range = nextWeekRange(timezone);
    await modal.getByLabel(/start date/i).fill(range.startDate);
    await modal.getByLabel(/end date/i).fill(range.endDate);

    const startTime = "09:00";
    const endTime = "10:00";
    await modal.getByRole("checkbox").first().check();
    await modal.getByLabel(/start time/i).fill(startTime);
    await modal.getByLabel(/end time/i).fill(endTime);

    await page.getByTestId("generator-preview-button").click();
    const countText = await page
      .getByTestId("generator-preview-count")
      .innerText();
    expect(Number(countText)).toBeGreaterThan(0);

    const commitResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/sessions/generate") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("generator-confirm-button").click();
    const commitResponse = await commitResponsePromise;
    expect(commitResponse.ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: /generate recurring sessions/i }),
    ).toHaveCount(0);
  });
});

// Tagged for Playwright suite filtering.
test.describe("[slow] [regression] Sessions - tutor access", () => {
  test("Tutor can view sessions but cannot create", async ({ page }) => {
    const email = process.env.E2E_TUTOR_EMAIL;
    const password = process.env.E2E_TUTOR_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_TUTOR_EMAIL or E2E_TUTOR_PASSWORD env vars.",
      );
    }

    await loginViaUI(page, { email, password, tenantSlug });
    await page.goto(buildTenantPath(tenantSlug, "/admin/sessions"));

    await expect(page.getByTestId("sessions-create-button")).toHaveCount(0);
    await expect(page.getByTestId("sessions-generate-button")).toHaveCount(0);

    const response = await postWithRetry(
      page,
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: {} },
    );
    expect(response.status()).toBe(403);
  });
});



