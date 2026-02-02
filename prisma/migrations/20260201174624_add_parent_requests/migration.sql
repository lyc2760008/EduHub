-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('ABSENCE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "ParentRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCode" TEXT NOT NULL,
    "message" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentRequest_tenantId_status_createdAt_idx" ON "ParentRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ParentRequest_tenantId_parentId_createdAt_idx" ON "ParentRequest"("tenantId", "parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParentRequest_tenantId_studentId_sessionId_type_key" ON "ParentRequest"("tenantId", "studentId", "sessionId", "type");

-- AddForeignKey
ALTER TABLE "ParentRequest" ADD CONSTRAINT "ParentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentRequest" ADD CONSTRAINT "ParentRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentRequest" ADD CONSTRAINT "ParentRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentRequest" ADD CONSTRAINT "ParentRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentRequest" ADD CONSTRAINT "ParentRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
