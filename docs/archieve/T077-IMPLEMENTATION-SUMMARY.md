# T077 - Vector Upload Service Database Integration

## Implementation Summary

Successfully enhanced the vector upload service to update `file_catalog.vector_status` field in the database.

**Date**: 2025-10-15
**Task**: T077 - Implement vector upload service
**File**: `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/qdrant/upload.ts`

---

## Changes Made

### 1. Added Supabase Integration

#### Import Statement
```typescript
import { createClient } from '@supabase/supabase-js';
```

#### Supabase Client Helper
```typescript
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  return createClient(supabaseUrl, supabaseKey);
}
```

### 2. Created Status Update Function

**Function**: `updateVectorStatus` (exported for independent use)

**Features**:
- Updates `file_catalog.vector_status` to 'indexed', 'failed', 'pending', or 'indexing'
- Updates `file_catalog.updated_at` timestamp
- Logs error messages for failed uploads
- Handles errors gracefully without breaking upload process
- Exported as public API for manual status updates

**Code**:
```typescript
export async function updateVectorStatus(
  documentId: string,
  status: 'indexed' | 'failed' | 'pending' | 'indexing',
  errorMessage?: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const updateData: any = {
      vector_status: status,
      updated_at: new Date().toISOString(),
    };

    // Log error message if status is failed
    if (status === 'failed' && errorMessage) {
      console.error(`Error for document ${documentId}: ${errorMessage}`);
    }

    const { error } = await supabase
      .from('file_catalog')
      .update(updateData)
      .eq('id', documentId);

    if (error) {
      console.error(`Failed to update vector_status for document ${documentId}:`, error);
      throw error;
    }

    console.log(`✓ Updated vector_status to '${status}' for document ${documentId}`);
  } catch (error) {
    console.error('Error updating vector_status:', error);
    throw error;
  }
}
```

### 3. Enhanced uploadChunksToQdrant Function

#### Success Path
After successful Qdrant upload:
```typescript
// Extract unique document IDs from embedding results
const uniqueDocumentIds = Array.from(
  new Set(embeddingResults.map(r => r.chunk.document_id))
);

console.log(`\nUpdating vector_status for ${uniqueDocumentIds.length} documents...`);

// Update each document to 'indexed' status
for (const documentId of uniqueDocumentIds) {
  try {
    await updateVectorStatus(documentId, 'indexed');
  } catch (error) {
    console.error(`Failed to update status for document ${documentId}:`, error);
    // Continue with other documents even if one fails
  }
}
```

#### Error Path
On upload failure:
```typescript
const errorMessage = error instanceof Error ? error.message : String(error);

console.error('Upload failed:', errorMessage);

// Extract unique document IDs
const uniqueDocumentIds = Array.from(
  new Set(embeddingResults.map(r => r.chunk.document_id))
);

console.log(`\nUpdating vector_status to 'failed' for ${uniqueDocumentIds.length} documents...`);

// Update each document to 'failed' status with error message
for (const documentId of uniqueDocumentIds) {
  try {
    await updateVectorStatus(documentId, 'failed', errorMessage);
  } catch (updateError) {
    console.error(`Failed to update status for document ${documentId}:`, updateError);
    // Continue with other documents even if one fails
  }
}
```

### 4. Updated Module Documentation

Added database status updates to module header:
```typescript
/**
 * Qdrant Batch Upload with Hybrid Vectors
 *
 * Implements batch upload of chunks to Qdrant with:
 * - Dense vectors (768D Jina-v3 embeddings)
 * - Sparse vectors (Production BM25 with IDF for lexical search)
 * - Comprehensive metadata payload
 * - Efficient batching (100-500 vectors per request)
 * - Automatic database status updates (file_catalog.vector_status)
 *
 * Supports hybrid search (semantic + lexical) using Reciprocal Rank Fusion (RRF).
 *
 * @module shared/qdrant/upload
 */
```

---

## Database Schema

### file_catalog Table

**Relevant Columns**:
- `id` (uuid, primary key) - Document identifier
- `vector_status` (enum: 'pending' | 'indexing' | 'indexed' | 'failed')
- `updated_at` (timestamp)

