import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Prisma 7 requires a driver adapter (Prisma Postgres -> PrismaPg + pg)
const adapter = new PrismaPg({
  connectionString,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaSignature: string | undefined;
};

function getSchemaSignature() {
  try {
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
    const schemaContents = readFileSync(schemaPath, "utf8");
    return createHash("sha1").update(schemaContents).digest("hex");
  } catch {
    // Fallback keeps client initialization resilient if schema reads fail in unusual runtimes.
    return "schema-signature-unavailable";
  }
}

const currentSchemaSignature = getSchemaSignature();
const shouldRefreshClient =
  !globalForPrisma.prisma ||
  globalForPrisma.prismaSchemaSignature !== currentSchemaSignature;

let prismaClient: PrismaClient;

if (shouldRefreshClient) {
  // Dev-only safety: refresh cached Prisma client when schema changes to avoid stale model metadata.
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => {
      // Ignore disconnect races during hot reload; a fresh client is created below.
    });
  }

  prismaClient = new PrismaClient({
    adapter,
    // log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });
  globalForPrisma.prisma = prismaClient;
  globalForPrisma.prismaSchemaSignature = currentSchemaSignature;
} else {
  prismaClient = globalForPrisma.prisma!;
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaSignature = currentSchemaSignature;
}
