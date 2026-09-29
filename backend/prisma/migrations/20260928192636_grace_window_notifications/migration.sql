-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "hdNotificationSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readyNotificationSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "standardReadyAt" TIMESTAMPTZ(6);
