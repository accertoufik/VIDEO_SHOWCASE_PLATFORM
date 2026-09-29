-- CreateEnum
CREATE TYPE "ThumbnailSource" AS ENUM ('AUTO', 'CUSTOM');

-- AlterEnum
BEGIN;
CREATE TYPE "MediaJobType_new" AS ENUM ('TRANSCODE_STANDARD', 'TRANSCODE_1080P', 'TRANSCODE_1440P', 'THUMBNAIL', 'PREVIEW');
ALTER TABLE "media_processing_jobs" ALTER COLUMN "type" TYPE "MediaJobType_new" USING ("type"::text::"MediaJobType_new");
ALTER TYPE "MediaJobType" RENAME TO "MediaJobType_old";
ALTER TYPE "MediaJobType_new" RENAME TO "MediaJobType";
DROP TYPE "public"."MediaJobType_old";
COMMIT;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "hdReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestedVisibility" "Visibility",
ADD COLUMN     "thumbnailSource" "ThumbnailSource" NOT NULL DEFAULT 'AUTO';

