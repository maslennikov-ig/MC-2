/**
 * Add document_id payload index to course_embeddings collection
 * Run this script to add the missing document_id index for test queries
 */

import { qdrantClient } from '../src/shared/qdrant/client';
import { logger } from '../src/shared/logger';

async function addDocumentIdIndex() {
  const collectionName = 'course_embeddings';

  logger.info({ collectionName }, 'Adding document_id payload index');

  try {
    await qdrantClient.createPayloadIndex(collectionName, {
      field_name: 'document_id',
      field_schema: 'keyword'
    });

    logger.info({ collectionName, field_name: 'document_id' }, 'Payload index created successfully');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      logger.info({ collectionName, field_name: 'document_id' }, 'Payload index already exists');
    } else {
      throw error;
    }
  }
}

addDocumentIdIndex()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Script failed');
    process.exit(1);
  });
