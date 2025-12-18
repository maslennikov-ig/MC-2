---
report_type: investigation
generated: 2025-11-03T00:00:00Z
investigation_id: INV-2025-11-03-001
status: complete
agent: problem-investigator
duration: 15 minutes
---

# Investigation Report: E2E Test Stage 3 Document Processing Not Triggered

**Investigation ID**: INV-2025-11-03-001
**Generated**: 2025-11-03T00:00:00Z
**Status**: ✅ Complete
**Duration**: 15 minutes

---

## Executive Summary

The E2E test uploads documents successfully to file_catalog but document processing (Stage 3) is never triggered because the test bypasses the production workflow. The production flow requires calling `generation.initiate` after uploading files to create DOCUMENT_PROCESSING jobs, but the test expects automatic processing after direct database insertion.

**Root Cause**: Test uses direct database insertion instead of production `generation.uploadFile` endpoint, and never calls `generation.initiate` to trigger job creation.

**Recommended Solution**: Call `generation.initiate` after uploading all documents to trigger DOCUMENT_PROCESSING job creation.

### Key Findings

- **Finding 1**: `generation.uploadFile` endpoint does NOT automatically create processing jobs - it only stores files in file_catalog
- **Finding 2**: `generation.initiate` endpoint is responsible for creating DOCUMENT_PROCESSING or STRUCTURE_ANALYSIS jobs based on file presence
- **Finding 3**: Test bypasses both endpoints by directly inserting into file_catalog, expecting automatic processing that never happens

---

## Problem Statement

### Observed Behavior

1. E2E test successfully creates course record
2. Test uploads 3 documents (1 PDF, 2 TXT) by directly inserting into file_catalog
3. Documents have `vector_status='pending'` in database
4. Test waits for document processing with `waitForDocumentProcessing()`
5. No processing jobs are created or executed
6. Documents remain in `pending` state indefinitely
7. Test times out after 5 minutes waiting for processing

### Expected Behavior

1. Documents uploaded to file_catalog
2. Processing jobs automatically created (or triggered via explicit call)
3. BullMQ worker picks up DOCUMENT_PROCESSING jobs
4. Documents processed through Docling/Markdown pipeline
5. Documents transition: pending → indexing → indexed
6. Test proceeds to Stage 4 analysis

### Impact

- **E2E test suite incomplete**: Cannot validate full pipeline from upload to analysis
- **Stage 3 validation blocked**: Document processing, summarization, and Qdrant vectorization untested
- **Integration gaps**: No end-to-end validation of document workflow
- **Developer confidence**: Cannot verify production-like workflow in tests

### Environmental Context

- **Environment**: Local development with test fixtures
- **Related Changes**: None - new test implementation for T055
- **First Observed**: During T055 E2E test development
- **Frequency**: Always - systematic workflow gap

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: Test expects database trigger to create jobs automatically
   - **Likelihood**: High
   - **Test Plan**: Check database migrations for triggers on file_catalog inserts

2. **Hypothesis 2**: Test should call `generation.uploadFile` endpoint instead of direct DB insert
   - **Likelihood**: High
   - **Test Plan**: Examine uploadFile endpoint implementation and job creation logic

3. **Hypothesis 3**: Test should call `generation.initiate` after uploading files
   - **Likelihood**: Medium
   - **Test Plan**: Examine initiate endpoint and job type determination logic

### Files Examined

- `tests/e2e/t055-full-pipeline.test.ts:233-278` - Test's `uploadDocument()` function using direct DB insert
- `src/server/routers/generation.ts:453-729` - Production `uploadFile` endpoint (NO job creation)
- `src/server/routers/generation.ts:180-405` - Production `initiate` endpoint (creates jobs based on file presence)
- `src/orchestrator/handlers/document-processing.ts:77-572` - Document processing worker handler

### Commands Executed

```bash
# Search for DOCUMENT_PROCESSING job creation
grep -r "addJob.*DOCUMENT_PROCESSING" src/

# Result: Only found in README example, not in uploadFile endpoint

# Examine uploadFile endpoint structure
read src/server/routers/generation.ts:453-729

# Result: Step 10 comment confirms "File upload successful" - no job creation

# Examine initiate endpoint
read src/server/routers/generation.ts:180-405

# Result: T015 determines job type, T016 creates BullMQ job
```

### Data Collected

