// Guard prisma db seed to avoid accidental password/data overwrite on primary local databases.
import {
  getPrismaSafetyContext,
  isTruthyFlag,
  runPrismaCommand,
} from "./prisma-safety.mjs";

async function main() {
  const args = process.argv.slice(2);
  const context = getPrismaSafetyContext();
  const allowAnyDatabase = isTruthyFlag(process.env.PRISMA_SEED_ALLOW_ANY_DB);
  const shouldBlock =
    !allowAnyDatabase && (context.isProtectedByName || !context.isSafeByPattern);

  if (shouldBlock) {
    console.error(
      [
        "Blocked prisma db seed on a protected/non-sandbox database.",
        `- DATABASE_URL db name: ${context.databaseName}`,
        `- PRISMA_SAFE_DB_REGEX: ${context.safeRegexSource}`,
        "",
        "Seeding can overwrite seeded account passwords and fixture data.",
        "Use a sandbox DB, or explicitly override once:",
        "  PRISMA_SEED_ALLOW_ANY_DB=1 pnpm db:seed",
      ].join("\n"),
    );
    process.exit(1);
  }

  await runPrismaCommand(["db", "seed", ...args]);
}

main().catch((error) => {
  console.error(
    "Safe seed wrapper failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
