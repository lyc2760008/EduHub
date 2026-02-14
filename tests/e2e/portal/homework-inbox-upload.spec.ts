// Step 23.2 parent homework E2E covers linked visibility, authenticated downloads, valid/invalid uploads, and latest-only rendering.
import { expect, test, type Page } from "@playwright/test";

import { buildTenantUrl } from "../helpers/parent-auth";
import { buildPortalApiPath, buildPortalPath } from "../helpers/portal";
import {
  cleanupTempUploadFile,
  createTempUploadFile,
  getHomeworkFixturePath,
} from "../helpers/homework";
import { resolveStep232Fixtures } from "../helpers/step232";

const BLOCKED_STATUSES = [302, 401, 403, 404];

type ParentHomeworkDetailPayload = {
  status: "ASSIGNED" | "SUBMITTED" | "REVIEWED";
  filesBySlot: {
    ASSIGNMENT: Array<{ filename: string }>;
    SUBMISSION: Array<{ filename: string; version: number }>;
    FEEDBACK: Array<{ filename: string }>;
  };
};

async function fetchParentHomeworkDetail(page: Page, tenant: string, homeworkItemId: string) {
  const response = await page.request.get(
    buildPortalApiPath(tenant, `/homework/${homeworkItemId}`),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as ParentHomeworkDetailPayload;
}

test.describe("[regression] Step 23.2 parent homework inbox + upload", () => {
  test("Parent inbox shows linked items only and assignment download remains authenticated", async ({
    page,
    browser,
  }) => {
    const fixtures = resolveStep232Fixtures();

    await page.goto(buildPortalPath(fixtures.tenantSlug, "/homework"));
    await expect(page.getByTestId("parent-homework-inbox-page")).toBeVisible();

    // Deterministic fixture IDs make visibility assertions robust even when additional rows exist.
    await expect(
      page
        .locator(
          `a[href$="/portal/homework/${fixtures.homeworkItemIds.parentWithAssignment}"]`,
        )
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator(
          `a[href$="/portal/homework/${fixtures.homeworkItemIds.parentWithoutAssignment}"]`,
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.locator(
        `a[href$="/portal/homework/${fixtures.homeworkItemIds.parentUnlinked}"]`,
      ),
    ).toHaveCount(0);

    await page.goto(
      buildPortalPath(
        fixtures.tenantSlug,
        `/homework/${fixtures.homeworkItemIds.parentWithAssignment}`,
      ),
    );
    await expect(page.getByTestId("parent-homework-detail-page")).toBeVisible();

    const assignmentDownloadLink = page
      .getByTestId("parent-homework-assignment-slot")
      .getByRole("link")
      .first();
    await expect(assignmentDownloadLink).toBeVisible();

    const assignmentHref = await assignmentDownloadLink.getAttribute("href");
    expect(assignmentHref).toBeTruthy();
    expect(assignmentHref ?? "").not.toMatch(/token=/i);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      assignmentDownloadLink.click(),
    ]);
    await expect(download.suggestedFilename().toLowerCase()).toContain(".pdf");

    const unauthContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000",
    });
    try {
      // Unauthenticated access must be denied even when a user can inspect a relative download path in the DOM.
      const unauthResponse = await unauthContext.request.get(
        buildTenantUrl(fixtures.tenantSlug, assignmentHref || "/"),
      );
      expect(BLOCKED_STATUSES).toContain(unauthResponse.status());
    } finally {
      await unauthContext.close();
    }
  });

  test("Parent submission upload supports valid files, blocks invalid/oversize files, and keeps latest-only view", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();
    const detailPath = buildPortalPath(
      fixtures.tenantSlug,
      `/homework/${fixtures.homeworkItemIds.parentWithAssignment}`,
    );

    await page.goto(detailPath);
    await expect(page.getByTestId("parent-homework-detail-page")).toBeVisible();

    const submissionInput = page.locator("#parent-homework-submission-file");
    const submissionSlot = page.getByTestId("parent-homework-submission-slot");

    await submissionInput.setInputFiles(getHomeworkFixturePath("sample.pdf"));
    const uploadV1ResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/portal/homework/${fixtures.homeworkItemIds.parentWithAssignment}/files`) &&
        response.request().method() === "POST",
    );
    await submissionSlot.getByRole("button", { name: /upload submission/i }).click();
    const uploadV1Response = await uploadV1ResponsePromise;
    expect(uploadV1Response.status()).toBe(201);

    await expect
      .poll(async () => {
        const detail = await fetchParentHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.parentWithAssignment,
        );
        return `${detail.status}:${detail.filesBySlot.SUBMISSION.length}`;
      })
      .toBe("SUBMITTED:1");

    await submissionInput.setInputFiles(getHomeworkFixturePath("sample.docx"));
    const uploadV2ResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/portal/homework/${fixtures.homeworkItemIds.parentWithAssignment}/files`) &&
        response.request().method() === "POST",
    );
    await submissionSlot.getByRole("button", { name: /replace/i }).click();
    const uploadV2Response = await uploadV2ResponsePromise;
    expect(uploadV2Response.status()).toBe(201);

    await expect
      .poll(async () => {
        const detail = await fetchParentHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.parentWithAssignment,
        );
        const versions = detail.filesBySlot.SUBMISSION.map((row) => row.version);
        const latestName = detail.filesBySlot.SUBMISSION[0]?.filename ?? "";
        return `${versions.length}:${Math.max(...versions)}:${latestName}`;
      })
      .toContain("2:2:sample.docx");

    // Parent v1 contract is latest-only display, so version history UI should not be present.
    await expect(page.getByText(/version history/i)).toHaveCount(0);
    await expect(page.getByText("sample.docx")).toBeVisible();

    await submissionInput.setInputFiles(getHomeworkFixturePath("invalid.png"));
    await expect(
      page.getByText(/invalid file type|pdf or docx/i),
    ).toBeVisible();

    const invalidTypeServerResponse = await page.request.post(
      buildPortalApiPath(
        fixtures.tenantSlug,
        `/homework/${fixtures.homeworkItemIds.parentWithAssignment}/files`,
      ),
      {
        multipart: {
          slot: "SUBMISSION",
          file: {
            name: "invalid.png",
            mimeType: "image/png",
            buffer: Buffer.from("INVALID_TYPE"),
          },
        },
      },
    );
    expect(invalidTypeServerResponse.status()).toBe(400);

    const oversizePath = await createTempUploadFile({
      filename: "oversize.pdf",
      bytes: 6 * 1024 * 1024,
      fillByte: 48,
    });
    try {
      await submissionInput.setInputFiles(oversizePath);
      await expect(
        page.getByText(/file too large|max size is 5 mb/i),
      ).toBeVisible();
    } finally {
      await cleanupTempUploadFile(oversizePath);
    }

    const oversizeServerResponse = await page.request.post(
      buildPortalApiPath(
        fixtures.tenantSlug,
        `/homework/${fixtures.homeworkItemIds.parentWithAssignment}/files`,
      ),
      {
        multipart: {
          slot: "SUBMISSION",
          file: {
            name: "oversize.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.alloc(6 * 1024 * 1024, 49),
          },
        },
      },
    );
    // Remote edge/runtime can reject oversized multipart bodies at transport level before app validation.
    expect([400, 413]).toContain(oversizeServerResponse.status());
  });
});
