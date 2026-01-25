-- Add staff-center join table for tenant-scoped assignments.
-- CreateTable
CREATE TABLE "StaffCenter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,

    CONSTRAINT "StaffCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffCenter_tenantId_idx" ON "StaffCenter"("tenantId");

-- CreateIndex
CREATE INDEX "StaffCenter_userId_idx" ON "StaffCenter"("userId");

-- CreateIndex
CREATE INDEX "StaffCenter_centerId_idx" ON "StaffCenter"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffCenter_tenantId_userId_centerId_key" ON "StaffCenter"("tenantId", "userId", "centerId");

-- AddForeignKey
ALTER TABLE "StaffCenter" ADD CONSTRAINT "StaffCenter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCenter" ADD CONSTRAINT "StaffCenter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCenter" ADD CONSTRAINT "StaffCenter_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;
