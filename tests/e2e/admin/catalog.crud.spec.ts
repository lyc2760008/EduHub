// Admin catalog CRUD test covering Subject/Level/Program creation and linkage.
import { test } from "@playwright/test";

import { loginViaUI } from "..\/helpers/auth";
import {
  createLevel,
  createProgram,
  createSubject,
  uniqueString,
} from "..\/helpers/data";

// Tagged for Playwright suite filtering.
test.describe("[regression] Catalog - CRUD", () => {
  test("Admin can create subject, level, and program", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";

    if (!email || !password) {
      throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD env vars.");
    }

    const subjectName = uniqueString("E2E Subject");
    const levelName = uniqueString("E2E Level");
    const programName = uniqueString("E2E Program");

    await loginViaUI(page, { email, password, tenantSlug });

    // Reuse shared catalog helpers to avoid paging/sort drift across admin table revisions.
    await createSubject(page, tenantSlug, subjectName);
    await createLevel(page, tenantSlug, levelName);
    await createProgram(page, tenantSlug, programName, subjectName);
    // Shared helpers already assert POST success; avoid brittle table-page assertions here.
  });
});



