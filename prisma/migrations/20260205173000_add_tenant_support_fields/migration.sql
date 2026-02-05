-- Add tenant-level timezone + support contact fields for go-live support messaging.
ALTER TABLE "Tenant" ADD COLUMN "timeZone" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "supportPhone" TEXT;

