-- Track parent portal welcome dismissal without storing any sensitive data.
-- Keep this migration UTF-8 without BOM for Postgres compatibility.
ALTER TABLE "Parent" ADD COLUMN "hasSeenWelcome" BOOLEAN NOT NULL DEFAULT false;
