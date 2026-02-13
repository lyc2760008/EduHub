// Guard prisma migrate dev so schema generation runs only against disposable DBs by default.
import {
  getPrismaSafetyContext,
  isTruthyFlag,
  runPrismaCommand,
} from "./prisma-safety.mjs";

async function main() {
  const args = process.argv.slice(2);
  const context = getPrismaSafetyContext();
  const allowAnyDatabase = isTruthyFlag(process.env.PRISMA_MIGRATE_DEV_ALLOW_ANY_DB);
  const shouldBlock =
    !allowAnyDatabase && (context.isProtectedByName || !context.isSafeByPattern);

  if (shouldBlock) {
    console.error(
      [
        "Blocked prisma migrate dev on a protected/non-sandbox database.",
        `- DATABASE_URL db name: ${context.databaseName}`,
        `- PRISMA_SAFE_DB_REGEX: ${context.safeRegexSource}`,
        "",
        "Use a disposable DB for migration generation (recommended), or explicitly override once:",
        "  PRISMA_MIGRATE_DEV_ALLOW_ANY_DB=1 pnpm prisma:migrate -- --name <migration_name>",
      ].join("\n"),
    );
    process.exit(1);
  }

  await runPrismaCommand(["migrate", "dev", ...args]);
}

main().catch((error) => {
  console.error(
    "Safe migrate wrapper failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