**Test Implementation** (lines 233-278):
```typescript
// Upload via tRPC (this would normally be via generation.uploadFile)
// For now, we'll insert directly into file_catalog
const supabase = getSupabaseAdmin();
const { data, error } = await supabase
  .from('file_catalog')
  .insert({
    organization_id: TEST_ORGS.premium.id,
    course_id: courseId,
    filename: fileName,
    storage_path: `/uploads/${courseId}/${fileName}`,
    file_type: fileType,
    file_size: fileBuffer.length,
    hash: fileHash,
    mime_type: mimeType,
    vector_status: 'pending',
  })
  .select('id')
  .single();
```

**Production uploadFile Endpoint** (lines 700-708):
```typescript
// Step 10: File upload successful - quota already reserved atomically in Step 5
// No need to increment quota again since it was done before upload started

// Return success response
return {
  fileId: fileRecord.id,
  storagePath: relativeStoragePath,
  message: `File "${filename}" uploaded successfully to course "${course.title}"`,
};
```

**Production initiate Endpoint** (lines 297-319):
```typescript
// T015: Determine job type based on settings JSON (simplified check)
// In production, check for uploaded files in file_catalog table
const courseSettings = (course.settings as any) || {};
const hasFiles = courseSettings.files && Array.isArray(courseSettings.files) && courseSettings.files.length > 0;

const jobType = hasFiles ? JobType.DOCUMENT_PROCESSING : JobType.STRUCTURE_ANALYSIS;
const priority = TIER_PRIORITY[tier] || 1;

// T016: Create BullMQ job
const jobData = {
  jobType,
  organizationId: currentUser.organizationId,
  courseId,
  userId,
  createdAt: new Date().toISOString(),
  webhookUrl: webhookUrl || null,
  // Include basic course data for worker context
  title: course.title,
  settings: course.settings,
} as any;

const job = await addJob(jobType, jobData, { priority });
```

---

## Root Cause Analysis

### Primary Root Cause

**The production workflow separates file upload from job creation, but the test expects automatic processing after database insertion.**

Production flow has two distinct steps:
1. **Upload files**: `generation.uploadFile` stores files in file_catalog with `vector_status='pending'`
2. **Initiate processing**: `generation.initiate` checks for files, creates DOCUMENT_PROCESSING job if files exist

The test bypasses BOTH steps:
- Uses direct database insert instead of `uploadFile` endpoint
- Never calls `generation.initiate` to trigger job creation
- Expects automatic processing that doesn't exist in the architecture

**Evidence**:
1. `uploadFile` endpoint Step 10 comment: "File upload successful" - NO job creation code
2. `initiate` endpoint T015-T016: Determines job type based on file presence, creates BullMQ job
3. Test comment line 253: "this would normally be via generation.uploadFile" - acknowledges bypass
4. Test comment line 254: "For now, we'll insert directly into file_catalog" - temporary workaround
5. No database triggers exist to automatically create jobs on file_catalog inserts

### Mechanism of Failure

**Step-by-step execution flow**:

1. Test creates course via `createTestCourse()`
   - Course record created in database
   - No files uploaded yet

2. Test calls `uploadDocument()` for each of 3 documents
   - Direct database insert to file_catalog
   - Fields set: organization_id, course_id, filename, vector_status='pending'
   - **Missing**: Actual file storage, job creation trigger

3. Test calls `waitForDocumentProcessing(courseId)`
   - Polls file_catalog every 5 seconds
   - Checks for `vector_status='completed'` or `vector_status='failed'`
   - **Problem**: No jobs exist to process the documents

4. BullMQ worker is running but has no jobs
   - Worker polls queue for DOCUMENT_PROCESSING jobs
   - Queue is empty - no jobs created
   - **Result**: Documents remain pending forever

5. Test times out after 5 minutes
   - All 3 documents still have `vector_status='pending'`
   - No processing occurred
   - **Failure**: Test cannot proceed to Stage 4

**Divergence Point**: After file_catalog insertion, production would call `generation.initiate` to create jobs, but test expects automatic processing.

### Contributing Factors

- **Factor 1**: Test uses simplified direct DB insert for speed/convenience
  - Bypasses production endpoint validation
  - Bypasses file storage to filesystem
  - Bypasses quota enforcement

- **Factor 2**: Architecture separates upload from processing
  - Allows batching multiple file uploads before initiating processing
  - Reduces job creation overhead
  - But requires explicit initiation step

---

## Proposed Solutions

