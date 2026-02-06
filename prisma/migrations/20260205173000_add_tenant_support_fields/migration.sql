-- Add tenant-level timezone + support contact fields for go-live support messaging.
-- Keep this migration UTF-8 without BOM for Postgres compatibility.
ALTER TABLE "Tenant" ADD COLUMN "timeZone" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "supportPhone" TEXT;