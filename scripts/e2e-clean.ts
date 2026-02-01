// Script entrypoint for cleaning data in the dedicated e2e tenant.
import "dotenv/config";

import { prisma } from "../src/lib/db/prisma";
import { cleanupE2ETenantData } from "../tests/e2e/helpers/e2eTenant";

async function main() {
  await cleanupE2ETenantData(prisma);
  console.log("E2E tenant cleanup complete.");
}

main()
  .catch((error) => {
    console.error("E2E cleanup failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
