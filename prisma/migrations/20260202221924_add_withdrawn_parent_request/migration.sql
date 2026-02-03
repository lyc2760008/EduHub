-- Add WITHDRAWN status plus audit fields for parent withdraw/resubmit.\r\n-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "ParentRequest" ADD COLUMN     "resubmittedAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnByParentId" TEXT;

