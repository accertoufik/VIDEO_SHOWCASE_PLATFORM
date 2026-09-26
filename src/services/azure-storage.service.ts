import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';

import {
  containers,
  sharedKeyCredential,
  type ContainerName,
} from '../config/azure';

export const AzureStorageService = {
  //async function to create a container if it doesn't exist
  createContainerIfNotExists: async (containerName: ContainerName) => {
    try {
      await containers[containerName].createIfNotExists();
    } catch (error) {
      throw new Error(
        `Failed to create/check container "${containerName}": ${error}`,
      );
    }
  },

  // Get a block blob client for a specific container and blob(file name )
  getBlockBlobClient: (containerName: ContainerName, blobName: string) =>
    containers[containerName].getBlockBlobClient(blobName),

  
  // Check if a blob exists in a specific container 
  blobExists: async (containerName: ContainerName, blobName: string) => {
    try {
      return await AzureStorageService.getBlockBlobClient(
        containerName,
        blobName,
      ).exists();
    } catch (error) {
      throw new Error(
        `Failed to check existence of "${blobName}" in "${containerName}": ${error}`,
      );
    }
  },

  // Get properties of a blob in a specific container
  getBlobProperties: async (containerName: ContainerName, blobName: string) => {
    try {
      return await AzureStorageService.getBlockBlobClient(
        containerName,
        blobName,
      ).getProperties();
    } catch (error) {
      throw new Error(
        `Failed to get properties of "${blobName}" in "${containerName}": ${error}`,
      );
    }
  },

  // Upload text content to a blob in a specific container
  uploadText: async (
    containerName: ContainerName,
    blobName: string,
    content: string,
  ) => {
    try {
      const blockBlobClient = AzureStorageService.getBlockBlobClient(
        containerName,
        blobName,
      );
      await blockBlobClient.upload(content, Buffer.byteLength(content));
    } catch (error) {
      throw new Error(
        `Failed to upload "${blobName}" to "${containerName}": ${error}`,
      );
    }
  },
  
  // delete a blob from a specific container
  deleteBlob: async (containerName: ContainerName, blobName: string) => {
    try {
      await AzureStorageService.getBlockBlobClient(
        containerName,
        blobName,
      ).deleteIfExists();
    } catch (error) {
      throw new Error(
        `Failed to delete "${blobName}" from "${containerName}": ${error}`,
      );
    }
  },

  // Generate a SAS URL for uploading a blob to a specific container
  generateUploadSasUrl: async (
    containerName: ContainerName,
    blobName: string,
    expiresInMinutes = 15,
  ) => {
    try {
      const blockBlobClient = AzureStorageService.getBlockBlobClient(
        containerName,
        blobName,
      );
      const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      const sas = generateBlobSASQueryParameters(
        {
          containerName: containers[containerName].containerName,
          blobName,
          permissions: BlobSASPermissions.parse('cw'),
          startsOn: new Date(),
          expiresOn,
        },
        sharedKeyCredential,
      ).toString();

      return `${blockBlobClient.url}?${sas}`;
    } catch (error) {
      throw new Error(
        `Failed to generate upload SAS URL for "${blobName}" in "${containerName}": ${error}`,
      );
    }
  },
  

  // Generate a SAS URL for reading a blob from a specific container
  generateReadSasUrl: async (
    containerName: ContainerName,
    blobName: string,
    expiresInMinutes = 60,
  ) => {
    try {
      const blockBlobClient = AzureStorageService.getBlockBlobClient(
        containerName,
        blobName,
      );
      const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      const sas = generateBlobSASQueryParameters(
        {
          containerName: containers[containerName].containerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          startsOn: new Date(),
          expiresOn,
        },
        sharedKeyCredential,
      ).toString();

      return `${blockBlobClient.url}?${sas}`;
    } catch (error) {
      throw new Error(
        `Failed to generate read SAS URL for "${blobName}" in "${containerName}": ${error}`,
      );
    }
  },
};
