# Refactoring Recommendations

## Function Length Warnings (M013)

The following functions exceed 100 lines and should be refactored for better maintainability:

### Critical (>150 lines)

1. **orchestrator/job-status-tracker.ts:189-406 (217 lines)** - `markJobActive`
   - **Recommendation**: Extract database operations into separate functions
   - **Functions to extract**:
     - `createJobRecord(job: Job<JobData>)` - Create or update job status
     - `updateJobTimestamps(jobId: string)` - Update started_at timestamp
     - `handleJobCreationError(error, job)` - Error handling logic
   - **Priority**: HIGH (core job processing)

2. **orchestrator/worker.ts:97-290 (193 lines)** - `getWorker`
   - **Recommendation**: Extract event handlers into separate functions
   - **Functions to extract**:
     - `handleJobCompleted(job, result)` - Completed event handler
     - `handleJobFailed(job, error)` - Failed event handler
     - `handleJobActive(job)` - Active event handler
     - `handleJobProgress(job, progress)` - Progress event handler
   - **Priority**: HIGH (core worker logic)

3. **shared/qdrant/lifecycle.ts:315-477 (162 lines)** - `handleFileUpload`
   - **Recommendation**: Break down into pipeline stages
   - **Functions to extract**:
     - `validateFileForUpload(fileId)` - Validation stage
     - `processFileForVectors(fileId, fileData)` - Processing stage
     - `uploadFileVectorsToQdrant(vectors, metadata)` - Upload stage
     - `updateFileVectorStatus(fileId, status)` - Status update
   - **Priority**: MEDIUM (file processing pipeline)

4. **shared/embeddings/generate.ts:251-411 (160 lines)** - `generateEmbeddingsWithLateChunking`
   - **Recommendation**: Extract chunking and embedding generation
   - **Functions to extract**:
     - `chunkTextForEmbedding(text, maxTokens)` - Chunking logic
     - `callJinaApiWithChunks(chunks, model)` - API call
     - `processEmbeddingResponse(response)` - Response processing
     - `validateEmbeddingDimensions(embeddings, expected)` - Validation
   - **Priority**: MEDIUM (embedding generation)

5. **shared/qdrant/lifecycle.ts:527-680 (153 lines)** - `handleFileDelete`
   - **Recommendation**: Extract deletion stages
   - **Functions to extract**:
     - `findVectorsByFileId(fileId)` - Query vectors
     - `deleteVectorsFromQdrant(pointIds)` - Delete operation
     - `updateDeletionStatus(fileId)` - Status update
     - `handleDeletionError(error, fileId)` - Error handling
   - **Priority**: MEDIUM (file deletion)

### High (>120 lines)

6. **shared/embeddings/markdown-chunker.ts:196-344 (148 lines)** - `tokenAwareSplit`
   - **Recommendation**: Extract token calculation and splitting logic
   - **Functions to extract**:
     - `calculateChunkTokens(text)` - Token counting
     - `findOptimalSplitPoint(text, maxTokens)` - Split point finder
     - `validateChunkSize(chunk, maxTokens)` - Chunk validation
   - **Priority**: LOW (chunking utility)

7. **shared/embeddings/__tests__/cache-validation.ts:81-215 (134 lines)** - `testBatchEmbeddingCache`
   - **Recommendation**: Split test into smaller test cases
   - **Tests to extract**:
     - `testCacheHit()` - Test cache hit scenario
     - `testCacheMiss()` - Test cache miss scenario
     - `testPartialCacheHit()` - Test partial hit
     - `testCacheExpiration()` - Test expiration
   - **Priority**: LOW (test code)

8. **shared/qdrant/upload.ts:100-231 (131 lines)** - `uploadChunksToQdrant`
   - **Recommendation**: Extract batch processing and error handling
   - **Functions to extract**:
     - `prepareBatch(chunks, batchSize)` - Batch preparation
     - `uploadBatch(batch, collectionName)` - Single batch upload
     - `handleUploadError(error, batch)` - Error handling
     - `logUploadProgress(current, total)` - Progress logging
   - **Priority**: MEDIUM (vector upload)

9. **server/middleware/rate-limit.ts:154-282 (128 lines)** - `createRateLimiter`
   - **Recommendation**: Extract rate limit calculation and Redis operations
   - **Functions to extract**:
     - `calculateRateLimit(endpoint, user)` - Rate limit calculation
     - `checkRedisLimit(key, limit, window)` - Redis check
     - `incrementRedisCounter(key, window)` - Counter increment
     - `addRateLimitHeaders(res, remaining, reset)` - Header addition
   - **Priority**: MEDIUM (rate limiting middleware)

## Implementation Guidelines

When refactoring these functions:

1. **Maintain existing functionality** - Use comprehensive tests before and after
2. **Extract pure functions first** - Functions without side effects are safest to extract
3. **Keep error handling consistent** - Maintain logging and error propagation
4. **Update JSDoc comments** - Document extracted functions
5. **Test each refactor** - Run type-check and build after each extraction

## Refactoring Order

1. Start with test files (lowest risk)
2. Move to utility functions (markdown-chunker, rate-limit)
3. Address core business logic (lifecycle, upload, generate)
4. Finally refactor critical paths (worker, job-status-tracker)

## Estimated Effort

- High priority refactors: 8-10 hours
- Medium priority refactors: 4-6 hours
- Low priority refactors: 2-3 hours

**Total: 14-19 hours**

## Notes

- Some functions are intentionally long due to complex state machines (e.g., worker event handlers)
- Consider whether extraction improves readability or just adds indirection
- For event handlers, closures may be preferred over extraction
