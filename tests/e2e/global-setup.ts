// Playwright global setup seeds deterministic E2E fixtures for the e2e tenant.
import { execSync } from "node:child_process";

export default async function globalSetup() {
  // Allow staging/prod runs to skip seeding by setting E2E_SKIP_SEED=1.
  if (process.env.E2E_SKIP_SEED === "1" || process.env.E2E_SKIP_SEED === "true") {
    console.log("Skipping E2E seed (E2E_SKIP_SEED enabled).");
    return;
  }
  // Spawn the existing seed script to avoid ESM/CJS Prisma client conflicts in the test runner.
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  execSync(`${pnpmCommand} e2e:seed`, { stdio: "inherit" });
}
