-- Step 22.6 audit support pack adds explicit result/correlation fields for safe filtering/export.

-- CreateEnum
CREATE TYPE "AuditEventResult" AS ENUM ('SUCCESS', 'FAILURE');

-- AlterTable
ALTER TABLE "AuditEvent"
ADD COLUMN "result" "AuditEventResult" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN "correlationId" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_result_occurredAt_idx"
ON "AuditEvent"("tenantId", "result", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_entityType_occurredAt_idx"
ON "AuditEvent"("tenantId", "entityType", "occurredAt");
