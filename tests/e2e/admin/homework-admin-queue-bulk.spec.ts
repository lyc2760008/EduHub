// Step 23.2 admin homework E2E covers tenant-wide queue visibility, staff-side versioning, and bulk review behavior.
import { expect, test, type Page } from "@playwright/test";

import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";
import { getHomeworkFixturePath } from "../helpers/homework";
import { resolveStep232Fixtures } from "../helpers/step232";

type AdminHomeworkDetailPayload = {
  status: "ASSIGNED" | "SUBMITTED" | "REVIEWED";
  session: { tutorId: string };
  filesBySlot: {
    ASSIGNMENT: Array<{ version: number }>;
    SUBMISSION: Array<{ version: number }>;
    FEEDBACK: Array<{ version: number }>;
  };
};

function buildQueueUrl(tenant: string, options: { status?: "ALL" | "ASSIGNED" | "SUBMITTED" | "REVIEWED"; search?: string }) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "100",
    sortField: "submittedAt",
    sortDir: "asc",
    filters: JSON.stringify({ status: options.status || "SUBMITTED" }),
  });
  if (options.search) {
    params.set("search", options.search);
  }
  return buildTenantPath(tenant, `/admin/homework?${params.toString()}`);
}

function getStaffSlotSection(page: Page, heading: RegExp) {
  // Slot sections are keyed by translated heading text, so regex keeps assertions locale-tolerant.
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) }).first();
}

async function fetchAdminHomeworkDetail(page: Page, tenant: string, homeworkItemId: string) {
  const response = await page.request.get(
    buildTenantApiPath(tenant, `/api/admin/homework/${homeworkItemId}`),
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as AdminHomeworkDetailPayload;
}

test.describe("[regression] Step 23.2 admin homework queue + bulk", () => {
  test("Admin queue includes tutor-owned rows across tenant and excludes cross-tenant rows", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();

    await page.goto(buildQueueUrl(fixtures.tenantSlug, { status: "ALL", search: "step224" }));
    await expect(page.getByTestId("staff-homework-queue-admin")).toBeVisible();

    await expect(
      page.getByTestId(`staff-homework-row-${fixtures.homeworkItemIds.tutorSubmitted}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`staff-homework-row-${fixtures.homeworkItemIds.tutorOther}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`staff-homework-row-${fixtures.crossTenantHomeworkItemId}`),
    ).toHaveCount(0);
  });

  test("Admin upload replacement creates new assignment versions visible in staff history", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();

    await page.goto(
      buildTenantPath(
        fixtures.tenantSlug,
        `/admin/homework/${fixtures.homeworkItemIds.bulkAssigned}`,
      ),
    );
    await expect(page.getByTestId("staff-homework-detail-admin")).toBeVisible();

    const assignmentSection = getStaffSlotSection(page, /assignment/i);
    const assignmentInput = page.locator("#staff-homework-file-admin-ASSIGNMENT");

    await assignmentInput.setInputFiles(getHomeworkFixturePath("sample.pdf"));
    const replaceV2ResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/admin/homework/${fixtures.homeworkItemIds.bulkAssigned}/files`) &&
        response.request().method() === "POST",
    );
    await assignmentSection.getByRole("button", { name: /replace/i }).click();
    const replaceV2Response = await replaceV2ResponsePromise;
    expect(replaceV2Response.status()).toBe(201);

    await assignmentInput.setInputFiles(getHomeworkFixturePath("sample.docx"));
    const replaceV3ResponsePromise = page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(`/api/admin/homework/${fixtures.homeworkItemIds.bulkAssigned}/files`) &&
        response.request().method() === "POST",
    );
    await assignmentSection.getByRole("button", { name: /replace/i }).click();
    const replaceV3Response = await replaceV3ResponsePromise;
    expect(replaceV3Response.status()).toBe(201);

    await expect
      .poll(async () => {
        const detail = await fetchAdminHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.bulkAssigned,
        );
        return `${detail.filesBySlot.ASSIGNMENT.length}:${detail.filesBySlot.ASSIGNMENT[0]?.version ?? 0}`;
      })
      .toBe("3:3");
  });

  test("Admin bulk mark-reviewed updates eligible rows only and returns accurate summary", async ({
    page,
  }) => {
    const fixtures = resolveStep232Fixtures();

    await page.goto(
      buildQueueUrl(fixtures.tenantSlug, {
        status: "ALL",
        search: fixtures.bulkSearchTerm,
      }),
    );
    await expect(page.getByTestId("staff-homework-queue-admin")).toBeVisible();

    for (const rowId of [
      fixtures.homeworkItemIds.bulkEligible,
      fixtures.homeworkItemIds.bulkReviewed,
      fixtures.homeworkItemIds.bulkAssigned,
    ]) {
      await page
        .getByTestId(`staff-homework-row-${rowId}`)
        .locator('input[type="checkbox"]')
        .first()
        .check();
    }

    await page.getByRole("button", { name: /mark reviewed/i }).first().click();
    await expect(page.getByText(/mark selected as reviewed/i)).toBeVisible();

    const bulkResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/homework/bulk/mark-reviewed") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /confirm/i }).first().click();
    const bulkResponse = await bulkResponsePromise;
    expect(bulkResponse.status()).toBe(200);

    const bulkPayload = (await bulkResponse.json()) as {
      reviewedCount: number;
      skippedNotSubmittedCount: number;
    };
    expect(bulkPayload.reviewedCount).toBe(1);
    expect(bulkPayload.skippedNotSubmittedCount).toBe(2);

    await expect(
      page.getByText(/marked 1\. skipped 2/i),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const eligible = await fetchAdminHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.bulkEligible,
        );
        const reviewed = await fetchAdminHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.bulkReviewed,
        );
        const assigned = await fetchAdminHomeworkDetail(
          page,
          fixtures.tenantSlug,
          fixtures.homeworkItemIds.bulkAssigned,
        );
        return `${eligible.status}:${reviewed.status}:${assigned.status}`;
      })
      .toBe("REVIEWED:REVIEWED:ASSIGNED");
  });
});
