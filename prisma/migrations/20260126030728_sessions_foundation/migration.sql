-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('ONE_ON_ONE', 'GROUP', 'CLASS');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "groupId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStudent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionStudent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_tenantId_startAt_idx" ON "Session"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "Session_tenantId_centerId_startAt_idx" ON "Session"("tenantId", "centerId", "startAt");

-- CreateIndex
CREATE INDEX "Session_tenantId_tutorId_startAt_idx" ON "Session"("tenantId", "tutorId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tenantId_tutorId_centerId_startAt_key" ON "Session"("tenantId", "tutorId", "centerId", "startAt");

-- CreateIndex
CREATE INDEX "SessionStudent_tenantId_sessionId_idx" ON "SessionStudent"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "SessionStudent_tenantId_studentId_idx" ON "SessionStudent"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionStudent_tenantId_sessionId_studentId_key" ON "SessionStudent"("tenantId", "sessionId", "studentId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStudent" ADD CONSTRAINT "SessionStudent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStudent" ADD CONSTRAINT "SessionStudent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStudent" ADD CONSTRAINT "SessionStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
