# Qdrant Vector Upload Service - Quick Reference Guide

## Overview

The vector upload service (`upload.ts`) now automatically updates the database (`file_catalog.vector_status`) after each upload operation.

**File**: `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/qdrant/upload.ts`

---

## Environment Setup

### Required Environment Variables

Add to `.env`:
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Qdrant Configuration
QDRANT_URL=https://your-cluster.qdrant.cloud
QDRANT_API_KEY=your-qdrant-api-key-here

# Jina Embeddings
JINA_API_KEY=your-jina-api-key-here
```

---

## Basic Usage

### 1. Upload Vectors to Qdrant

```typescript
import { uploadChunksToQdrant } from '@/shared/qdrant/upload';
import { generateEmbeddingsWithLateChunking } from '@/shared/embeddings/generate';

// Generate embeddings from enriched chunks
const embeddingResult = await generateEmbeddingsWithLateChunking(
  enrichedChildChunks,
  'retrieval.passage',
  true
);

// Upload to Qdrant (automatically updates database status)
const uploadResult = await uploadChunksToQdrant(
  embeddingResult.embeddings,
  {
    batch_size: 100,           // Default: 100
    enable_sparse: true,       // Enable BM25 hybrid search
    wait: true,                // Wait for indexing to complete
    collection_name: 'course_embeddings'
  }
);

// Check result
if (uploadResult.success) {
  console.log(`✓ Uploaded ${uploadResult.points_uploaded} vectors`);
  console.log(`Duration: ${uploadResult.duration_ms}ms`);
  // Database status is now 'indexed'
} else {
  console.error(`✗ Upload failed: ${uploadResult.error}`);
  // Database status is now 'failed'
}
```

---

## Database Status Tracking

### Vector Status Values

The `file_catalog.vector_status` field tracks the indexing status:

| Status | Description | When Set |
|--------|-------------|----------|
| `pending` | Awaiting processing | Initial upload to file_catalog |
| `indexing` | Processing in progress | (Optional) Before starting upload |
| `indexed` | Successfully indexed | After successful Qdrant upload |
| `failed` | Upload failed | After upload error |

### Automatic Status Updates

**On Success**:
```typescript
// Automatically called after successful upload
// Updates all documents to 'indexed'
file_catalog.vector_status = 'indexed'
file_catalog.updated_at = NOW()
```

**On Failure**:
```typescript
// Automatically called on upload error
// Updates all documents to 'failed'
file_catalog.vector_status = 'failed'
file_catalog.updated_at = NOW()
// Error message logged to console
```

---

## Manual Status Updates

### Using updateVectorStatus Directly

```typescript
import { updateVectorStatus } from '@/shared/qdrant/upload';

// Mark as indexing before starting
await updateVectorStatus(documentId, 'indexing');

try {
  // Perform upload...
  await uploadChunksToQdrant(embeddings);

  // Status automatically set to 'indexed'
} catch (error) {
  // Status automatically set to 'failed'

  // Or manually set with custom error message
  await updateVectorStatus(documentId, 'failed', 'Custom error message');
}
```

### Reset Status to Pending

```typescript
import { updateVectorStatus } from '@/shared/qdrant/upload';

// Reset document for re-indexing
await updateVectorStatus(documentId, 'pending');
```

---

## BullMQ Job Integration

### Document Processing Worker

```typescript
import { uploadChunksToQdrant, updateVectorStatus } from '@/shared/qdrant/upload';
import { generateEmbeddingsWithLateChunking } from '@/shared/embeddings/generate';
import { Worker } from 'bullmq';

const worker = new Worker('document-processing', async (job) => {
  const { documentId, chunks } = job.data;

  try {
    // Mark as indexing
    await updateVectorStatus(documentId, 'indexing');

    // Update job progress
    await job.updateProgress(25);

    // Generate embeddings
    const embeddingResult = await generateEmbeddingsWithLateChunking(
      chunks,
      'retrieval.passage',
      true
    );

    await job.updateProgress(50);

    // Upload to Qdrant (automatically updates to 'indexed')
    const uploadResult = await uploadChunksToQdrant(
      embeddingResult.embeddings,
      { enable_sparse: true }
    );

    await job.updateProgress(100);

    return {
      documentId,
      vectorsUploaded: uploadResult.points_uploaded,
      duration: uploadResult.duration_ms
    };

  } catch (error) {
    // Status automatically set to 'failed'
    console.error(`Document ${documentId} indexing failed:`, error);
    throw error;
  }
}, {
  connection: redisConnection
});
```

---

## Query Database Status

### Check Individual Document Status

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const { data, error } = await supabase
  .from('file_catalog')
  .select('id, filename, vector_status, updated_at')
  .eq('id', documentId)
  .single();

if (data) {
  console.log(`Document: ${data.filename}`);
  console.log(`Status: ${data.vector_status}`);
  console.log(`Updated: ${data.updated_at}`);
}
```

