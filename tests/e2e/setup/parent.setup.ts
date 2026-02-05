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
  await loginAsParentWithAccessCode(
    page,
    fixtures.tenantSlug,
    fixtures.parentA1Email,
    fixtures.accessCode,
  );
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
