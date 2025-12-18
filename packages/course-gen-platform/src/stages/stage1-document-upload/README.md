# Stage 1: Document Upload

## Overview

Stage 1 handles document upload for the course generation pipeline. It validates upload requests against tier-based restrictions and stores files to the local filesystem with comprehensive error handling and automatic rollback.

**Input:** File upload request from tRPC endpoint (base64-encoded content)
**Output:** File ID, storage path, and metadata in `file_catalog` table

## Important Note

**Stage 1 is NOT a BullMQ job** - it's a synchronous tRPC endpoint. Unlike Stages 2-5 which process jobs asynchronously via workers, Stage 1 executes immediately when called.

This means:
- No job queue or worker process
- No FSM state transitions (file upload is pre-pipeline)
- Synchronous response to client
- Files stored with `vector_status: 'pending'` for Stage 2 processing

## Architecture

### Core Components

- **Handler:** `handler.ts` - Main entry point, exports `uploadFile()` function
- **Orchestrator:** `orchestrator.ts` - Coordinates phases with error handling
- **Phases:** `phases/` - Validation and storage logic

### Processing Flow

```
POST /api/trpc/generation.uploadFile
    |
instructorProcedure (auth middleware)
    |
Stage1Handler.uploadFile()
    |
Phase 1: Validation
    |-- Verify course ownership
    |-- Get organization tier
    |-- Count existing files
    |-- Validate file (size, MIME, count limits)
    |
Phase 2: Storage
    |-- Reserve quota atomically
    |-- Generate file ID and path
    |-- Decode base64 content
    |-- Verify size match
    |-- Create directory structure
    |-- Write file to disk
    |-- Calculate SHA256 hash
    |-- Insert file_catalog record
    |
SUCCESS: Return fileId, storagePath, message
    |
file_catalog (vector_status: 'pending')
```

## Tier Restrictions

File upload is restricted based on organization tier:

| Tier | Uploads | Max Files | Formats | Max Size |
|------|---------|-----------|---------|----------|
| Trial | No | - | - | - |
| Free | No | - | - | - |
| Basic | Yes | 1 | PDF, TXT, MD | 50 MB |
| Standard | Yes | 3 | PDF, TXT, MD, DOCX, HTML, PPTX | 100 MB |
| Premium | Yes | 10 | All + images (PNG, JPG, GIF, WebP) | 100 MB |

Validation is performed by `shared/validation/file-validator.ts`.

## Quota Enforcement

Storage quota is enforced atomically to prevent race conditions:

| Tier | Storage Quota |
|------|---------------|
| Trial | 1 GB |
| Free | 10 MB |
| Basic | 100 MB |
| Standard | 1 GB |
| Premium | 10 GB |

Quota operations use PostgreSQL CHECK constraints via `shared/validation/quota-enforcer.ts`.

## Input

```typescript
interface Stage1Input {
  courseId: string;        // UUID of target course
  organizationId: string;  // UUID of user's organization
  userId: string;          // UUID of authenticated user
  filename: string;        // Original filename
  fileSize: number;        // File size in bytes (declared)
  mimeType: string;        // MIME type
  fileContent: string;     // Base64-encoded content
}
```

## Output

```typescript
interface Stage1Output {
  fileId: string;          // Generated UUID
  storagePath: string;     // Relative path from cwd
  vectorStatus: 'pending'; // Always 'pending' after upload
  fileHash: string;        // SHA256 hash
  message: string;         // Success message for user
}
```

## Error Handling

### Validation Errors (Phase 1)

| Code | Cause | Resolution |
|------|-------|------------|
| NOT_FOUND | Course does not exist | Check course ID |
| FORBIDDEN | Course belongs to different org | Check permissions |
| BAD_REQUEST | File validation failed | Check tier restrictions |
| INTERNAL_SERVER_ERROR | Database error | Retry or contact support |

### Storage Errors (Phase 2)

| Code | Cause | Resolution |
|------|-------|------------|
| BAD_REQUEST | Invalid path or base64 | Check input data |
| BAD_REQUEST | Size mismatch | Verify fileSize matches content |
| INTERNAL_SERVER_ERROR | Disk or database error | Retry or contact support |

### Automatic Rollback

On any failure in Phase 2:
1. Delete file from disk (if written)
2. Release quota reservation
3. Return error to client

No manual cleanup required - all resources are automatically cleaned up.

## Usage

### In Generation Router

```typescript
import { uploadFile, isStage1Error } from '../../stages/stage1-document-upload/handler';
import { TRPCError } from '@trpc/server';

// In uploadFile mutation
try {
  const result = await uploadFile({
    courseId: input.courseId,
    organizationId: ctx.user.organizationId,
    userId: ctx.user.id,
    filename: input.filename,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    fileContent: input.fileContent,
  });

  return {
    fileId: result.fileId,
    storagePath: result.storagePath,
    message: result.message,
  };
} catch (error) {
  if (isStage1Error(error)) {
    throw new TRPCError({
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}
```

## Dependencies

### External

- `crypto` - UUID generation and SHA256 hashing
- `fs/promises` - File system operations
- `path` - Path manipulation

### Internal

- `shared/supabase/admin` - Database operations
- `shared/validation/file-validator` - Tier-based file validation
- `shared/validation/quota-enforcer` - Storage quota management
- `shared/logger` - Structured logging

## Testing

### Unit Tests

**Location:** `tests/unit/stages/stage1/`

**Coverage:**
- Phase 1 validation logic
- Phase 2 storage operations
- Rollback scenarios
- Error handling

**Run:**
```bash
pnpm test tests/unit/stages/stage1/
```

### Integration Tests

**Location:** `tests/integration/`

**Scenarios:**
- End-to-end upload flow
- Tier restriction enforcement
- Quota limit testing
- Concurrent upload handling

**Run:**
```bash
pnpm test tests/integration/stage1-*
```

## Next Stage

After successful upload, files have `vector_status: 'pending'`.

When `generation.initiate` is called:
1. Check `file_catalog` for pending files
2. If files exist: Set FSM to `stage_2_init`, queue document processing jobs
3. If no files: Set FSM to `stage_4_init`, queue analysis job

Stage 2 (Document Processing) will:
- Read file from disk
- Convert to DoclingDocument JSON
- Generate embeddings
- Index in Qdrant vector store
- Update `vector_status` to `indexed`

## Contributing

When modifying Stage 1:

1. **Preserve Rollback Logic:** Ensure any new operations have rollback handlers
2. **Update Tests:** Add tests for any new validation or storage logic
3. **Maintain Tier Restrictions:** Keep file-validator as source of truth
4. **Document Changes:** Update this README for any behavior changes
5. **Type Safety:** Keep types.ts in sync with implementation

---

**Last Updated:** 2025-11-21
**Version:** 1.0.0
**Owner:** course-gen-platform team
