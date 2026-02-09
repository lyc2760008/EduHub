// Playwright setup that stores an authenticated parent session for portal projects.
import { promises as fs } from "node:fs";
import path from "node:path";

import { test as setup } from "@playwright/test";

import { loginAsParentWithAccessCode } from "../helpers/parent-auth";
import { resolveStep203Fixtures } from "../helpers/step203";

const STORAGE_STATE_PATH = path.join("tests", "e2e", ".auth", "parent.json");

setup("Parent storage state", async ({ page }) => {
  // Ensure the auth directory exists before writing storage state.
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  const fixtures = resolveStep203Fixtures();
  if (fixtures.tenantSlug !== "e2e-testing") {
    throw new Error(
      `Parent storage state must target e2e-testing; got ${fixtures.tenantSlug}.`,
    );
  }
  const skipSeed = (process.env.E2E_SKIP_SEED || "").trim() === "1";
  const explicitParentEmail = process.env.E2E_PARENT_ACCESS_EMAIL;
  const explicitAccessCode = process.env.E2E_PARENT_ACCESS_CODE;
  // Allow staging runs that skip seeding to authenticate with an explicit parent access-code account.
  const parentEmail =
    skipSeed && explicitParentEmail ? explicitParentEmail : fixtures.parentA1Email;
  const parentAccessCode =
    skipSeed && explicitAccessCode ? explicitAccessCode : fixtures.accessCode;

  await loginAsParentWithAccessCode(
    page,
    fixtures.tenantSlug,
    parentEmail,
    parentAccessCode,
  );
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
