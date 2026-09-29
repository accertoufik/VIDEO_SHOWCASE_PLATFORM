// import "dotenv/config";
import { AzureStorageService } from '../src/services/azure-storage.service';
import type { ContainerName } from '../src/config/azure';

const testContainerName: ContainerName[] = [
  'originals',
  'processed',
  'thumbnails',
];

async function testAzureStorage(containerName: ContainerName) {
  const testBlobName = `test/connection-check-${containerName}.txt`;
  const content = `Azure connection test - ${containerName} - ${new Date().toISOString()}`;

  try {
    // Create container if it doesn't exist
    await AzureStorageService.createContainerIfNotExists(containerName);
    console.log(`✅ Container "${containerName}" is ready.`);
    // Upload a test file
    await AzureStorageService.uploadText(containerName, testBlobName, content);
    console.log(
      `✅ Test file "${testBlobName}" uploaded to container "${containerName}".`,
    );
  } catch (error) {
    console.error(
      `❌ Error occurred while testing container "${containerName}":`,
      error,
    );
  }

  try {
    // Check if the blob exists
    const exists = await AzureStorageService.blobExists(
      containerName,
      testBlobName,
    );
    console.log(
      `✅ Blob "${testBlobName}" existence check in container "${containerName}": ${exists}`,
    );
  } catch (error) {
    console.error(
      `❌ Error occurred while checking blob existence in container "${containerName}":`,
      error,
    );
  }

  try {
    // Get blob properties
    const properties = await AzureStorageService.getBlobProperties(
      containerName,
      testBlobName,
    );
    console.log(
      `✅ Blob "${testBlobName}" properties in container "${containerName}":`,
      properties,
    );
  } catch (error) {
    console.error(
      `❌ Error occurred while getting blob properties in container "${containerName}":`,
      error,
    );
  }

  try {
    // Delete the test blob
    await AzureStorageService.deleteBlob(containerName, testBlobName);
    console.log(
      `✅ Test file "${testBlobName}" deleted from container "${containerName}".`,
    );
  } catch (error) {
    console.error(
      `❌ Error occurred while deleting blob in container "${containerName}":`,
      error,
    );
  }
}

async function runTests() {
  for (const container of testContainerName) {
    console.log(
      `\n--- Testing Azure Storage for container: "${container}" ---`,
    );
    await testAzureStorage(container);
  }
}

runTests().catch((error) => {
  console.error('❌ An unexpected error occurred during the tests:', error);
  process.exit(1);
});
