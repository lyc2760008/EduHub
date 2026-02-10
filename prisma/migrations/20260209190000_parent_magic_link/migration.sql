-- Drop access-code columns from parent accounts (deprecated in favor of magic links).
ALTER TABLE "Parent" DROP COLUMN "accessCodeHash",
DROP COLUMN "accessCodeUpdatedAt";

-- Create magic link token table for parent passwordless auth.
CREATE TABLE "ParentMagicLinkToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "rememberMe" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdIpHash" TEXT,

    CONSTRAINT "ParentMagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- Create rate limit event table for auth throttling without PII.
CREATE TABLE "AuthRateLimitEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tenantId" TEXT,
    "ipHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes for magic link tokens.
CREATE UNIQUE INDEX "ParentMagicLinkToken_tokenHash_key" ON "ParentMagicLinkToken"("tokenHash");
CREATE INDEX "ParentMagicLinkToken_tenantId_parentUserId_idx" ON "ParentMagicLinkToken"("tenantId", "parentUserId");
CREATE INDEX "ParentMagicLinkToken_expiresAt_idx" ON "ParentMagicLinkToken"("expiresAt");
CREATE INDEX "ParentMagicLinkToken_consumedAt_idx" ON "ParentMagicLinkToken"("consumedAt");

-- Indexes for rate limit events.
CREATE INDEX "AuthRateLimitEvent_kind_createdAt_idx" ON "AuthRateLimitEvent"("kind", "createdAt");
CREATE INDEX "AuthRateLimitEvent_kind_ipHash_createdAt_idx" ON "AuthRateLimitEvent"("kind", "ipHash", "createdAt");
CREATE INDEX "AuthRateLimitEvent_kind_emailHash_createdAt_idx" ON "AuthRateLimitEvent"("kind", "emailHash", "createdAt");

-- Foreign keys for magic link tokens.
ALTER TABLE "ParentMagicLinkToken" ADD CONSTRAINT "ParentMagicLinkToken_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ParentMagicLinkToken" ADD CONSTRAINT "ParentMagicLinkToken_parentUserId_fkey"
FOREIGN KEY ("parentUserId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign key for rate limit events (tenant optional).
ALTER TABLE "AuthRateLimitEvent" ADD CONSTRAINT "AuthRateLimitEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
