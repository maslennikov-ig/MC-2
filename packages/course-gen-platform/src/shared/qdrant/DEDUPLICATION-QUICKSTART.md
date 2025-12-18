# Content Deduplication Quick Start

> 5-minute guide to using vector lifecycle management with content deduplication

## What Is This?

Automatic detection and reuse of identical file uploads across courses/organizations. Saves processing time and API costs.

## Quick Example

### Before (No Deduplication)
```typescript
// User uploads "textbook.pdf" to Course A
POST /api/files/upload
→ Processing... 25 seconds... ✓ Indexed

// User uploads same "textbook.pdf" to Course B
POST /api/files/upload
→ Processing... 25 seconds... ✓ Indexed

// Result: 50 seconds, 2× API costs
```

### After (With Deduplication)
```typescript
// User uploads "textbook.pdf" to Course A
POST /api/files/upload
→ Processing... 25 seconds... ✓ Indexed

// User uploads same "textbook.pdf" to Course B
POST /api/files/upload
→ ✓ Indexed (content reused, instant!)

// Result: 25 seconds, 1× API costs, 80% savings
```

## Basic Usage

### Upload File (with auto-deduplication)

```typescript
import { handleFileUpload } from '@/shared/qdrant/lifecycle';

const result = await handleFileUpload(fileBuffer, {
  filename: 'lecture-notes.pdf',
  organization_id: 'org-uuid',
  course_id: 'course-uuid',
  mime_type: 'application/pdf',
});

if (result.deduplicated) {
  console.log('✓ Content reused! Ready immediately.');
  console.log(`Duplicated ${result.vectors_duplicated} vectors`);
  // No need to queue for processing
} else {
  console.log('⏳ New file, queuing for processing...');
  await queue.add('process', { file_id: result.file_id });
}
```

### Delete File (with reference counting)

```typescript
import { handleFileDelete } from '@/shared/qdrant/lifecycle';

const result = await handleFileDelete('file-uuid');

if (result.physical_file_deleted) {
  console.log('✓ File deleted (no references remain)');
} else {
  console.log(`✓ Reference deleted (${result.remaining_references} remain)`);
}
```

## How It Works

```
┌───────────────────────────────────────────────────────────────┐
│ File Upload                                                   │
└───────────┬───────────────────────────────────────────────────┘
            │
            ▼
     Calculate SHA-256 hash
            │
            ▼
    ┌───────┴────────┐
    │                │
Hash exists?    Hash new?
    │                │
    ▼                ▼
┌────────────┐  ┌──────────────┐
│ DUPLICATE  │  │ NEW FILE     │
│ - Instant  │  │ - Save file  │
│ - Reuse    │  │ - Process    │
│ - No cost  │  │ - Queue job  │
└────────────┘  └──────────────┘
```

**Key Concepts:**
1. **Hash-based detection**: SHA-256 identifies duplicate content
2. **Reference counting**: Tracks how many courses use same file
3. **Vector duplication**: Reuse embeddings, change metadata (course_id, etc.)
4. **Isolation**: Each course has own vectors despite shared file

## Installation

### 1. Run Migrations

```bash
# Development
supabase db reset

# Production
psql $DATABASE_URL < supabase/migrations/20251015_add_storage_quota_functions.sql
psql $DATABASE_URL < supabase/migrations/20251015_add_content_deduplication.sql
```

### 2. Update Upload Handler

**Old code:**
```typescript
app.post('/api/files', async (req, res) => {
  const file = await saveFile(req.file);
  const record = await db.insert('file_catalog', file);
  await queue.add('process', { file_id: record.id });
  res.json({ id: record.id, status: 'pending' });
});
```

**New code:**
```typescript
import { handleFileUpload } from '@/shared/qdrant/lifecycle';

app.post('/api/files', async (req, res) => {
  const result = await handleFileUpload(req.file.buffer, {
    filename: req.file.originalname,
    organization_id: req.user.organization_id,
    course_id: req.body.course_id,
    mime_type: req.file.mimetype,
  });

  if (!result.deduplicated) {
    await queue.add('process', { file_id: result.file_id });
  }

  res.json({
    id: result.file_id,
    status: result.vector_status,
    deduplicated: result.deduplicated,
  });
});
```

### 3. Update Delete Handler

**Old code:**
```typescript
app.delete('/api/files/:id', async (req, res) => {
  const file = await db.get('file_catalog', req.params.id);
  await qdrant.delete({ filter: { document_id: file.id } });
  await fs.unlink(file.storage_path);
  await db.delete('file_catalog', file.id);
  res.json({ success: true });
});
```

**New code:**
```typescript
import { handleFileDelete } from '@/shared/qdrant/lifecycle';

app.delete('/api/files/:id', async (req, res) => {
  const result = await handleFileDelete(req.params.id);
  res.json({
    success: true,
    physical_file_deleted: result.physical_file_deleted,
    remaining_references: result.remaining_references,
  });
});
```

