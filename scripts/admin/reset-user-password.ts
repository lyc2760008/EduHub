// Admin utility: reset a staff user's password hash (credentials auth).
//
// Why this exists:
// - Multi-line `pnpm tsx -e "..."` snippets can be unreliable in Windows shells.
// - A script file is repeatable and easier to audit/re-run.
//
// Safety:
// - Requires explicit `--confirm` to perform the write (or `--dryRun`).
// - Verifies the password using bcrypt compare after update (no secrets printed).
// - Verifies the user is Owner/Admin for the target tenant before changing anything.
//
// Usage (PowerShell):
//   # 1) Point at the environment you want to change (staging/prod/local).
//   #    Prefer a direct/non-pooler write URL for production operations when available.
//   $env:DATABASE_URL="<TARGET_DATABASE_URL>"
//
//   # 2) Set the new password (do not commit or paste into files).
//   $env:NEW_PASSWORD="<NEW_STRONG_PASSWORD>"
//
//   # 3) Dry run first (no writes).
//   pnpm tsx scripts/admin/reset-user-password.ts --tenantSlug <tenantSlug> --email <userEmail> --dryRun
//
//   # 4) Apply (writes).
//   pnpm tsx scripts/admin/reset-user-password.ts --tenantSlug <tenantSlug> --email <userEmail> --confirm
//
// Examples:
//   pnpm tsx scripts/admin/reset-user-password.ts --tenantSlug mmc --email mmceducationcalgary@gmail.com --confirm
//   pnpm tsx scripts/admin/reset-user-password.ts --tenantSlug demo --email owner@demo.local --confirm
//
// Guardrails:
// - The script requires the user to be Owner/Admin in the provided tenantSlug (prevents accidental resets).
// - `User` is global in this schema; changing the password affects that email across all tenant memberships.
// - The script prints the DB host/db name so you can verify you targeted the correct environment.
//
// Notes:
// - `User` is global in this schema. Changing a password affects that email across all tenants.
// - Prefer the DB provider's direct (non-pooler) write URL for production operations.

import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";

type Args = {
  tenantSlug: string;
  email: string;
  confirm: boolean;
  dryRun: boolean;
};

const USAGE = `
Usage:
  pnpm tsx scripts/admin/reset-user-password.ts --tenantSlug <slug> --email <email> [--confirm] [--dryRun]

Environment variables:
  DATABASE_URL   Postgres connection string (required)
  NEW_PASSWORD   New password (required unless --dryRun)

Flags:
  --confirm      Required to write changes to the database (otherwise exits with an error).
  --dryRun       Performs validation and prints what would change without writing.
  --help         Prints this message.
`;

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);

    if (key === "confirm" || key === "dryRun" || key === "help") {
      raw[key] = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }

    raw[key] = value;
    i += 1;
  }

  if (raw.help) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  return {
    tenantSlug: String(raw.tenantSlug ?? "")
      .trim()
      .toLowerCase(),
    email: String(raw.email ?? "")
      .trim()
      .toLowerCase(),
    confirm: Boolean(raw.confirm),
    dryRun: Boolean(raw.dryRun),
  };
}

function assertRequired(label: string, value: string) {
  if (!value) throw new Error(`${label} is required.`);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  assertRequired("tenantSlug", args.tenantSlug);
  assertRequired("email", args.email);

  if (!isValidEmail(args.email)) {
    throw new Error("email must be a valid email address.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!args.dryRun && !args.confirm) {
    throw new Error("Refusing to write without --confirm (or use --dryRun).");
  }

  const newPassword = process.env.NEW_PASSWORD || "";
  if (!args.dryRun) {
    assertRequired("NEW_PASSWORD", newPassword);
  }

  console.log("Connecting...");
  const url = new URL(databaseUrl);
  console.log("Connected to:", {
    host: url.host,
    db: url.pathname.replace("/", ""),
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: args.tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new Error(`Tenant not found: ${args.tenantSlug}`);

    const user = await prisma.user.findFirst({
      // Case-insensitive lookup guards against older mixed-case email records.
      where: { email: { equals: args.email, mode: "insensitive" } },
      select: { id: true, email: true, updatedAt: true, passwordHash: true },
    });
    if (!user) throw new Error(`User not found: ${args.email}`);

    const membership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    if (!membership) throw new Error(`No membership in tenant ${tenant.slug}`);
    if (membership.role !== "Owner" && membership.role !== "Admin") {
      throw new Error(
        `User is not Owner/Admin in tenant ${tenant.slug} (role=${membership.role}).`,
      );
    }

    if (args.dryRun) {
      console.log("Dry run OK:", {
        tenantSlug: tenant.slug,
        email: user.email,
        role: membership.role,
        userId: user.id,
        updatedAt: user.updatedAt.toISOString(),
      });
      return;
    }

    const beforeOk = await bcrypt.compare(newPassword, user.passwordHash);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
      select: { updatedAt: true, passwordHash: true },
    });

    const afterOk = await bcrypt.compare(newPassword, updated.passwordHash);

    console.log("Result:", {
      tenantSlug: tenant.slug,
      email: user.email,
      role: membership.role,
      beforeOk,
      afterOk,
      updatedAtBefore: user.updatedAt.toISOString(),
      updatedAtAfter: updated.updatedAt.toISOString(),
    });

    if (!afterOk) {
      throw new Error(
        "Password update did not verify; this usually indicates the DB URL is not the one your app is using.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    "Reset failed:",
    error instanceof Error ? error.message : String(error),
  );
  console.log(USAGE.trim());
  process.exitCode = 1;
});
