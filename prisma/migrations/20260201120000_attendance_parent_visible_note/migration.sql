-- Add parent-visible note fields to attendance for portal sharing.
ALTER TABLE "Attendance"
ADD COLUMN "parentVisibleNote" TEXT,
ADD COLUMN "parentVisibleNoteUpdatedAt" TIMESTAMP(3);
