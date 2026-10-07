-- DropIndex
DROP INDEX "videos_publishedAt_idx";

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "height" INTEGER,
ADD COLUMN     "width" INTEGER;

-- CreateIndex
CREATE INDEX "videos_publishedAt_idx" ON "videos"("publishedAt" DESC);
