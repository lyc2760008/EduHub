import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Prisma 7 requires a driver adapter for Postgres in Node runtimes.
const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  // Seed inputs (defaults allow local dev without extra config).
  const tenantSlug = process.env.SEED_DEMO_TENANT_SLUG || "demo";
  const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@demo.local";
  const ownerName = (process.env.SEED_OWNER_NAME || "").trim() || undefined;
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;

  // Fail fast if password is missing to avoid creating unusable accounts.
  if (!ownerPassword) {
    throw new Error("SEED_OWNER_PASSWORD is required for seed");
  }

  const tenantName = tenantSlug === "demo" ? "Demo Tenant" : tenantSlug;

  // Idempotent: upsert tenant by unique slug (safe to re-run locally).
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName },
    create: { slug: tenantSlug, name: tenantName },
  });

  // Reuse existing password hash if it already matches the env password.
  // This avoids re-hashing on every seed run while still honoring password changes.
  const existingUser = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  let passwordHash = existingUser?.passwordHash;

  if (!passwordHash || !(await bcrypt.compare(ownerPassword, passwordHash))) {
    // Hash with bcrypt (10 rounds) only when needed.
    passwordHash = await bcrypt.hash(ownerPassword, 10);
  }

  // Idempotent: upsert user by unique email for repeatable seeding.
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      passwordHash,
      ...(ownerName ? { name: ownerName } : {}),
    },
    create: {
      email: ownerEmail,
      passwordHash,
      ...(ownerName ? { name: ownerName } : {}),
    },
  });

  // Idempotent: upsert membership by (tenantId, userId) composite key.
  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    update: {
      role: "Owner",
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: "Owner",
    },
  });

  console.log(`Seeded tenant '${tenant.slug}' and owner '${user.email}'.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
