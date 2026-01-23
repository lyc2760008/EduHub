-- Creates tenant-scoped centers with timezone and optional address fields.
-- CreateTable
CREATE TABLE "Center" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Center_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Center_tenantId_idx" ON "Center"("tenantId");

-- CreateIndex
CREATE INDEX "Center_tenantId_isActive_idx" ON "Center"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Center_tenantId_name_key" ON "Center"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Center" ADD CONSTRAINT "Center_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