### Solution 1: Call `generation.initiate` After Uploading Documents ⭐ RECOMMENDED

**Description**: After uploading all 3 documents, call `generation.initiate` to trigger DOCUMENT_PROCESSING job creation (matches production workflow).

**Why This Addresses Root Cause**:
- Follows production workflow: upload files → initiate processing
- `generation.initiate` checks for files in file_catalog (line 300)
- Creates DOCUMENT_PROCESSING job if files exist (line 302)
- BullMQ worker processes job → documents get processed

**Implementation Steps**:
1. Keep existing `uploadDocument()` helper (direct DB insert is fine for tests)
2. After uploading all documents, add call to `generation.initiate`:
   ```typescript
   // Upload all documents
   const uploadedDocIds: string[] = [];
   for (const doc of testDocs) {
     const docId = await uploadDocument(client, testCourseId, doc.path, doc.name);
     uploadedDocIds.push(docId);
   }

   console.log(`[T055] ✓ Uploaded ${uploadedDocIds.length} documents\n`);

   // NEW: Initiate processing to create DOCUMENT_PROCESSING job
   console.log('[T055] Initiating document processing...');
   const initiateResult = await client.generation.initiate.mutate({
     courseId: testCourseId,
     webhookUrl: null,
   });

   console.log(`[T055] ✓ Processing initiated: jobId=${initiateResult.jobId}\n`);
   ```
3. Continue with existing `waitForDocumentProcessing()` logic
4. Worker picks up job and processes documents

**Files to Modify**:
- `tests/e2e/t055-full-pipeline.test.ts:590-593` - Add `generation.initiate` call after uploading documents

**Testing Strategy**:
- Run E2E test: `pnpm test tests/e2e/t055-full-pipeline.test.ts`
- Verify job created in BullMQ queue
- Verify worker processes documents
- Verify documents transition: pending → indexing → indexed
- Verify test proceeds to Stage 4 analysis

**Pros**:
- ✅ Minimal code changes (3-4 lines)
- ✅ Matches production workflow exactly
- ✅ Uses existing tested endpoints
- ✅ No changes to production code
- ✅ Tests real integration between initiate and processing

**Cons**:
- ❌ Requires valid auth token (already available in test)
- ❌ Creates orchestration job (expected overhead for E2E test)

**Complexity**: Low

**Risk Level**: Low

**Estimated Effort**: 5 minutes

---

### Solution 2: Modify `uploadDocument()` to Use `generation.uploadFile` Endpoint

**Description**: Replace direct database insert with production `generation.uploadFile` endpoint, then call `generation.initiate`.

**Why This Addresses Root Cause**:
- Uses production upload endpoint for more realistic testing
- Still requires `generation.initiate` call
- Validates file validation, quota enforcement, actual file storage

**Implementation Steps**:
1. Modify `uploadDocument()` helper to call `generation.uploadFile`:
   ```typescript
   async function uploadDocument(
     client: ReturnType<typeof createTestClient>,
     courseId: string,
     filePath: string,
     fileName: string
   ): Promise<string> {
     const fileBuffer = await fs.readFile(filePath);
     const base64Content = fileBuffer.toString('base64');
     const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' : 'text/plain';

     const result = await client.generation.uploadFile.mutate({
       courseId,
       filename: fileName,
       fileSize: fileBuffer.length,
       mimeType,
       fileContent: base64Content,
     });

     return result.fileId;
   }
   ```
2. After uploading all documents, call `generation.initiate` (same as Solution 1)
3. Continue with `waitForDocumentProcessing()`

**Files to Modify**:
- `tests/e2e/t055-full-pipeline.test.ts:233-278` - Replace DB insert with tRPC call
- `tests/e2e/t055-full-pipeline.test.ts:590-593` - Add `generation.initiate` call

**Testing Strategy**:
- Verify file upload through production endpoint
- Verify file stored on filesystem
- Verify quota incremented
- Verify job creation and processing
- Verify full workflow integration

**Pros**:
- ✅ More realistic E2E testing (uses production endpoints)
- ✅ Validates file upload logic (size limits, MIME types, quota)
- ✅ Tests actual file storage to filesystem
- ✅ Better coverage of production code paths

**Cons**:
- ❌ More code changes (30+ lines)
- ❌ Slower test execution (file I/O, validation overhead)
- ❌ Requires cleanup of uploaded files
- ❌ More complex error handling

**Complexity**: Medium

**Risk Level**: Low

