import { env } from './env';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

export const blobServiceClient = BlobServiceClient.fromConnectionString(
  env.AZURE_STORAGE_CONNECTION_STRING
);

export const containers = {
  originals: blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_ORIGINALS),
  processed: blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_PROCESSED),
  thumbnails: blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_THUMBNAILS),
} as const;

export type ContainerName = keyof typeof containers;

if (!(blobServiceClient.credential instanceof StorageSharedKeyCredential)) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING must use shared key authentication');
}

export const sharedKeyCredential = blobServiceClient.credential;