// Seed script for demo tenants, users, roles, and default center data.
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
  const demoTenantSlug = process.env.SEED_DEMO_TENANT_SLUG || "demo";
  const demoTenantName =
    process.env.SEED_DEMO_TENANT_NAME ||
    (demoTenantSlug === "demo" ? "Demo Tenant" : demoTenantSlug);
  const acmeTenantSlug = process.env.SEED_SECOND_TENANT_SLUG || "acme";
  const acmeTenantName =
    process.env.SEED_SECOND_TENANT_NAME ||
    (acmeTenantSlug === "acme" ? "Acme Tenant" : acmeTenantSlug);

  const demoOwnerEmail = process.env.SEED_OWNER_EMAIL || "owner@demo.local";
  const demoTutorEmail = process.env.SEED_TUTOR_EMAIL || "tutor@demo.local";
  const demoParentEmail = process.env.SEED_PARENT_EMAIL || "parent@demo.local";
  const acmeOwnerEmail =
    process.env.SEED_ACME_OWNER_EMAIL || "owner@acme.local";

  const demoOwnerName = (process.env.SEED_OWNER_NAME || "").trim() || undefined;
  const demoTutorName = (process.env.SEED_TUTOR_NAME || "").trim() || undefined;
  const demoParentName =
    (process.env.SEED_PARENT_NAME || "").trim() || undefined;
  const acmeOwnerName =
    (process.env.SEED_ACME_OWNER_NAME || "").trim() || undefined;

  const defaultPassword =
    process.env.SEED_DEFAULT_PASSWORD || process.env.SEED_OWNER_PASSWORD;

  // Fail fast if a default password is missing to avoid unusable accounts.
  if (!defaultPassword) {
    throw new Error(
      "SEED_DEFAULT_PASSWORD (or SEED_OWNER_PASSWORD) is required for seed"
    );
  }

  const demoOwnerPassword = process.env.SEED_OWNER_PASSWORD || defaultPassword;
  const demoTutorPassword = process.env.SEED_TUTOR_PASSWORD || defaultPassword;
  const demoParentPassword =
    process.env.SEED_PARENT_PASSWORD || defaultPassword;
  const acmeOwnerPassword =
    process.env.SEED_ACME_OWNER_PASSWORD || defaultPassword;

  async function upsertTenant(slug: string, name: string) {
    // Idempotent: upsert tenant by unique slug (safe to re-run locally).
    return prisma.tenant.upsert({
      where: { slug },
      update: { name },
      create: { slug, name },
    });
  }

  async function resolvePasswordHash(email: string, password: string) {
    // Reuse existing password hash if it already matches the env password.
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (
      existingUser?.passwordHash &&
      (await bcrypt.compare(password, existingUser.passwordHash))
    ) {
      return existingUser.passwordHash;
    }

    // Hash with bcrypt (10 rounds) only when needed.
    return bcrypt.hash(password, 10);
  }

  async function upsertUser(params: {
    email: string;
    password: string;
    name?: string;
  }) {
    const passwordHash = await resolvePasswordHash(
      params.email,
      params.password
    );

    // Idempotent: upsert user by unique email for repeatable seeding.
    return prisma.user.upsert({
      where: { email: params.email },
      update: {
        passwordHash,
        ...(params.name ? { name: params.name } : {}),
      },
      create: {
        email: params.email,
        passwordHash,
        ...(params.name ? { name: params.name } : {}),
      },
    });
  }

  const demoTenant = await upsertTenant(demoTenantSlug, demoTenantName);
  const acmeTenant = await upsertTenant(acmeTenantSlug, acmeTenantName);

  const demoOwner = await upsertUser({
    email: demoOwnerEmail,
    password: demoOwnerPassword,
    name: demoOwnerName,
  });
  const demoTutor = await upsertUser({
    email: demoTutorEmail,
    password: demoTutorPassword,
    name: demoTutorName,
  });
  const demoParent = await upsertUser({
    email: demoParentEmail,
    password: demoParentPassword,
    name: demoParentName,
  });
  const acmeOwner = await upsertUser({
    email: acmeOwnerEmail,
    password: acmeOwnerPassword,
    name: acmeOwnerName,
  });

  const memberships = [
    { tenantId: demoTenant.id, userId: demoOwner.id, role: "Owner" as const },
    { tenantId: demoTenant.id, userId: demoTutor.id, role: "Tutor" as const },
    { tenantId: demoTenant.id, userId: demoParent.id, role: "Parent" as const },
    { tenantId: acmeTenant.id, userId: acmeOwner.id, role: "Owner" as const },
  ];

  // Idempotent: upsert memberships by (tenantId, userId) composite key.
  await Promise.all(
    memberships.map((membership) =>
      prisma.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId: membership.tenantId,
            userId: membership.userId,
          },
        },
        update: {
          role: membership.role,
        },
        create: membership,
      })
    )
  );

  // Idempotent: upsert a default center for the demo tenant by (tenantId, name).
  const centerName = "Default Center";
  const centerTimezone = "America/Edmonton";

  await prisma.center.upsert({
    where: {
      tenantId_name: {
      tenantId: demoTenant.id,
      name: centerName,
    },
  },
  update: {
    timezone: centerTimezone,
    isActive: true,
  },
  create: {
      tenantId: demoTenant.id,
      name: centerName,
      timezone: centerTimezone,
      isActive: true,
    },
  });

  console.log(
    `Seeded tenants '${demoTenant.slug}' + '${acmeTenant.slug}', users, memberships, and center '${centerName}'.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