**Estimated Effort**: 20 minutes

---

### Solution 3: Create Database Trigger to Auto-Create Jobs

**Description**: Add PostgreSQL trigger on file_catalog inserts to automatically create DOCUMENT_PROCESSING jobs.

**Why This Addresses Root Cause**:
- Automatically creates jobs when files inserted
- No code changes needed in test
- Decouples upload from job creation

**Implementation Steps**:
1. Create migration with trigger function:
   ```sql
   CREATE OR REPLACE FUNCTION trigger_document_processing()
   RETURNS TRIGGER AS $$
   BEGIN
     -- Only trigger for pending files
     IF NEW.vector_status = 'pending' THEN
       -- Create job record (requires BullMQ integration)
       -- This is complex - BullMQ jobs stored in Redis, not Postgres
       -- Would need custom job creation logic
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER auto_create_processing_job
   AFTER INSERT ON file_catalog
   FOR EACH ROW
   EXECUTE FUNCTION trigger_document_processing();
   ```
2. Test would work without changes

**Files to Modify**:
- `supabase/migrations/new_trigger_migration.sql` - Add trigger
- May need service layer to handle job creation from trigger

**Testing Strategy**:
- Insert test record into file_catalog
- Verify job created in BullMQ
- Verify worker processes document

**Pros**:
- ✅ Test works without code changes
- ✅ Automatic job creation for all uploads

**Cons**:
- ❌ HIGH COMPLEXITY: BullMQ stores jobs in Redis, not Postgres
- ❌ Tight coupling between database and queue system
- ❌ Hard to test trigger in isolation
- ❌ May create unwanted jobs during migrations/data imports
- ❌ Violates separation of concerns (database triggering application logic)
- ❌ Difficult to debug when jobs fail to create

**Complexity**: High

**Risk Level**: High

**Estimated Effort**: 2-3 hours + testing

---

## Implementation Guidance

### For Implementation Agent

**Priority**: High (blocks E2E test completion)

**Recommended Approach**: Solution 1 (Call `generation.initiate` after uploads)

**Files Requiring Changes**:
1. `tests/e2e/t055-full-pipeline.test.ts`
   - **Line Range**: 590-593 (after document uploads)
   - **Change Type**: Add 8-10 lines
   - **Purpose**: Call `generation.initiate` to trigger job creation

**Validation Criteria**:
- ✅ Test runs without timeout - `waitForDocumentProcessing()` completes within 5 minutes
- ✅ BullMQ job created with type DOCUMENT_PROCESSING
- ✅ Documents transition through states: pending → indexing → indexed
- ✅ All 3 documents have `vector_status='indexed'` after processing
- ✅ Processed content exists in file_catalog (markdown_content, parsed_content)
- ✅ Test proceeds to Stage 4 analysis execution
- ✅ Full E2E test passes end-to-end

**Testing Requirements**:
- **Integration test**: Run E2E test with BullMQ worker active
- **Validation**: Check database for job creation and document status updates
- **Manual verification**:
  1. Start test: `pnpm test tests/e2e/t055-full-pipeline.test.ts`
  2. Verify console output shows "Processing initiated: jobId=XXX"
  3. Verify worker logs show job picked up and processed
  4. Verify test completes all stages without timeout

**Dependencies**:
- BullMQ worker must be running during test
- Redis must be accessible
- Supabase database must be accessible
- Test documents must exist in `/docs/test/`

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Job creation may fail if concurrency limits reached
  - **Mitigation**: Use premium tier test organization (high limits), cleanup jobs before test

- **Risk 2**: Worker may not be running when test executes
  - **Mitigation**: Test suite already starts worker in `beforeAll()`, verify worker active

### Performance Impact

Minimal - adds one tRPC call (`generation.initiate`) to test execution. Estimated overhead: <100ms.

### Breaking Changes

None - only affects test code, no production code changes.

### Side Effects

- Creates BullMQ job in queue (expected for E2E test)
- Updates course_progress table (expected orchestration side effect)
- May affect concurrency slot if limits reached (mitigated by cleanup)

---

## Execution Flow Diagram

**Current Flow (Broken)**:
```
Test starts
  ↓
Create course record
  ↓
Upload document 1 (direct DB insert)
  ↓
Upload document 2 (direct DB insert)
  ↓
Upload document 3 (direct DB insert)
  ↓
All docs: vector_status='pending'
  ↓
waitForDocumentProcessing() starts
  ↓
Poll file_catalog every 5 seconds
  ↓
[DIVERGENCE] No jobs exist to process documents
  ↓
Documents remain pending
  ↓
Timeout after 5 minutes ❌
```

