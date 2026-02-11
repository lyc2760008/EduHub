// Playwright setup that stores an authenticated tutor session for tutor projects.
import { promises as fs } from "node:fs";
import path from "node:path";

import { test as setup } from "@playwright/test";

import { loginAsTutorViaApi } from "../helpers/auth";

const STORAGE_STATE_PATH = path.join("tests", "e2e", ".auth", "tutor.json");

setup("Tutor storage state", async ({ page }) => {
  // Ensure the auth directory exists before writing storage state.
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  // Use deterministic credentials API login so setup remains stable on STAGING.
  await loginAsTutorViaApi(page);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