## Testing

```bash
# Set environment
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_KEY=your-key

# Run tests
tsx src/shared/qdrant/__tests__/lifecycle.test.ts
```

## Monitoring

### Check Deduplication Rate

```sql
-- View deduplication statistics
SELECT * FROM file_catalog_deduplication_stats
WHERE file_type = 'reference'
ORDER BY reference_copies DESC
LIMIT 10;

-- Organization-level stats
SELECT * FROM organization_deduplication_stats;
```

### Check Storage Savings

```sql
SELECT
  COUNT(*) FILTER (WHERE original_file_id IS NULL) AS original_files,
  COUNT(*) FILTER (WHERE original_file_id IS NOT NULL) AS duplicate_files,
  SUM(file_size) FILTER (WHERE original_file_id IS NOT NULL) AS storage_saved_bytes
FROM file_catalog;
```

## Common Questions

### Q: Will Course A see Course B's content?

**A**: No. Vectors have different metadata (course_id, organization_id). Search filters ensure isolation.

```typescript
// Course A search
qdrant.search({
  filter: { must: [{ key: 'course_id', match: { value: 'course-a' } }] }
});
// Only returns Course A vectors

// Course B search
qdrant.search({
  filter: { must: [{ key: 'course_id', match: { value: 'course-b' } }] }
});
// Only returns Course B vectors (even though same file)
```

### Q: What happens if I delete the file from Course A?

**A**: Course B still has access. Physical file deleted only when ALL references deleted.

```typescript
// Course A: Delete file
await handleFileDelete('file-a');
// Result: { physical_file_deleted: false, remaining_references: 1 }

// Course B: Still has vectors
await qdrant.search({ filter: { course_id: 'course-b' } });
// Returns: Course B vectors (intact)

// Course B: Delete file
await handleFileDelete('file-b');
// Result: { physical_file_deleted: true, remaining_references: 0 }
// Physical file NOW deleted
```

### Q: Do both organizations pay storage quota?

**A**: Yes. Each organization pays for their reference (fair billing).

```sql
-- Org A uploads file (10MB)
storage_used_bytes += 10MB

-- Org B uploads same file
storage_used_bytes += 10MB  -- Both pay

-- But physical file stored only once (savings on disk/Qdrant)
```

### Q: What if deduplication fails?

**A**: System automatically falls back to normal upload. No data loss.

```typescript
try {
  const vectors = await duplicateVectorsForNewCourse(...);
  return { deduplicated: true };
} catch (error) {
  console.warn('Deduplication failed, falling back');
  // Continues with normal upload (save file, process, etc.)
  return { deduplicated: false };
}
```

## Cost Savings Example

**File**: 10MB PDF, 1000 chunks
**Scenario**: Uploaded 5 times (5 different courses)

| Metric | Without Dedup | With Dedup | Savings |
|--------|--------------|------------|---------|
| Docling processing | 100s (5×20s) | 20s | 80s (80%) |
| Jina embeddings | $0.10 (5×$0.02) | $0.02 | $0.08 (80%) |
| Qdrant storage | 15.36 MB | 4.6 MB | 10.76 MB (70%) |
| Upload time | 5× queue jobs | 1× job + 4× instant | 4× instant |

## Troubleshooting

### Issue: Deduplication not working

**Check:**
```sql
-- Verify migration ran
SELECT * FROM pg_indexes WHERE indexname = 'idx_file_catalog_hash';

-- Check files have hashes
SELECT COUNT(*) FROM file_catalog WHERE hash IS NULL;

-- Verify files reach 'indexed' status
SELECT vector_status, COUNT(*) FROM file_catalog GROUP BY vector_status;
```

**Solution:** Ensure files reach `vector_status = 'indexed'` before deduplication works.

### Issue: Reference count incorrect

**Fix:**
```sql
-- Recalculate reference counts
UPDATE file_catalog f1
SET reference_count = (
  SELECT COUNT(*) + 1
  FROM file_catalog f2
  WHERE f2.original_file_id = f1.id
)
WHERE original_file_id IS NULL;
```

## Learn More

- **Full Documentation**: `src/shared/qdrant/LIFECYCLE-README.md`
- **Implementation Summary**: `T079-IMPLEMENTATION-SUMMARY.md`
- **Integration Examples**: `src/shared/qdrant/lifecycle-integration-example.ts`
- **Test Suite**: `src/shared/qdrant/__tests__/lifecycle.test.ts`

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test suite for usage examples
3. Inspect database with monitoring queries
4. Check server logs for deduplication messages

---

**Quick Reference**:
- Import: `import { handleFileUpload, handleFileDelete } from '@/shared/qdrant/lifecycle'`
- Upload: `handleFileUpload(buffer, metadata)`
- Delete: `handleFileDelete(fileId)`
- Stats: `SELECT * FROM organization_deduplication_stats`