**Status Values**:
- `pending` - Document uploaded, awaiting vector processing
- `indexing` - Vector processing in progress
- `indexed` - Successfully indexed in Qdrant
- `failed` - Vector upload/indexing failed

---

## Environment Variables

**Required**:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
```

**Configuration File**: `/home/me/code/megacampus2/packages/course-gen-platform/.env.example`

---

## Implementation Details

### Key Design Decisions

1. **Exported updateVectorStatus Function**
   - Made public for independent status updates
   - Useful for BullMQ job handlers or manual status management
   - Can be imported and called directly

2. **Error Handling**
   - Status update failures are logged but don't break the upload process
   - Each document is updated independently
   - Continues processing even if one document fails

3. **Batch Processing**
   - Extracts unique document IDs from all chunks
   - Handles multiple documents in single upload batch
   - Updates each document once (even if multiple chunks)

4. **Error Message Logging**
   - Error messages logged to console for debugging
   - Note: file_catalog doesn't have error_message column
   - Future enhancement: Add error_message column to schema

### Data Flow

```
uploadChunksToQdrant()
  ↓
1. Upload vectors to Qdrant (batched)
  ↓
2. Extract unique document_ids from chunks
  ↓
3. Update file_catalog.vector_status
  ├─ Success → 'indexed'
  └─ Failure → 'failed' (with error message)
```

---

## Usage Examples

### Basic Upload with Status Updates
```typescript
import { uploadChunksToQdrant } from './upload';
import { generateEmbeddingsWithLateChunking } from '../embeddings/generate';

// Generate embeddings
const embeddingResult = await generateEmbeddingsWithLateChunking(
  enrichedChildChunks,
  'retrieval.passage',
  true
);

// Upload to Qdrant (automatically updates database status)
const uploadResult = await uploadChunksToQdrant(
  embeddingResult.embeddings,
  {
    batch_size: 100,
    enable_sparse: true,
  }
);

// Check result
if (uploadResult.success) {
  console.log(`Successfully indexed ${uploadResult.points_uploaded} points`);
  // Database status is now 'indexed'
} else {
  console.error(`Upload failed: ${uploadResult.error}`);
  // Database status is now 'failed'
}
```

### Manual Status Update
```typescript
import { updateVectorStatus } from './upload';

// Mark document as indexing before starting
await updateVectorStatus(documentId, 'indexing');

try {
  // ... perform vector upload ...
  await updateVectorStatus(documentId, 'indexed');
} catch (error) {
  await updateVectorStatus(documentId, 'failed', error.message);
}
```

---

## Expected Output

### Successful Upload
```
Uploading batch 1: 100 points (1-100 of 250)
✓ Batch 1 uploaded successfully
Uploading batch 2: 100 points (101-200 of 250)
✓ Batch 2 uploaded successfully
Uploading batch 3: 50 points (201-250 of 250)
✓ Batch 3 uploaded successfully

✓ Upload complete: 250 points in 3 batches (1234ms)

Updating vector_status for 5 documents...
✓ Updated vector_status to 'indexed' for document doc-123
✓ Updated vector_status to 'indexed' for document doc-456
✓ Updated vector_status to 'indexed' for document doc-789
✓ Updated vector_status to 'indexed' for document doc-abc
✓ Updated vector_status to 'indexed' for document doc-def
```

### Failed Upload
```
Uploading batch 1: 100 points (1-100 of 250)
Upload failed: Connection to Qdrant lost

