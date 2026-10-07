import { AzureStorageService } from "../services/azure-storage.service";

/** Short-lived signed URL for a display image in the "thumbnails" container, or null if there is none / signing fails. */
export const signImage = async (blobPath?: string | null) => {
  if (!blobPath) return null;
  try {
    return await AzureStorageService.generateReadSasUrl("thumbnails", blobPath, 60);
  } catch {
    return null;
  }
};