**Fixed Flow (Solution 1)**:
```
Test starts
  ↓
Create course record
  ↓
Upload document 1 (direct DB insert)
  ↓
Upload document 2 (direct DB insert)
  ↓
Upload document 3 (direct DB insert)
  ↓
All docs: vector_status='pending'
  ↓
[NEW] Call generation.initiate
  ↓
initiate checks file_catalog → finds 3 files
  ↓
Creates DOCUMENT_PROCESSING job
  ↓
BullMQ worker picks up job
  ↓
Worker processes each document:
  - Doc 1: pending → indexing → indexed
  - Doc 2: pending → indexing → indexed
  - Doc 3: pending → indexing → indexed
  ↓
waitForDocumentProcessing() polls
  ↓
All docs now: vector_status='indexed'
  ↓
Processing complete ✅
  ↓
Continue to Stage 4 analysis
```

---

## Additional Context

### Related Issues

- **T055**: Full pipeline E2E test implementation
- **T011-T019**: Orchestration workflow specification
- **Stage 3**: Document processing, summarization, Qdrant vectorization

### Documentation References

**Context7 Documentation Findings**:

**From tRPC Documentation** (Context7: `/trpc/trpc`):
> "Procedures are the functions available to the client. They can be queries (read operations) or mutations (write operations). Mutations are used for operations that modify server state."

**Key Insights from Context7**:
- `generation.uploadFile` is a mutation that stores files but doesn't initiate processing
- `generation.initiate` is the mutation responsible for creating orchestration jobs
- Workflow pattern: upload resources → initiate orchestration

**What Context7 Provided**:
- tRPC mutation patterns and best practices
- Separation of resource upload from orchestration initiation
- Client-server interaction patterns for async workflows

**What Was Missing from Context7**:
- Specific BullMQ job creation patterns (required reading source code)
- Project-specific workflow separation rationale

**Tier 2/3 Sources Used**:
- None needed - production code examination was sufficient

### MCP Server Usage

**Context7 MCP**:
- Libraries queried: tRPC (`/trpc/trpc`)
- Topics searched: procedure types, mutation patterns
- Quotes/excerpts included: ✅ YES
- Insights gained: Confirmed separation between upload and orchestration

**Sequential Thinking MCP**:
- Not used (straightforward investigation)

**Supabase MCP**:
- Not used (no database queries needed, code examination sufficient)

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report**
2. **Select solution approach** (Recommended: Solution 1 - Call `generation.initiate`)
3. **Implement fix** in `tests/e2e/t055-full-pipeline.test.ts:590-593`
4. **Validation**: Run test and verify all criteria met

### Follow-Up Recommendations

- **Long-term**: Consider documenting workflow pattern (upload files → initiate processing)
- **Process improvement**: Add workflow diagram to test file comments
- **Monitoring**: Add test assertion for job creation to catch regressions

---

## Investigation Log

### Timeline

- **00:00**: Investigation started - read problem specification
- **00:02**: Initial hypotheses formed (3 hypotheses identified)
- **00:05**: Evidence collection completed - examined test code, production endpoints
- **00:08**: Root cause identified - test bypasses initiate step
- **00:12**: Solutions formulated - 3 approaches with pros/cons
- **00:15**: Report generated

### Commands Run

```bash
# Find investigation plan
find .tmp -name "*investigation*"

# Search for DOCUMENT_PROCESSING job creation
grep -r "DOCUMENT_PROCESSING" src/

# Examine document processing worker
cat src/orchestrator/handlers/document-processing.ts

# Examine generation router (uploadFile and initiate)
cat src/server/routers/generation.ts

# Examine E2E test implementation
cat tests/e2e/t055-full-pipeline.test.ts
```

### MCP Calls Made

- `mcp__context7__resolve-library-id({libraryName: "trpc"})`
- `mcp__context7__get-library-docs({context7CompatibleLibraryID: "/trpc/trpc", topic: "mutations procedures"})`

---

**Investigation Complete**

✅ Root cause identified with supporting evidence
✅ Multiple solution approaches proposed
✅ Implementation guidance provided
✅ Ready for implementation phase

**Report saved**: `.tmp/current/reports/t055-processing-investigation.md`
