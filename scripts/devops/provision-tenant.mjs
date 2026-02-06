// DevOps wrapper to provision tenants using DIRECT_URL (avoid logging secrets).
import { spawn } from "node:child_process";

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  console.error("DIRECT_URL is required to provision tenants safely.");
  process.exit(1);
}

const args = process.argv.slice(2);

console.log(
  "Provisioning tenant with DIRECT_URL override. If a one-time password is printed, do not paste it into git logs.",
);

const env = {
  ...process.env,
  DATABASE_URL: directUrl,
};

const child = spawn("pnpm", ["provision:tenant", ...args], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error("Provisioning failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
