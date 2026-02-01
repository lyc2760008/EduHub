// Script entrypoint for seeding the dedicated e2e tenant fixtures.
import "dotenv/config";

import { prisma } from "../src/lib/db/prisma";
import { upsertE2EFixtures } from "../tests/e2e/helpers/e2eTenant";

async function main() {
  const result = await upsertE2EFixtures(prisma);
  console.log(
    `E2E fixtures ready for tenant ${result.tenantSlug} (A0=${result.parentA0Email}, A1=${result.parentA1Email}).`,
  );
}

main()
  .catch((error) => {
    console.error("E2E seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