Updating vector_status to 'failed' for 5 documents...
Error for document doc-123: Connection to Qdrant lost
✓ Updated vector_status to 'failed' for document doc-123
Error for document doc-456: Connection to Qdrant lost
✓ Updated vector_status to 'failed' for document doc-456
...
```

---

## Testing Recommendations

### Unit Tests
```typescript
describe('updateVectorStatus', () => {
  it('should update status to indexed', async () => {
    const documentId = 'test-doc-id';
    await updateVectorStatus(documentId, 'indexed');

    // Verify database update
    const { data } = await supabase
      .from('file_catalog')
      .select('vector_status')
      .eq('id', documentId)
      .single();

    expect(data.vector_status).toBe('indexed');
  });

  it('should update status to failed with error message', async () => {
    const documentId = 'test-doc-id';
    const errorMsg = 'Test error';

    await updateVectorStatus(documentId, 'failed', errorMsg);

    // Verify database update
    const { data } = await supabase
      .from('file_catalog')
      .select('vector_status')
      .eq('id', documentId)
      .single();

    expect(data.vector_status).toBe('failed');
  });
});
```

### Integration Tests
```typescript
describe('uploadChunksToQdrant', () => {
  it('should update database status on successful upload', async () => {
    const embeddingResults = createMockEmbeddings();

    const result = await uploadChunksToQdrant(embeddingResults);

    expect(result.success).toBe(true);

    // Verify database status
    const documentId = embeddingResults[0].chunk.document_id;
    const { data } = await supabase
      .from('file_catalog')
      .select('vector_status')
      .eq('id', documentId)
      .single();

    expect(data.vector_status).toBe('indexed');
  });

  it('should update database status on failed upload', async () => {
    // Mock Qdrant to throw error
    jest.spyOn(qdrantClient, 'upsert').mockRejectedValue(
      new Error('Qdrant connection error')
    );

    const embeddingResults = createMockEmbeddings();
    const result = await uploadChunksToQdrant(embeddingResults);

    expect(result.success).toBe(false);

    // Verify database status
    const documentId = embeddingResults[0].chunk.document_id;
    const { data } = await supabase
      .from('file_catalog')
      .select('vector_status')
      .eq('id', documentId)
      .single();

    expect(data.vector_status).toBe('failed');
  });
});
```

---

## Validation Checklist

- [x] Supabase client properly imported and configured
- [x] `updateVectorStatus` function handles all four statuses: 'indexed', 'failed', 'pending', 'indexing'
- [x] Status updated to 'indexed' after successful Qdrant upload
- [x] Status updated to 'failed' on upload error with error message
- [x] Handles multiple documents in single upload batch
- [x] Error handling doesn't break the upload process
- [x] Logging includes status update operations
- [x] Function exported for independent use
- [x] Module documentation updated
- [x] Environment variables documented

---

## Future Enhancements

### Database Schema Enhancement
Consider adding an `error_message` column to `file_catalog`:

```sql
ALTER TABLE file_catalog
ADD COLUMN error_message TEXT;
```

Then update the `updateVectorStatus` function:
```typescript
if (status === 'failed' && errorMessage) {
  updateData.error_message = errorMessage;
} else if (status === 'indexed') {
  updateData.error_message = null; // Clear error on success
}
```

### Retry Logic
Add automatic retry for failed status updates:
```typescript
async function updateVectorStatusWithRetry(
  documentId: string,
  status: string,
  errorMessage?: string,
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await updateVectorStatus(documentId, status, errorMessage);
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### Progress Tracking
Add progress percentage for large batches:
```typescript
const progress = {
  current: uploadedCount,
  total: points.length,
  percentage: Math.round((uploadedCount / points.length) * 100)
};

await supabase
  .from('file_catalog')
  .update({
    vector_status: 'indexing',
    indexing_progress: progress
  })
  .eq('id', documentId);
```

---

## Dependencies

**Package**: `@supabase/supabase-js` (already installed)

**Related Files**:
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/qdrant/upload.ts` (modified)
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/embeddings/metadata-enricher.ts` (defines EnrichedChunk)
- `/home/me/code/megacampus2/packages/course-gen-platform/.env.example` (environment variables)

**Database**:
- Supabase PostgreSQL
- Table: `file_catalog`
- Enum: `vector_status` ('pending' | 'indexing' | 'indexed' | 'failed')

---

## Implementation Status

**Status**: COMPLETED
**Date**: 2025-10-15
**Implemented By**: Infrastructure Setup Specialist (Claude Code Agent)

All requirements from T077 have been successfully implemented:
- ✅ Update file_catalog.vector_status to 'indexed' on success
- ✅ Update file_catalog.vector_status to 'failed' on error
- ✅ Handle upload failures gracefully
- ✅ Support multiple documents in single batch
- ✅ Export function for independent use
- ✅ Comprehensive error logging

**Next Steps**:
1. Test with real data in development environment
2. Monitor status updates in production
3. Consider adding error_message column to schema
4. Implement retry logic for failed updates
5. Add integration tests for database updates
