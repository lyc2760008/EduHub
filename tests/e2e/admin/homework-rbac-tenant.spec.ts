// Step 23.2 security E2E consolidates cross-tenant/RBAC/download-auth checks and sensitive-pattern scans.
import { expect, test } from "@playwright/test";

import { findSensitiveMatch } from "../helpers/audit";
import { findHomeworkLeakMatch } from "../helpers/homework";
import { loginAsTutorViaApi } from "../helpers/auth";
import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveStep232Fixtures } from "../helpers/step232";
import { buildTenantApiPath, buildTenantPath } from "../helpers/tenant";

const BLOCKED_STATUSES = [401, 403, 404];
// Multipart probes can fail validation before authorization checks; either outcome is acceptable for deny-path tests.
const BLOCKED_OR_INVALID_STATUSES = [400, ...BLOCKED_STATUSES];

function expectNoSensitiveResponseText(value: string) {
  // Shared regex scan checks for tokens/cookies/password markers without printing the payload body.
  expect(findSensitiveMatch(value)).toBeNull();
}

test.describe("[regression] Step 23.2 homework RBAC + tenant isolation", () => {
  test("Cross-tenant and ownership boundaries are enforced for list/detail/upload/download", async ({
    page,
    browser,
  }) => {
    const fixtures = resolveStep232Fixtures();
    // List response should remain scoped to the active tenant and never leak known cross-tenant fixture IDs.
    const adminTenantList = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/homework"),
    );
    expect(adminTenantList.status()).toBe(200);
    const adminTenantListPayload = (await adminTenantList.json()) as {
      rows?: Array<{ homeworkItemId?: string }>;
    };
    const adminTenantRowIds = (adminTenantListPayload.rows ?? []).map((row) => row.homeworkItemId);
    expect(adminTenantRowIds).not.toContain(fixtures.crossTenantHomeworkItemId);

    const adminCrossTenantList = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/homework/${fixtures.crossTenantHomeworkItemId}`,
      ),
    );
    expect(BLOCKED_STATUSES).toContain(adminCrossTenantList.status());

    const adminCrossTenantDetail = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/homework/files/${fixtures.crossTenantHomeworkItemId}-assignment-v1/download`,
      ),
    );
    expect(BLOCKED_STATUSES).toContain(adminCrossTenantDetail.status());

    const adminCrossTenantUpload = await page.request.post(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/homework/${fixtures.crossTenantHomeworkItemId}/files`,
      ),
      {
        multipart: {
          slot: "ASSIGNMENT",
          file: {
            name: "cross-tenant.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("CROSS_TENANT_UPLOAD_BLOCK"),
          },
        },
      },
    );
    expect(BLOCKED_OR_INVALID_STATUSES).toContain(adminCrossTenantUpload.status());

    const adminCrossTenantDownload = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/homework/${fixtures.crossTenantHomeworkItemId}`,
      ),
    );
    expect(BLOCKED_STATUSES).toContain(adminCrossTenantDownload.status());

    const parentContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000",
    });
    const parentPage = await parentContext.newPage();
    await loginAsParentWithAccessCode(
      parentPage,
      fixtures.tenantSlug,
      fixtures.parentA1Email,
      fixtures.accessCode,
    );

    try {
      const parentUnlinkedDetail = await parentPage.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/${fixtures.homeworkItemIds.parentUnlinked}`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(parentUnlinkedDetail.status());

      const parentUnlinkedUpload = await parentPage.request.post(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/${fixtures.homeworkItemIds.parentUnlinked}/files`,
        ),
        {
          multipart: {
            slot: "SUBMISSION",
            file: {
              name: "unlinked.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("UNLINKED_PARENT_UPLOAD_BLOCK"),
            },
          },
        },
      );
      expect(BLOCKED_OR_INVALID_STATUSES).toContain(parentUnlinkedUpload.status());

      const parentUnlinkedDownload = await parentPage.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/files/${fixtures.homeworkItemIds.parentUnlinked}-assignment-v1/download`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(parentUnlinkedDownload.status());

      const parentCrossTenantList = await parentPage.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/${fixtures.crossTenantHomeworkItemId}`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(parentCrossTenantList.status());

      const parentCrossTenantUpload = await parentPage.request.post(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/${fixtures.crossTenantHomeworkItemId}/files`,
        ),
        {
          multipart: {
            slot: "SUBMISSION",
            file: {
              name: "cross-tenant-parent.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("CROSS_TENANT_PARENT_UPLOAD_BLOCK"),
            },
          },
        },
      );
      expect(BLOCKED_OR_INVALID_STATUSES).toContain(parentCrossTenantUpload.status());

      const parentCrossTenantDownload = await parentPage.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/files/${fixtures.crossTenantHomeworkItemId}-assignment-v1/download`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(parentCrossTenantDownload.status());
    } finally {
      await parentContext.close();
    }

    const tutorContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000",
    });
    const tutorPage = await tutorContext.newPage();
    await loginAsTutorViaApi(tutorPage, fixtures.tenantSlug);

    try {
      const tutorOtherDetail = await tutorPage.request.get(
        buildTenantPath(
          fixtures.tenantSlug,
          `/api/tutor/homework/${fixtures.homeworkItemIds.tutorOther}`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(tutorOtherDetail.status());

      const tutorOtherUpload = await tutorPage.request.post(
        buildTenantPath(
          fixtures.tenantSlug,
          `/api/tutor/homework/${fixtures.homeworkItemIds.tutorOther}/files`,
        ),
        {
          multipart: {
            slot: "FEEDBACK",
            file: {
              name: "other-tutor.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("OTHER_TUTOR_UPLOAD_BLOCK"),
            },
          },
        },
      );
      expect(BLOCKED_OR_INVALID_STATUSES).toContain(tutorOtherUpload.status());

      const tutorOtherDownload = await tutorPage.request.get(
        buildTenantPath(
          fixtures.tenantSlug,
          `/api/tutor/homework/files/${fixtures.homeworkItemIds.tutorOther}-submission-v1/download`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(tutorOtherDownload.status());

      const tutorCrossTenantList = await tutorPage.request.get(
        buildTenantPath(
          fixtures.tenantSlug,
          `/api/tutor/homework/${fixtures.crossTenantHomeworkItemId}`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(tutorCrossTenantList.status());

      const tutorCrossTenantUpload = await tutorPage.request.post(
        buildTenantPath(
          fixtures.tenantSlug,
          `/api/tutor/homework/${fixtures.crossTenantHomeworkItemId}/files`,
        ),
        {
          multipart: {
            slot: "FEEDBACK",
            file: {
              name: "cross-tenant-tutor.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("CROSS_TENANT_TUTOR_UPLOAD_BLOCK"),
            },
          },
        },
      );
      expect(BLOCKED_OR_INVALID_STATUSES).toContain(tutorCrossTenantUpload.status());

      const tutorCrossTenantDownload = await tutorPage.request.get(
        buildTenantPath(
          fixtures.tenantSlug,
          `/api/tutor/homework/files/${fixtures.crossTenantHomeworkItemId}-assignment-v1/download`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(tutorCrossTenantDownload.status());
    } finally {
      await tutorContext.close();
    }

    const unauthContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL || "http://e2e-testing.lvh.me:3000",
    });
    try {
      // Downloads must never be publicly readable without an authenticated session.
      const unauthDownload = await unauthContext.request.get(
        buildTenantApiPath(
          fixtures.tenantSlug,
          `/api/portal/homework/files/${fixtures.homeworkItemIds.parentWithAssignment}-assignment-v1/download`,
        ),
      );
      expect(BLOCKED_STATUSES).toContain(unauthDownload.status());
    } finally {
      await unauthContext.close();
    }
  });

  test("Key JSON responses and CSV exports avoid sensitive patterns", async ({ page }) => {
    const fixtures = resolveStep232Fixtures();

    const adminListResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/homework"),
    );
    expect(adminListResponse.status()).toBe(200);
    expectNoSensitiveResponseText(await adminListResponse.text());

    const adminDetailResponse = await page.request.get(
      buildTenantApiPath(
        fixtures.tenantSlug,
        `/api/admin/homework/${fixtures.homeworkItemIds.parentWithAssignment}`,
      ),
    );
    expect(adminDetailResponse.status()).toBe(200);
    expectNoSensitiveResponseText(await adminDetailResponse.text());

    const reportJsonResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/reports/homework-sla"),
    );
    expect(reportJsonResponse.status()).toBe(200);
    expectNoSensitiveResponseText(await reportJsonResponse.text());

    const reportCsvResponse = await page.request.get(
      buildTenantApiPath(fixtures.tenantSlug, "/api/admin/reports/homework-sla.csv"),
    );
    expect(reportCsvResponse.status()).toBe(200);
    const reportCsv = await reportCsvResponse.text();
    expect(findHomeworkLeakMatch(reportCsv)).toBeNull();
  });
});
