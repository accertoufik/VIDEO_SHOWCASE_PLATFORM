-- DropIndex
DROP INDEX "videos_type_visibility_status_idx";

-- CreateIndex
CREATE INDEX "videos_type_visibility_status_publishedAt_idx" ON "videos"("type", "visibility", "status", "publishedAt" DESC);
