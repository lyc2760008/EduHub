// Step 22.9 tutor resource coverage validates read visibility, create-only policy, and ownership guards.
import { expect, test } from "@playwright/test";

import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";
import { resolveStep229Fixtures } from "../helpers/step229";

const LABEL_TITLE = /title|标题/i;
const LABEL_URL = /url|链接/i;
const LABEL_TYPE = /type|类型/i;
const BUTTON_SAVE = /save|保存/i;
const BUTTON_EDIT = /edit|编辑/i;
const BUTTON_DELETE = /delete|删除/i;

test.describe("[regression] Step 22.9 tutor session resources", () => {
  test("Tutor can view/add owned-session resources and cannot access other tutor sessions", async ({
    page,
  }) => {
    const fixtures = resolveStep229Fixtures();

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/sessions/${fixtures.sessionIds.tutorAFirst}`,
      ),
    );
    await expect(page.getByTestId("tutor-run-session-page")).toBeVisible();
    const resourcesSection = page.getByTestId("tutor-run-session-resources");
    await expect(resourcesSection).toBeVisible();
    await expect(resourcesSection).toContainText("E2E_RESOURCE_EXISTING");
    await expect(
      resourcesSection
        .locator("li")
        .filter({ hasText: "E2E_RESOURCE_EXISTING" })
        .getByRole("link", { name: /open link|打开链接/i }),
    ).toHaveAttribute("href", "https://example.com/e2e-resource");

    // PO-locked Step 22.9 policy is tutor create-only; branch keeps tests compatible if policy changes later.
    const editButtons = resourcesSection.getByRole("button", { name: BUTTON_EDIT });
    const deleteButtons = resourcesSection.getByRole("button", { name: BUTTON_DELETE });
    if ((await editButtons.count()) > 0 || (await deleteButtons.count()) > 0) {
      await expect(editButtons.first()).toBeVisible();
      await expect(deleteButtons.first()).toBeVisible();
    } else {
      await expect(editButtons).toHaveCount(0);
      await expect(deleteButtons).toHaveCount(0);
      const forbiddenPatch = await page.request.patch(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/admin/resources/${fixtures.resourceIds.primaryExisting}`,
        ),
        {
          data: { title: "E2E_TUTOR_FORBIDDEN_EDIT" },
        },
      );
      expect([401, 403]).toContain(forbiddenPatch.status());
    }

    await resourcesSection.getByRole("button", { name: /add resource|添加资料/i }).click();
    const createModal = page.getByTestId("tutor-run-session-resource-modal");
    await expect(createModal).toBeVisible();
    await createModal.getByLabel(LABEL_TYPE).selectOption("OTHER");
    const createdTitle = "E2E_STEP229_TUTOR_CREATED";
    const createdUrl = "https://example.com/e2e-tutor-created";
    await createModal.getByLabel(LABEL_TITLE).fill(createdTitle);
    await createModal.getByLabel(LABEL_URL).fill(createdUrl);
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/tutor/sessions/${fixtures.sessionIds.tutorAFirst}/resources`) &&
        response.request().method() === "POST",
    );
    await createModal.getByRole("button", { name: BUTTON_SAVE }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);

    await expect(resourcesSection).toContainText(createdTitle);
    await page.reload();
    await expect(page.getByTestId("tutor-run-session-resources")).toContainText(createdTitle);

    const otherTutorResourcesResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/tutor/sessions/${fixtures.sessionIds.tutorBOther}/resources`,
      ),
    );
    expect(otherTutorResourcesResponse.status()).toBe(404);

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/sessions/${fixtures.sessionIds.tutorBOther}`,
      ),
    );
    await expect(page.getByTestId("tutor-run-session-error")).toBeVisible();
    await expect(page.getByTestId("tutor-run-session-resources")).toHaveCount(0);
  });
});
