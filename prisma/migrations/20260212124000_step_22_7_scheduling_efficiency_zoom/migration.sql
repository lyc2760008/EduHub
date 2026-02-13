-- Step 22.7: add Zoom link and cancel metadata fields to sessions.
ALTER TABLE "Session"
  ADD COLUMN "zoomLink" TEXT,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReasonCode" TEXT;
