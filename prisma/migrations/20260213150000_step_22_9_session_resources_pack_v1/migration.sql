-- CreateEnum
CREATE TYPE "SessionResourceType" AS ENUM ('HOMEWORK', 'WORKSHEET', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "SessionResourceCreatedByRole" AS ENUM ('ADMIN', 'TUTOR', 'SYSTEM');

-- CreateTable
CREATE TABLE "SessionResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SessionResourceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdByRole" "SessionResourceCreatedByRole" NOT NULL,

    CONSTRAINT "SessionResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionResource_tenantId_sessionId_idx" ON "SessionResource"("tenantId", "sessionId");

-- AddForeignKey
ALTER TABLE "SessionResource" ADD CONSTRAINT "SessionResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionResource" ADD CONSTRAINT "SessionResource_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionResource" ADD CONSTRAINT "SessionResource_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
