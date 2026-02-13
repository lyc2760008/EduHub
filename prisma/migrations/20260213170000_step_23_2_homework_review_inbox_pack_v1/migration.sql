-- Step 23.2 Homework Review Queue + Parent Homework Inbox Pack v1.
-- Storage note: files are validated at API layer to <= 5MB and persisted in-db (bytea) for MVP;
-- a storage abstraction seam in src/lib/homework/storage keeps future object-storage migration low-risk.

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('ASSIGNED', 'SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "HomeworkFileSlot" AS ENUM ('ASSIGNMENT', 'SUBMISSION', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "HomeworkUploadedByRole" AS ENUM ('ADMIN', 'TUTOR', 'PARENT', 'SYSTEM');

-- CreateTable
CREATE TABLE "HomeworkItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "HomeworkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "homeworkItemId" TEXT NOT NULL,
    "slot" "HomeworkFileSlot" NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "checksum" TEXT,
    "uploadedByUserId" TEXT,
    "uploadedByRole" "HomeworkUploadedByRole" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeworkItem_tenantId_status_updatedAt_idx" ON "HomeworkItem"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "HomeworkItem_tenantId_studentId_status_idx" ON "HomeworkItem"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "HomeworkItem_tenantId_sessionId_idx" ON "HomeworkItem"("tenantId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkItem_tenantId_sessionId_studentId_key" ON "HomeworkItem"("tenantId", "sessionId", "studentId");

-- CreateIndex
CREATE INDEX "HomeworkFile_tenantId_homeworkItemId_slot_idx" ON "HomeworkFile"("tenantId", "homeworkItemId", "slot");

-- CreateIndex
CREATE INDEX "HomeworkFile_tenantId_uploadedAt_idx" ON "HomeworkFile"("tenantId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkFile_homeworkItemId_slot_version_key" ON "HomeworkFile"("homeworkItemId", "slot", "version");

-- AddForeignKey
ALTER TABLE "HomeworkItem" ADD CONSTRAINT "HomeworkItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkItem" ADD CONSTRAINT "HomeworkItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkItem" ADD CONSTRAINT "HomeworkItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkItem" ADD CONSTRAINT "HomeworkItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkFile" ADD CONSTRAINT "HomeworkFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkFile" ADD CONSTRAINT "HomeworkFile_homeworkItemId_fkey" FOREIGN KEY ("homeworkItemId") REFERENCES "HomeworkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkFile" ADD CONSTRAINT "HomeworkFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;