-- Additive indexes only (no data changes). Replaces two narrower indexes with composite ones that also serve ORDER BY.
DROP INDEX IF EXISTS "saved_videos_userId_idx";
DROP INDEX IF EXISTS "media_processing_jobs_status_idx";

CREATE INDEX "videos_creatorId_status_publishedAt_idx" ON "videos"("creatorId", "status", "publishedAt" DESC);
CREATE INDEX "notifications_recipientId_createdAt_idx" ON "notifications"("recipientId", "createdAt" DESC);
CREATE INDEX "video_likes_userId_createdAt_idx" ON "video_likes"("userId", "createdAt" DESC);
CREATE INDEX "saved_videos_userId_createdAt_idx" ON "saved_videos"("userId", "createdAt" DESC);
CREATE INDEX "media_processing_jobs_status_queuedAt_idx" ON "media_processing_jobs"("status", "queuedAt");