### Get All Documents by Status

```typescript
// Get all failed documents
const { data: failedDocs } = await supabase
  .from('file_catalog')
  .select('id, filename, vector_status, updated_at')
  .eq('vector_status', 'failed')
  .order('updated_at', { ascending: false });

console.log(`Failed documents: ${failedDocs?.length}`);

// Get all indexed documents for a course
const { data: indexedDocs } = await supabase
  .from('file_catalog')
  .select('id, filename, vector_status')
  .eq('course_id', courseId)
  .eq('vector_status', 'indexed');

console.log(`Indexed documents: ${indexedDocs?.length}`);
```

---

## Error Handling

### Upload Failure Scenarios

**Qdrant Connection Error**:
```typescript
try {
  await uploadChunksToQdrant(embeddings);
} catch (error) {
  // Status automatically set to 'failed'
  // Error logged: "Connection to Qdrant lost"
}
```

**Invalid Vector Dimensions**:
```typescript
try {
  await uploadChunksToQdrant(embeddings);
} catch (error) {
  // Status automatically set to 'failed'
  // Error logged: "Vector dimension mismatch: expected 768, got 512"
}
```

**Database Update Failure**:
```typescript
// Upload succeeds but status update fails
// Error is logged but upload continues
// Status update failures don't break the upload process
```

### Graceful Degradation

If status update fails:
1. Error is logged to console
2. Upload process continues
3. Other documents are still updated
4. No exception thrown to caller

```typescript
// Even if one document status update fails, others continue
for (const documentId of uniqueDocumentIds) {
  try {
    await updateVectorStatus(documentId, 'indexed');
  } catch (error) {
    console.error(`Failed to update status for document ${documentId}:`, error);
    // Continue with other documents
  }
}
```

---

## Monitoring and Logging

### Expected Console Output

**Successful Upload**:
```
Uploading batch 1: 100 points (1-100 of 250)
✓ Batch 1 uploaded successfully
Uploading batch 2: 100 points (101-200 of 250)
✓ Batch 2 uploaded successfully
Uploading batch 3: 50 points (201-250 of 250)
✓ Batch 3 uploaded successfully

✓ Upload complete: 250 points in 3 batches (1234ms)

Updating vector_status for 3 documents...
✓ Updated vector_status to 'indexed' for document abc-123
✓ Updated vector_status to 'indexed' for document def-456
✓ Updated vector_status to 'indexed' for document ghi-789
```

**Failed Upload**:
```
Uploading batch 1: 100 points (1-100 of 250)
Upload failed: Connection to Qdrant lost

Updating vector_status to 'failed' for 3 documents...
Error for document abc-123: Connection to Qdrant lost
✓ Updated vector_status to 'failed' for document abc-123
Error for document def-456: Connection to Qdrant lost
✓ Updated vector_status to 'failed' for document def-456
Error for document ghi-789: Connection to Qdrant lost
✓ Updated vector_status to 'failed' for document ghi-789
```

---

## Advanced Usage

### Batch Processing Multiple Documents

```typescript
import { uploadChunksToQdrant } from '@/shared/qdrant/upload';

// Process multiple documents in parallel
const documents = [doc1, doc2, doc3];

const uploadPromises = documents.map(async (doc) => {
  const embeddings = await generateEmbeddings(doc.chunks);
  return uploadChunksToQdrant(embeddings);
});

const results = await Promise.allSettled(uploadPromises);

// Check results
results.forEach((result, index) => {
  if (result.status === 'fulfilled' && result.value.success) {
    console.log(`Document ${index + 1} indexed successfully`);
  } else {
    console.error(`Document ${index + 1} failed`);
  }
});
```

### Hybrid Search Configuration

```typescript
import { uploadChunksToQdrant } from '@/shared/qdrant/upload';

// Enable BM25 sparse vectors for hybrid search
const uploadResult = await uploadChunksToQdrant(
  embeddingResult.embeddings,
  {
    batch_size: 100,
    enable_sparse: true,  // Enables BM25 lexical search
    wait: true
  }
);

// Now supports hybrid search with:
// - Dense vectors (semantic similarity via Jina-v3)
// - Sparse vectors (BM25 lexical matching)
// - Reciprocal Rank Fusion (RRF) for combined results
```

