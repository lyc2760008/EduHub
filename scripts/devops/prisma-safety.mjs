// Shared safety helpers for Prisma commands that can overwrite local data.
import "dotenv/config";

import { spawn } from "node:child_process";

const DEFAULT_SAFE_DB_REGEX = "(sandbox|scratch|seed|e2e|test|tmp)";
const DEFAULT_PROTECTED_DB_NAMES = "eduhub_dev,eduhub,postgres,template0,template1";

export function isTruthyFlag(value) {
  return /^(1|true|yes)$/i.test((value ?? "").trim());
}

function parseCsv(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractDatabaseName(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
  } catch {
    // Fallback parser keeps guards working for uncommon connection string formats.
    const noQuery = databaseUrl.split("?")[0] || "";
    const segments = noQuery.split("/");
    return (segments[segments.length - 1] || "").trim();
  }
}

export function getPrismaSafetyContext() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const databaseName = extractDatabaseName(databaseUrl);
  if (!databaseName) {
    throw new Error("Unable to parse the database name from DATABASE_URL.");
  }

  const safeRegexSource = process.env.PRISMA_SAFE_DB_REGEX || DEFAULT_SAFE_DB_REGEX;
  let safeRegex;
  try {
    safeRegex = new RegExp(safeRegexSource, "i");
  } catch (error) {
    throw new Error(
      `Invalid PRISMA_SAFE_DB_REGEX value '${safeRegexSource}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const protectedDbNames = new Set(
    parseCsv(process.env.PRISMA_PROTECTED_DB_NAMES || DEFAULT_PROTECTED_DB_NAMES).map((name) =>
      name.toLowerCase(),
    ),
  );
  const normalizedDatabaseName = databaseName.toLowerCase();

  return {
    databaseName,
    safeRegexSource,
    isSafeByPattern: safeRegex.test(databaseName),
    isProtectedByName: protectedDbNames.has(normalizedDatabaseName),
  };
}

export async function runPrismaCommand(args) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["prisma", ...args], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pnpm prisma ${args.join(" ")} exited with code ${code}`));
    });
  });
}
