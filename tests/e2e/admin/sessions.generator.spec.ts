// Admin generator regression test validates Step 22.7 preview + commit + duplicate handling contract.
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

import { loginViaUI } from "../helpers/auth";
import { buildTenantApiPath } from "../helpers/tenant";

type Center = { id: string; name: string };
type User = { id: string; role: string; centers: Center[] };
type Student = { id: string };

type PreviewResponse = {
  wouldCreateCount: number;
  wouldSkipDuplicateCount: number;
  wouldConflictCount: number;
  range: { from: string; to: string };
};

type CommitResponse = {
  createdCount: number;
  skippedDuplicateCount: number;
  conflictCount: number;
  range: { from: string; to: string };
};

function unwrapRows<T>(payload: unknown): T[] {
  // Several admin list endpoints were upgraded to the Step 21.3 table contract (rows/totalCount/...).
  // Keep this test resilient by accepting either a raw array or a contract-shaped object.
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const maybeRows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(maybeRows)) return maybeRows as T[];
    const maybeItems = (payload as { items?: unknown }).items;
    if (Array.isArray(maybeItems)) return maybeItems as T[];
    const maybeStudents = (payload as { students?: unknown }).students;
    if (Array.isArray(maybeStudents)) return maybeStudents as T[];
  }
  return [];
}

// Tagged for Playwright suite filtering.
test.describe("[slow] [regression] Sessions - generator", () => {
  test("Admin can preview and commit recurring sessions", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    await loginViaUI(page, { email, password, tenantSlug });

    const centersResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/centers"),
    );
    expect(centersResponse.status()).toBe(200);
    const centers = (await centersResponse.json()) as Center[];
    const center = centers[0];
    if (!center) {
      throw new Error("No centers available for generator test.");
    }

    const usersResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/users"),
    );
    expect(usersResponse.status()).toBe(200);
    const usersPayload = (await usersResponse.json()) as unknown;
    const users = unwrapRows<User>(usersPayload);
    const tutor = users.find((user) => user.role === "Tutor" && user.centers.length);
    if (!tutor) {
      throw new Error("No tutor with center assignment available for generator test.");
    }

    const tutorCenterId =
      tutor.centers.find((assigned) => assigned.id === center.id)?.id || tutor.centers[0]?.id;
    if (!tutorCenterId) {
      throw new Error("Tutor is missing a center assignment.");
    }

    const studentsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/students"),
    );
    expect(studentsResponse.status()).toBe(200);
    const studentsPayload = (await studentsResponse.json()) as unknown;
    const student = unwrapRows<Student>(studentsPayload)[0];
    if (!student) {
      throw new Error("No students available for generator test.");
    }

    const timezone = "America/Edmonton";
    // Push far enough out so this spec avoids collisions with near-term seeded sessions.
    const startDate = DateTime.now().setZone(timezone).plus({ days: 60 }).startOf("day");
    const weekday = startDate.weekday;

    const payload = {
      centerId: tutorCenterId,
      tutorId: tutor.id,
      sessionType: "ONE_ON_ONE",
      studentId: student.id,
      startDate: startDate.toISODate(),
      endDate: startDate.toISODate(),
      weekdays: [weekday],
      startTime: "09:00",
      endTime: "10:00",
      timezone,
    };

    const previewResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate/preview"),
      { data: payload },
    );
    expect(previewResponse.status()).toBe(200);
    const previewBody = (await previewResponse.json()) as PreviewResponse;
    expect(previewBody.wouldCreateCount).toBeGreaterThan(0);
    expect(previewBody.wouldSkipDuplicateCount).toBeGreaterThanOrEqual(0);
    expect(previewBody.wouldConflictCount).toBeGreaterThanOrEqual(0);

    const commitResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: payload },
    );
    expect(commitResponse.status()).toBe(200);
    const commitBody = (await commitResponse.json()) as CommitResponse;
    expect(commitBody.createdCount).toBe(previewBody.wouldCreateCount);
    expect(commitBody.skippedDuplicateCount).toBe(previewBody.wouldSkipDuplicateCount);
    expect(commitBody.conflictCount).toBe(previewBody.wouldConflictCount);

    const duplicatePreviewResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate/preview"),
      { data: payload },
    );
    expect(duplicatePreviewResponse.status()).toBe(200);
    const duplicatePreviewBody = (await duplicatePreviewResponse.json()) as PreviewResponse;
    expect(duplicatePreviewBody.wouldCreateCount).toBe(0);
    expect(duplicatePreviewBody.wouldSkipDuplicateCount).toBeGreaterThanOrEqual(1);

    const duplicateCommitResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: payload },
    );
    expect(duplicateCommitResponse.status()).toBe(200);
    const duplicateCommitBody = (await duplicateCommitResponse.json()) as CommitResponse;
    expect(duplicateCommitBody.createdCount).toBe(0);
    expect(duplicateCommitBody.skippedDuplicateCount).toBeGreaterThanOrEqual(1);
  });
});