### Custom Collection Name

```typescript
import { uploadChunksToQdrant } from '@/shared/qdrant/upload';

// Upload to custom collection
const uploadResult = await uploadChunksToQdrant(
  embeddings,
  {
    collection_name: 'custom_embeddings',
    batch_size: 200
  }
);
```

---

## Troubleshooting

### Status Not Updating

**Problem**: Database status remains 'pending' after upload

**Solution**:
1. Check environment variables are set:
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_KEY
   ```

2. Verify Supabase connection:
   ```typescript
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(
     process.env.SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_KEY!
   );
   const { data, error } = await supabase.from('file_catalog').select('count');
   console.log('Supabase connected:', !error);
   ```

3. Check document_id matches file_catalog.id:
   ```typescript
   console.log('Chunk document_id:', chunk.document_id);
   console.log('File catalog id:', fileCatalogRecord.id);
   // These must match!
   ```

### Status Update Fails Silently

**Problem**: Upload succeeds but status update errors are not visible

**Solution**:
1. Check console logs for error messages
2. Enable verbose logging:
   ```typescript
   process.env.DEBUG = 'supabase:*';
   ```

3. Test updateVectorStatus directly:
   ```typescript
   import { updateVectorStatus } from '@/shared/qdrant/upload';

   try {
     await updateVectorStatus(documentId, 'indexed');
   } catch (error) {
     console.error('Direct status update failed:', error);
   }
   ```

### Multiple Documents Not Updating

**Problem**: Only first document status updates

**Solution**:
Verify unique document IDs are being extracted:
```typescript
const uniqueDocumentIds = Array.from(
  new Set(embeddingResults.map(r => r.chunk.document_id))
);

console.log('Unique document IDs:', uniqueDocumentIds);
// Should show all unique IDs, not just one
```

---

## Performance Considerations

### Batch Size Tuning

- **Small batches (50-100)**: Faster individual uploads, more status updates
- **Large batches (200-500)**: Fewer requests, higher throughput
- **Recommended**: 100-200 for balanced performance

```typescript
// For large datasets (10,000+ vectors)
await uploadChunksToQdrant(embeddings, {
  batch_size: 200,
  enable_sparse: true
});
```

### Parallel Processing

For multiple documents:
```typescript
// Process in batches of 5 documents at a time
const batchSize = 5;
for (let i = 0; i < documents.length; i += batchSize) {
  const batch = documents.slice(i, i + batchSize);
  await Promise.all(
    batch.map(doc => processDocument(doc))
  );
}
```

---

## Best Practices

1. **Always check upload result**
   ```typescript
   const result = await uploadChunksToQdrant(embeddings);
   if (!result.success) {
     // Handle failure
     await notifyAdmin(result.error);
   }
   ```

2. **Set status to 'indexing' before long operations**
   ```typescript
   await updateVectorStatus(documentId, 'indexing');
   // ... long-running operation ...
   ```

3. **Use batch processing for multiple documents**
   ```typescript
   // Instead of:
   for (const doc of documents) {
     await processAndUpload(doc);
   }

   // Use:
   await Promise.all(
     documents.map(doc => processAndUpload(doc))
   );
   ```

4. **Monitor failed uploads**
   ```typescript
   // Periodic check for failed documents
   const { data: failedDocs } = await supabase
     .from('file_catalog')
     .select('*')
     .eq('vector_status', 'failed');

   // Retry failed uploads
   for (const doc of failedDocs) {
     await retryUpload(doc.id);
   }
   ```

---

## Related Files

- **Upload Service**: `/packages/course-gen-platform/src/shared/qdrant/upload.ts`
- **Embedding Generation**: `/packages/course-gen-platform/src/shared/embeddings/generate.ts`
- **Qdrant Search**: `/packages/course-gen-platform/src/shared/qdrant/search.ts`
- **BullMQ Worker**: `/packages/course-gen-platform/src/orchestrator/worker.ts`
- **Environment Config**: `/packages/course-gen-platform/.env.example`

---

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify environment variables are set
3. Review implementation summary: `T077-IMPLEMENTATION-SUMMARY.md`
4. Check database status with direct queries
5. Test individual functions (updateVectorStatus, uploadChunksToQdrant)

---

**Last Updated**: 2025-10-15
**Version**: 1.0.0
