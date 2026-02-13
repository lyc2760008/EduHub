// Step 22.9 admin resource CRUD coverage validates URL validation + persistence + delete behavior.
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";
import {
  STEP229_RESOURCE_URLS,
  resolveStep229Fixtures,
} from "../helpers/step229";
import { buildTenantPath } from "../helpers/tenant";

const LABEL_TITLE = /title|标题/i;
const LABEL_URL = /url|链接/i;
const LABEL_TYPE = /type|类型/i;
const BUTTON_SAVE = /save|保存/i;
const BUTTON_EDIT = /edit|编辑/i;
const BUTTON_DELETE = /delete|删除/i;

function resourceRow(title: string) {
  return `[data-testid="session-resources-list"] li:has-text("${title}")`;
}

test.describe("[regression] Step 22.9 admin session resources CRUD", () => {
  test("Admin can add/edit/delete resources and invalid URLs are rejected", async ({
    page,
  }) => {
    const fixtures = resolveStep229Fixtures();
    await loginAsAdmin(page, fixtures.tenantSlug);

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/admin/sessions/${fixtures.sessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByTestId("session-detail-page")).toBeVisible();
    await expect(page.getByTestId("session-resources-list")).toBeVisible();
    await expect(page.locator(resourceRow("E2E_RESOURCE_EXISTING"))).toBeVisible();

    await page.getByTestId("session-resources-add").click();
    const modal = page.getByTestId("session-resources-editor-modal");
    await expect(modal).toBeVisible();

    await modal.getByLabel(LABEL_TYPE).selectOption("VIDEO");
    await modal.getByLabel(LABEL_TITLE).fill("E2E_STEP229_ADMIN_TEMP");
    for (const invalidUrl of [
      "ftp://invalid.example.com",
      "javascript:alert(1)",
      "not-a-url",
    ]) {
      await modal.getByLabel(LABEL_URL).fill(invalidUrl);
      await modal.getByRole("button", { name: BUTTON_SAVE }).click();
      await expect(modal.getByText(/http:\/\/|https:\/\/|有效链接/i)).toBeVisible();
    }

    const createdTitle = "E2E_STEP229_ADMIN_CREATED";
    const createdUrl = `${STEP229_RESOURCE_URLS.existing}?created=1`;
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(
          `/api/admin/sessions/${fixtures.sessionIds.tutorAFirst}/resources`,
        ) && response.request().method() === "POST",
    );
    await modal.getByLabel(LABEL_TITLE).fill(createdTitle);
    await modal.getByLabel(LABEL_URL).fill(createdUrl);
    await modal.getByRole("button", { name: BUTTON_SAVE }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    await expect(modal).toHaveCount(0);

    const createdRow = page.locator(resourceRow(createdTitle)).first();
    await expect(createdRow).toBeVisible();
    await expect(
      createdRow.getByRole("link", { name: /open link|打开链接/i }),
    ).toHaveAttribute("href", createdUrl);

    const updatedTitle = "E2E_STEP229_ADMIN_UPDATED";
    const updatedUrl = `${STEP229_RESOURCE_URLS.existing}?updated=1`;
    await createdRow.getByRole("button", { name: BUTTON_EDIT }).click();
    await expect(modal).toBeVisible();
    await modal.getByLabel(LABEL_TYPE).selectOption("WORKSHEET");
    await modal.getByLabel(LABEL_TITLE).fill(updatedTitle);
    await modal.getByLabel(LABEL_URL).fill(updatedUrl);
    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/resources/") &&
        response.request().method() === "PATCH",
    );
    await modal.getByRole("button", { name: BUTTON_SAVE }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status()).toBe(200);
    await expect(page.locator(resourceRow(updatedTitle))).toBeVisible();

    await page.reload();
    const updatedRow = page.locator(resourceRow(updatedTitle)).first();
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText(/worksheet|练习题/i);
    await expect(
      updatedRow.getByRole("link", { name: /open link|打开链接/i }),
    ).toHaveAttribute("href", updatedUrl);

    await updatedRow.getByRole("button", { name: BUTTON_DELETE }).click();
    const deleteModal = page.getByTestId("session-resources-delete-modal");
    await expect(deleteModal).toBeVisible();
    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/resources/") &&
        response.request().method() === "DELETE",
    );
    await deleteModal.getByRole("button", { name: BUTTON_DELETE }).click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBe(200);

    await expect(page.locator(resourceRow(updatedTitle))).toHaveCount(0);
    await page.reload();
    await expect(page.locator(resourceRow(updatedTitle))).toHaveCount(0);
  });
});
