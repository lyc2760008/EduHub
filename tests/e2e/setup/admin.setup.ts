// Playwright setup that stores an authenticated admin session for reuse across admin projects.
import { promises as fs } from "node:fs";
import path from "node:path";

import { test as setup } from "@playwright/test";

import { loginAsAdmin } from "../helpers/auth";

const STORAGE_STATE_PATH = path.join("tests", "e2e", ".auth", "admin.json");

setup("Admin storage state", async ({ page }) => {
  // Ensure the auth directory exists before writing storage state.
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await loginAsAdmin(page);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
