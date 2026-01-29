-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "levelId" TEXT;

-- CreateIndex
CREATE INDEX "StudentParent_tenantId_idx" ON "StudentParent"("tenantId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;
