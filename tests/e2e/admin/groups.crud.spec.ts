// Admin groups CRUD test covering create flow, tutor assignment, roster updates, and counts.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { fetchCenters, uniqueString } from "..\/helpers/data";
import { buildTenantApiPath, buildTenantPath } from "..\/helpers/tenant";

// Tagged for Playwright suite filtering.
test.describe("[regression] Groups - CRUD", () => {
  test("Admin can create group, assign tutor, add student, and see counts", async ({
    page,
  }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const groupName = uniqueString("E2E Group");

    await loginViaUI(page, { email, password, tenantSlug });

    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));
    await expect(page.getByTestId("groups-page")).toBeVisible();

    await page.getByTestId("create-group-button").click();
    await page.getByTestId("group-name-input").fill(groupName);

    const centerSelect = page.getByTestId("group-center-select");
    await centerSelect.selectOption({ index: 1 });
    const centerValue = await centerSelect.inputValue();
    expect(centerValue).not.toEqual("");

    const programSelect = page.getByTestId("group-program-select");
    await programSelect.selectOption({ index: 1 });
    const programValue = await programSelect.inputValue();
    expect(programValue).not.toEqual("");

    // Optional fields keep the form representative without creating new dependencies.
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
    const createPayload = (await createResponse.json()) as {
      group?: { id?: string };
    };
    const groupId = createPayload.group?.id;
    if (!groupId) {
      throw new Error("Expected group id from create response.");
    }

    // List views are paginated/sorted; navigate directly using the canonical created id.
    await page.goto(buildTenantPath(tenantSlug, `/admin/groups/${groupId}`));

    await expect(page.getByTestId("group-detail-page")).toBeVisible();

    const tutorContainer = page.getByTestId("assign-tutor-select");
    const tutorOptions = tutorContainer.locator("input[type=checkbox]");
    const tutorOptionCount = await tutorOptions.count();
    let expectedTutorsCount = 0;
    let selectedTutorId: string | null = null;

    if (tutorOptionCount > 0) {
      await tutorOptions.first().check();
      expectedTutorsCount = 1;

      const tutorSavePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/groups/") &&
          response.url().endsWith("/tutors") &&
          response.request().method() === "PUT",
      );

      await page.getByTestId("save-group-tutors-button").click();
      const tutorSaveResponse = await tutorSavePromise;
      expect(tutorSaveResponse.ok()).toBeTruthy();
      const tutorSavePayload = (await tutorSaveResponse.json()) as {
        tutorIds?: string[];
      };
      selectedTutorId = tutorSavePayload.tutorIds?.[0] ?? null;

      await expect(tutorOptions.first()).toBeChecked();
    } else {
      await expect(page.getByTestId("tutor-empty-state")).toBeVisible();
    }

    const studentContainer = page.getByTestId("add-student-select");
    const studentOptions = studentContainer.locator("input[type=checkbox]");
    const studentOptionCount = await studentOptions.count();
    let expectedStudentsCount = 0;
    let firstRosterSnapshot: string[] = [];
    let secondRosterSnapshot: string[] = [];

    if (studentOptionCount > 0) {
      await studentOptions.first().check();
      expectedStudentsCount = 1;

      const studentSavePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/groups/") &&
          response.url().endsWith("/students") &&
          response.request().method() === "PUT",
      );

      await page.getByTestId("save-group-students-button").click();
      const studentSaveResponse = await studentSavePromise;
      expect(studentSaveResponse.ok()).toBeTruthy();
      const studentSavePayload = (await studentSaveResponse.json()) as {
        studentIds?: string[];
      };
      firstRosterSnapshot = studentSavePayload.studentIds ?? [];
      expectedStudentsCount = firstRosterSnapshot.length;

      await expect(studentOptions.first()).toBeChecked();

      // Re-saving without changes validates duplicate prevention via replace-set semantics.
      const studentResavePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/groups/") &&
          response.url().endsWith("/students") &&
          response.request().method() === "PUT",
      );

      await page.getByTestId("save-group-students-button").click();
      const studentResaveResponse = await studentResavePromise;
      expect(studentResaveResponse.ok()).toBeTruthy();

      await expect(studentOptions.first()).toBeChecked();

      if (
        selectedTutorId &&
        studentOptionCount > 1 &&
        firstRosterSnapshot.length > 0
      ) {
        const centers = await fetchCenters(page, tenantSlug);
        const center = centers.find((entry) => entry.id === centerValue);
        if (!center) {
          throw new Error("Expected selected center to resolve timezone.");
        }

        // Create one future group session before adding the second student.
        const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
        const createSessionResponse = await page.request.post(
          buildTenantApiPath(tenantSlug, "/api/sessions"),
          {
            data: {
              centerId: centerValue,
              tutorId: selectedTutorId,
              sessionType: "GROUP",
              groupId,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              timezone: center.timezone,
            },
          },
        );
        expect(createSessionResponse.status()).toBe(201);
        const createSessionPayload = (await createSessionResponse.json()) as {
          session?: { id?: string };
        };
        const sessionId = createSessionPayload.session?.id;
        if (!sessionId) {
          throw new Error("Expected a created session id for sync validation.");
        }

        const preSyncSessionResponse = await page.request.get(
          buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}`),
        );
        expect(preSyncSessionResponse.status()).toBe(200);
        const preSyncSessionPayload = (await preSyncSessionResponse.json()) as {
          session?: { roster?: Array<{ id: string }> };
        };
        const preSyncRosterIds = (preSyncSessionPayload.session?.roster ?? []).map(
          (student) => student.id,
        );
        expect(preSyncRosterIds).toEqual(firstRosterSnapshot);

        // Add one more student to the group roster so sync has a deterministic delta.
        await studentOptions.nth(1).check();
        const secondSavePromise = page.waitForResponse(
          (response) =>
            response.url().includes("/api/groups/") &&
            response.url().endsWith("/students") &&
            response.request().method() === "PUT",
        );
        await page.getByTestId("save-group-students-button").click();
        const secondSaveResponse = await secondSavePromise;
        expect(secondSaveResponse.ok()).toBeTruthy();
        const secondSavePayload = (await secondSaveResponse.json()) as {
          studentIds?: string[];
        };
        secondRosterSnapshot = secondSavePayload.studentIds ?? [];
        expectedStudentsCount = secondRosterSnapshot.length;

        const newlyAddedStudentIds = secondRosterSnapshot.filter(
          (studentId) => !firstRosterSnapshot.includes(studentId),
        );
        expect(newlyAddedStudentIds.length).toBeGreaterThan(0);

        const syncResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes(`/api/groups/${groupId}/sync-future-sessions`) &&
            response.request().method() === "POST",
        );

        await page.getByTestId("sync-group-future-sessions-button").click();
        // Step 22.7 sync action now requires an explicit confirmation click in the modal.
        const syncDialog = page.locator("div.fixed.inset-0");
        await expect(syncDialog).toBeVisible();
        await syncDialog.getByRole("button", { name: /sync/i }).click();
        const syncResponse = await syncResponsePromise;
        expect(syncResponse.ok()).toBeTruthy();
        const syncPayload = (await syncResponse.json()) as {
          studentsAdded?: number;
        };
        expect(syncPayload.studentsAdded ?? 0).toBeGreaterThanOrEqual(
          newlyAddedStudentIds.length,
        );

        const postSyncSessionResponse = await page.request.get(
          buildTenantApiPath(tenantSlug, `/api/sessions/${sessionId}`),
        );
        expect(postSyncSessionResponse.status()).toBe(200);
        const postSyncSessionPayload = (await postSyncSessionResponse.json()) as {
          session?: { roster?: Array<{ id: string }> };
        };
        const postSyncRosterIds = (
          postSyncSessionPayload.session?.roster ?? []
        ).map((student) => student.id);
        for (const studentId of newlyAddedStudentIds) {
          expect(postSyncRosterIds).toContain(studentId);
        }
      }
    } else {
      await expect(page.getByTestId("student-empty-state")).toBeVisible();
    }

    const groupDetailResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, `/api/groups/${groupId}`),
    );
    expect(groupDetailResponse.status()).toBe(200);
    const groupDetailPayload = (await groupDetailResponse.json()) as {
      group?: { tutors?: unknown[]; students?: unknown[] };
    };
    expect(groupDetailPayload.group?.tutors?.length ?? 0).toBe(expectedTutorsCount);
    expect(groupDetailPayload.group?.students?.length ?? 0).toBe(
      expectedStudentsCount,
    );
  });
});



