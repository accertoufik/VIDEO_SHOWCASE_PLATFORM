import { ApiError } from "../middleware/errorHandler";
import { AzureStorageService } from "../services/azure-storage.service";

/**
 * Never accept something that isn't really an image: a failed upload can leave an error message or garbage in the
 * blob, and every phone then fails to decode the "picture". Checks the file's first bytes (jpeg / png / gif / webp).
 */
export const assertImageBlob = async (container: "thumbnails", blobName: string) => {
  const probe = await fetch(await AzureStorageService.generateReadSasUrl(container, blobName, 5), {
    headers: { Range: "bytes=0-11" },
  });
  const head = Buffer.from(await probe.arrayBuffer());
  const isImage =
    (head[0] === 0xff && head[1] === 0xd8) || // jpeg
    head.subarray(0, 4).toString("hex") === "89504e47" || // png
    head.subarray(0, 3).toString("ascii") === "GIF" ||
    (head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP");
  if (!isImage) {
    throw new ApiError(400, "The uploaded file is not a valid image. Please pick the photo again.");
  }
};
