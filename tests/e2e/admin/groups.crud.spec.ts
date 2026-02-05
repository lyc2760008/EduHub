// Admin groups CRUD test covering create flow, tutor assignment, roster updates, and counts.
import { expect, test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import { uniqueString } from "..\/helpers/data";
import { buildTenantPath } from "..\/helpers/tenant";

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

    await expect(page.getByTestId("groups-table")).toContainText(groupName);

    const row = page.getByTestId("groups-table").locator("tr", {
      hasText: groupName,
    });
    await row.getByTestId("manage-group-link").click();

    await expect(page.getByTestId("group-detail-page")).toBeVisible();

    const tutorContainer = page.getByTestId("assign-tutor-select");
    const tutorOptions = tutorContainer.locator("input[type=checkbox]");
    const tutorOptionCount = await tutorOptions.count();
    let expectedTutorsCount = 0;

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

      await expect(tutorOptions.first()).toBeChecked();
    } else {
      await expect(page.getByTestId("tutor-empty-state")).toBeVisible();
    }

    const studentContainer = page.getByTestId("add-student-select");
    const studentOptions = studentContainer.locator("input[type=checkbox]");
    const studentOptionCount = await studentOptions.count();
    let expectedStudentsCount = 0;

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
    } else {
      await expect(page.getByTestId("student-empty-state")).toBeVisible();
    }

    // Navigate back to the list and assert counts (when available).
    await page.goto(buildTenantPath(tenantSlug, "/admin/groups"));
    const refreshedRow = page.getByTestId("groups-table").locator("tr", {
      hasText: groupName,
    });
    await expect(refreshedRow.getByTestId("group-tutors-count")).toHaveText(
      expectedTutorsCount.toString(),
    );
    await expect(refreshedRow.getByTestId("group-students-count")).toHaveText(
      expectedStudentsCount.toString(),
    );
  });
});



