// DevOps helper to run Prisma migrations using DIRECT_URL (no secrets printed).
import { spawn } from "node:child_process";

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  console.error("DIRECT_URL is required to run migrations safely.");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: directUrl,
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log("Running Prisma migrate deploy with DIRECT_URL override.");
  await run("pnpm", ["prisma", "migrate", "deploy"]);
  await run("pnpm", ["prisma", "migrate", "status"]);
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
