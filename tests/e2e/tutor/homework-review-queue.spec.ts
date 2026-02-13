// Step 23.2 tutor homework E2E covers tutor-scoped queue visibility, feedback upload/versioning, and review transition rules.
import { expect, test, type Page } from "@playwright/test";

import { buildTenantPath } from "../helpers/tenant";
import { getHomeworkFixturePath } from "../helpers/homework";
import { resolveStep232Fixtures } from "../helpers/step232";

type TutorHomeworkDetailPayload = {
  status: "ASSIGNED" | "SUBMITTED" | "REVIEWED";
  filesBySlot: {
    ASSIGNMENT: Array<{ version: number }>;
    SUBMISSION: Array<{ version: number }>;
    FEEDBACK: Array<{ version: number; filename: string }>;
  };
};

function getStaffSlotSection(page: Page, heading: RegExp) {
  // Slot sections are keyed by translated heading text, so regex keeps tests locale-tolerant.
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) }).first();
}

async function fetchTutorHomeworkDetail(page: Page, tenant: string, homeworkItemId: string) {
  const response = await page.request.get(
    buildTenantPath(tenant, `/api/tutor/homework/${homeworkItemId}`),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as TutorHomeworkDetailPayload;
}

test.describe("[regression] Step 23.2 tutor homework review queue", () => {
  test("Tutor queue only shows owned items and blocks direct access to other tutor homework", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();

    await page.goto(buildTenantPath(fixtures.tenantSlug, "/tutor/homework"));
    await expect(page.getByTestId("staff-homework-queue-tutor")).toBeVisible();

    await expect(
      page.getByTestId(`staff-homework-row-${fixtures.homeworkItemIds.tutorSubmitted}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`staff-homework-row-${fixtures.homeworkItemIds.tutorOther}`),
    ).toHaveCount(0);

    const blockedResponse = await page.request.get(
      buildTenantPath(
        fixtures.tenantSlug,
        `/api/tutor/homework/${fixtures.homeworkItemIds.tutorOther}`,
      ),
    );
    expect(blockedResponse.status()).toBe(404);

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/homework/${fixtures.homeworkItemIds.tutorOther}`,
      ),
    );
    await expect(page.getByTestId("staff-homework-detail-error-tutor")).toBeVisible();
  });

  test("Tutor can review submitted homework, upload feedback versions, and cannot mark no-submission rows reviewed", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/homework/${fixtures.homeworkItemIds.tutorSubmitted}`,
      ),
    );
    await expect(page.getByTestId("staff-homework-detail-tutor")).toBeVisible();

    const submissionSection = getStaffSlotSection(page, /submission/i);
    const downloadLink = submissionSection.getByRole("link", { name: /download/i }).first();
    await expect(downloadLink).toBeVisible();
    const [submissionDownload] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);
    await expect(submissionDownload.suggestedFilename().length).toBeGreaterThan(0);

    const feedbackInput = page.locator("#staff-homework-file-tutor-FEEDBACK");
    const feedbackSection = feedbackInput.locator("xpath=ancestor::section[1]");
    await feedbackInput.setInputFiles(getHomeworkFixturePath("sample.pdf"));
    const uploadV1ResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/tutor/homework/${fixtures.homeworkItemIds.tutorSubmitted}/files`) &&
        response.request().method() === "POST",
    );
    // Slot-local button targeting avoids locale-specific label coupling for upload/replace actions.
    await feedbackSection.locator('button[type="button"]').first().click();
    const uploadV1Response = await uploadV1ResponsePromise;
    expect(uploadV1Response.status()).toBe(201);

    await feedbackInput.setInputFiles(getHomeworkFixturePath("sample.docx"));
    const uploadV2ResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/tutor/homework/${fixtures.homeworkItemIds.tutorSubmitted}/files`) &&
        response.request().method() === "POST",
    );
    await feedbackSection.locator('button[type="button"]').first().click();
    const uploadV2Response = await uploadV2ResponsePromise;
    expect(uploadV2Response.status()).toBe(201);

    await expect
      .poll(async () => {
        const detail = await fetchTutorHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.tutorSubmitted,
        );
        return `${detail.status}:${detail.filesBySlot.FEEDBACK.length}:${detail.filesBySlot.FEEDBACK[0]?.version ?? 0}`;
      })
      .toBe("SUBMITTED:2:2");

    // Trigger the same backend transition endpoint directly to avoid locale-coupled button-label selection.
    const markReviewedResponse = await page.request.post(
      buildTenantPath(fixtures.tenantSlug, "/api/tutor/homework/bulk/mark-reviewed"),
      {
        data: { homeworkItemIds: [fixtures.homeworkItemIds.tutorSubmitted] },
      },
    );
    expect(markReviewedResponse.status()).toBe(200);

    await expect
      .poll(async () => {
        const detail = await fetchTutorHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.tutorSubmitted,
        );
        return detail.status;
      })
      .toBe("REVIEWED");

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/tutor/homework/${fixtures.homeworkItemIds.tutorNoSubmission}`,
      ),
    );
    await expect(page.getByTestId("staff-homework-detail-tutor")).toBeVisible();

    const noSubmissionBulkResponse = await page.request.post(
      buildTenantPath(fixtures.tenantSlug, "/api/tutor/homework/bulk/mark-reviewed"),
      {
        data: { homeworkItemIds: [fixtures.homeworkItemIds.tutorNoSubmission] },
      },
    );
    expect(noSubmissionBulkResponse.status()).toBe(200);
    const noSubmissionPayload = (await noSubmissionBulkResponse.json()) as {
      reviewedCount: number;
      skippedNotSubmittedCount: number;
    };
    expect(noSubmissionPayload.reviewedCount).toBe(0);
    expect(noSubmissionPayload.skippedNotSubmittedCount).toBe(1);
  });
});
