-- Step 23.3 Unified In-App Notifications + Unread Badges Pack v1.
-- Privacy note: notification rows store compact fields only; recipient fanout/read state lives in NotificationRecipient.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT', 'HOMEWORK', 'REQUEST');

-- CreateEnum
CREATE TYPE "NotificationAudienceRole" AS ENUM ('PARENT', 'TUTOR', 'ADMIN');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetUrl" TEXT,
    "audienceRole" "NotificationAudienceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_type_createdAt_idx" ON "Notification"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_audienceRole_createdAt_idx" ON "Notification"("tenantId", "audienceRole", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_recipientUserId_createdAt_idx" ON "NotificationRecipient"("tenantId", "recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_recipientUserId_readAt_idx" ON "NotificationRecipient"("tenantId", "recipientUserId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_notificationId_idx" ON "NotificationRecipient"("tenantId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_recipientUserId_key" ON "NotificationRecipient"("notificationId", "recipientUserId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
