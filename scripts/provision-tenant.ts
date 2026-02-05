// Provision a new tenant and owner user for pilot go-live (safe, repeatable, and minimal).
import "dotenv/config";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/generated/prisma/client";

type Args = {
  tenantSlug: string;
  tenantName: string;
  ownerEmail: string;
  ownerName?: string;
  timeZone?: string;
  supportEmail?: string;
  supportPhone?: string;
  dryRun: boolean;
  allowExistingUser: boolean;
};

const USAGE = `\nUsage: pnpm provision:tenant --tenantSlug <slug> --tenantName <name> --ownerEmail <email> [options]\n\nOptions:\n  --ownerName <name>          Optional display name for the owner user.\n  --timeZone <IANA>            Optional tenant timezone (ex: America/Edmonton).\n  --supportEmail <email>       Optional support email shown in the portal.\n  --supportPhone <phone>       Optional support phone shown in the portal.\n  --allowExistingUser          Allow linking an existing user via tenant membership.\n  --dryRun                     Print actions without writing to the database.\n  --help                       Show this help text.\n`;

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);

    if (key === "dryRun" || key === "allowExistingUser" || key === "help") {
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
    console.log(USAGE);
    process.exit(0);
  }

  const tenantSlug = String(raw.tenantSlug || "").trim().toLowerCase();
  const tenantName = String(raw.tenantName || "").trim();
  const ownerEmail = String(raw.ownerEmail || "").trim().toLowerCase();
  const ownerName = raw.ownerName ? String(raw.ownerName).trim() : undefined;
  const timeZone = raw.timeZone ? String(raw.timeZone).trim() : undefined;
  const supportEmail = raw.supportEmail
    ? String(raw.supportEmail).trim()
    : undefined;
  const supportPhone = raw.supportPhone
    ? String(raw.supportPhone).trim()
    : undefined;

  return {
    tenantSlug,
    tenantName,
    ownerEmail,
    ownerName,
    timeZone,
    supportEmail,
    supportPhone,
    dryRun: Boolean(raw.dryRun),
    allowExistingUser: Boolean(raw.allowExistingUser),
  };
}

function assertRequired(label: string, value: string) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function generateOneTimePassword() {
  // Base64url keeps the credential copyable without special characters.
  return randomBytes(12).toString("base64url");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  assertRequired("tenantSlug", args.tenantSlug);
  assertRequired("tenantName", args.tenantName);
  assertRequired("ownerEmail", args.ownerEmail);

  if (!isValidSlug(args.tenantSlug)) {
    throw new Error(
      "tenantSlug must be lowercase and contain only letters, numbers, and dashes.",
    );
  }

  if (!isValidEmail(args.ownerEmail)) {
    throw new Error("ownerEmail must be a valid email address.");
  }

  if (args.supportEmail && !isValidEmail(args.supportEmail)) {
    throw new Error("supportEmail must be a valid email address.");
  }

  if (args.timeZone && !isValidTimeZone(args.timeZone)) {
    throw new Error("timeZone must be a valid IANA timezone.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: args.tenantSlug },
      select: { id: true },
    });

    if (existingTenant) {
      throw new Error(`Tenant slug already exists: ${args.tenantSlug}`);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: args.ownerEmail },
      select: { id: true, email: true },
    });

    if (existingUser && !args.allowExistingUser) {
      throw new Error(
        "ownerEmail already exists. Use --allowExistingUser to link membership explicitly.",
      );
    }

    if (args.dryRun) {
      console.log("Dry run: no changes will be written.");
      console.log(
        JSON.stringify(
          {
            tenantSlug: args.tenantSlug,
            tenantName: args.tenantName,
            ownerEmail: args.ownerEmail,
            ownerName: args.ownerName ?? null,
            timeZone: args.timeZone ?? null,
            supportEmail: args.supportEmail ?? null,
            supportPhone: args.supportPhone ?? null,
            allowExistingUser: args.allowExistingUser,
          },
          null,
          2,
        ),
      );
      return;
    }

    const oneTimePassword = existingUser ? null : generateOneTimePassword();

    // Reuse the repo's bcrypt credential hashing (same as auth/seed behavior).
    const passwordHash = oneTimePassword
      ? await bcrypt.hash(oneTimePassword, 10)
      : null;

    const result = await prisma.$transaction(async (tx) => {
      // Create the tenant only; centers and catalog data are added manually later.
      const tenant = await tx.tenant.create({
        data: {
          name: args.tenantName,
          slug: args.tenantSlug,
        },
      });

      if (args.timeZone || args.supportEmail || args.supportPhone) {
        // Update support fields via SQL to avoid dependency on regenerated Prisma types.
        await tx.$executeRaw`
          UPDATE "Tenant"
          SET "timeZone" = ${args.timeZone ?? null},
              "supportEmail" = ${args.supportEmail ?? null},
              "supportPhone" = ${args.supportPhone ?? null}
          WHERE "id" = ${tenant.id}
        `;
      }

      if (!existingUser && !passwordHash) {
        throw new Error("Password hash missing for new owner user.");
      }

      const user = existingUser
        ? await tx.user.findUniqueOrThrow({
            where: { id: existingUser.id },
            select: { id: true, email: true },
          })
        : await tx.user.create({
            data: {
              email: args.ownerEmail,
              name: args.ownerName,
              passwordHash: passwordHash!,
            },
            select: { id: true, email: true },
          });

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: Role.Owner,
        },
      });

      return { tenant, user, membership };
    });

    console.log("Tenant provisioned successfully.");
    console.log(`Tenant ID: ${result.tenant.id}`);
    console.log(`Tenant slug: ${args.tenantSlug}`);
    console.log(`Owner user ID: ${result.user.id}`);
    console.log(`Owner email: ${result.user.email}`);

    if (oneTimePassword) {
      console.log("One-time password (store securely, shown once):");
      console.log(oneTimePassword);
    } else {
      console.log("Owner user already existed; no password was changed.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Provisioning failed:", error instanceof Error ? error.message : error);
  console.log(USAGE);
  process.exitCode = 1;
});

