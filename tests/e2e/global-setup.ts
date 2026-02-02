// Playwright global setup seeds deterministic E2E fixtures for the e2e tenant.
import { execSync } from "node:child_process";

export default async function globalSetup() {
  // Spawn the existing seed script to avoid ESM/CJS Prisma client conflicts in the test runner.
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  execSync(`${pnpmCommand} e2e:seed`, { stdio: "inherit" });
}
