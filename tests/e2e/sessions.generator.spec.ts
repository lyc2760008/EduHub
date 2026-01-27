// Admin generator test covering dry run, commit, and duplicate protection.
import { expect, test } from "@playwright/test";
import { DateTime } from "luxon";

import { loginViaUI } from "./helpers/auth";
import { buildTenantApiPath } from "./helpers/tenant";

type Center = { id: string; name: string };
type User = { id: string; role: string; centers: Center[] };
type Student = { id: string };

test.describe("Sessions - generator", () => {
  test("Admin can dry run and commit recurring sessions", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "demo";

    if (!email || !password) {
      throw new Error(
        "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.",
      );
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
    const users = (await usersResponse.json()) as User[];
    const tutor = users.find(
      (user) => user.role === "Tutor" && user.centers.length,
    );
    if (!tutor) {
      throw new Error(
        "No tutor with center assignment available for generator test.",
      );
    }

    const tutorCenterId =
      tutor.centers.find((assigned) => assigned.id === center.id)?.id ||
      tutor.centers[0]?.id;
    if (!tutorCenterId) {
      throw new Error("Tutor is missing a center assignment.");
    }

    const studentsResponse = await page.request.get(
      buildTenantApiPath(tenantSlug, "/api/students"),
    );
    expect(studentsResponse.status()).toBe(200);
    const studentsPayload = (await studentsResponse.json()) as {
      students: Student[];
    };
    const student = studentsPayload.students[0];
    if (!student) {
      throw new Error("No students available for generator test.");
    }

    const timezone = "America/Edmonton";
    const startDate = DateTime.now()
      .setZone(timezone)
      .plus({ days: 3 })
      .startOf("day");
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
      dryRun: true,
    };

    const dryRunResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: payload },
    );
    expect(dryRunResponse.status()).toBe(200);
    const dryRunBody = await dryRunResponse.json();
    expect(dryRunBody.dryRun).toBe(true);
    expect(dryRunBody.totalOccurrences).toBe(1);
    expect(dryRunBody.occurrences).toHaveLength(1);

    const commitResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: { ...payload, dryRun: false } },
    );
    expect(commitResponse.status()).toBe(200);
    const commitBody = await commitResponse.json();
    expect(commitBody.dryRun).toBe(false);
    expect(commitBody.totalOccurrences).toBe(1);
    expect(commitBody.createdCount + commitBody.skippedCount).toBe(1);

    const duplicateResponse = await page.request.post(
      buildTenantApiPath(tenantSlug, "/api/sessions/generate"),
      { data: { ...payload, dryRun: false } },
    );
    expect(duplicateResponse.status()).toBe(200);
    const duplicateBody = await duplicateResponse.json();
    expect(duplicateBody.createdCount).toBe(0);
    expect(duplicateBody.skippedCount).toBe(1);
  });
});
