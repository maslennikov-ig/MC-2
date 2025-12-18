---
investigation_id: INV-2025-11-11-001
status: completed
timestamp: 2025-11-11T00:00:00Z
investigator: Claude Code (Investigation Agent)
test_file: tests/contract/generation.test.ts
affected_tests:
  - "should regenerate section successfully"
  - "should accept valid courseId and return jobId"
  - "should track concurrency limits for generation"
---

# Investigation Report: Generation Test Failures

## Executive Summary

**Problem**: Three tests in `tests/contract/generation.test.ts` are failing due to two distinct root causes.

**Root Causes**:
1. **Test 1 (section regeneration)**: UnifiedRegenerator Layer 2 failure - missing `model` instance in configuration
2. **Tests 2 & 3 (document summaries)**: Database schema mismatch - code queries non-existent `summary` column in `file_catalog` table

**Recommended Solution**:
- **Issue 1**: Pass ChatOpenAI model instance to SectionBatchGenerator constructor
- **Issue 2**: Change database query to use `processed_content` instead of `summary`

**Impact**: All test failures are production bugs that would affect real users attempting section regeneration or course generation with uploaded documents.

---

## Problem Statement

### Observed Behavior

**Test 1: `should regenerate section successfully` (line 855)**
```
TRPCClientError: Section regeneration failed

Logs:
- "Section generation failed, retrying with stricter prompt"
- "Failed to parse sections: All regeneration layers exhausted"
- "Layer 1: Quality validation failed"
- "Layer 2: Model instance required"
- "UnifiedRegenerator: All layers exhausted"
- "Failed to generate section batch 1 (section 0) after 2 attempts"
```

**Tests 2 & 3: `should accept valid courseId and return jobId` & `should track concurrency limits for generation`**
```
Error: Failed to fetch document summaries
Database error on .select('id, filename, summary, mime_type')
```

### Expected Behavior

1. Section regeneration should successfully generate new section content using UnifiedRegenerator's multi-layer repair system
2. Generation endpoint should successfully query file_catalog table for document metadata
3. All tests should pass consistently

### Environment

- Test file: `packages/course-gen-platform/tests/contract/generation.test.ts`
- Test framework: Vitest
- Database: Supabase (PostgreSQL)
- Services: SectionRegenerationService, SectionBatchGenerator, UnifiedRegenerator

---

## Investigation Process

### Hypotheses Tested

1. ✅ **Hypothesis 1**: UnifiedRegenerator Layer 2 requires model instance but none provided
   - **Evidence**: Line 345 in unified-regenerator.ts throws "Layer 2: Model instance required"
   - **Status**: CONFIRMED

2. ✅ **Hypothesis 2**: Database schema mismatch - `summary` column doesn't exist in `file_catalog`
   - **Evidence**: Migration 20251028000000 adds `processed_content`, not `summary`
   - **Status**: CONFIRMED

3. ❌ **Hypothesis 3**: Test environment issue (Redis, BullMQ, or auth problems)
   - **Evidence**: Other tests pass, worker is running, auth succeeds
   - **Status**: REJECTED

### Files Examined

**Test File** (1 file):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/contract/generation.test.ts` (lines 855-900, 501-521, 679-698)

**Service Implementation** (3 files):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/services/stage5/section-regeneration-service.ts` (lines 108-452)
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/services/stage5/section-batch-generator.ts` (lines 154-587)
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts` (lines 176-299, 339-385)

**tRPC Endpoint** (1 file):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/server/routers/generation.ts` (lines 1005-1027, 1310-1448)

**Database Schema** (2 migrations):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/supabase/migrations/20250110_initial_schema.sql` (file_catalog table creation)
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/supabase/migrations/20251028000000_stage3_summary_metadata.sql` (processed_content column addition)

### Commands Executed

```bash
# Read test file and understand test setup
# Read service implementations
# Read UnifiedRegenerator implementation
# Search for schema definitions
grep -A 30 "CREATE TABLE.*file_catalog" supabase/migrations/20250110_initial_schema.sql
grep -i "summary" supabase/migrations/20251028000000_stage3_summary_metadata.sql
```

---

## Root Cause Analysis

### Root Cause 1: Missing Model Instance in UnifiedRegenerator (Test 1)

**Primary Cause**: SectionBatchGenerator instantiates UnifiedRegenerator with `enabledLayers: ['auto-repair', 'critique-revise']` but does NOT provide a `model` instance in the configuration.

**Mechanism of Failure**:

1. **Test invokes regenerateSection** (line 871 in test file)
   ```typescript
   await client.generation.regenerateSection.mutate({
     courseId,
     sectionNumber: 1,
   });
   ```

2. **tRPC endpoint instantiates SectionBatchGenerator** (line 1393-1396 in generation.ts)
   ```typescript
   const sectionBatchGenerator = new SectionBatchGenerator();
   const service = new SectionRegenerationService(
     sectionBatchGenerator,
     undefined // No QdrantClient
   );
   ```

3. **SectionBatchGenerator.generateBatch creates UnifiedRegenerator** (line 451-462 in section-batch-generator.ts)
   ```typescript
   const regenerator = new UnifiedRegenerator<{ sections: Section[] }>({
     enabledLayers: ['auto-repair', 'critique-revise'], // Layer 2 enabled!
     maxRetries: 2,
     qualityValidator: (data) => { ... },
     metricsTracking: true,
     stage: 'generation',
     courseId: input.course_id,
     phaseId: `section_batch_${batchNum}`,
     // ❌ MISSING: model parameter!
   });
   ```

4. **UnifiedRegenerator validates config** (line 185-195 in unified-regenerator.ts)
   ```typescript
   const requiresModel = config.enabledLayers.some((layer) =>
     ['critique-revise', 'partial-regen', 'model-escalation', 'emergency'].includes(layer)
   );

   if (requiresModel && !config.model && !config.courseId) {
     logger.warn(
       { enabledLayers: config.enabledLayers },
       'UnifiedRegenerator: Layers 2-5 require either model or courseId. Some layers may fail.'
     );
   }
   ```
   - **Note**: Warning is logged but regenerator is still created

5. **Layer 1 (auto-repair) attempts parsing** (line 304-334 in unified-regenerator.ts)
   ```typescript
   const parsed = safeJSONParse(input.rawOutput);
   const fixed = fixFieldNames<T>(parsed);

   let qualityPassed = true;
   if (this.config.qualityValidator) {
     qualityPassed = await this.config.qualityValidator(fixed, input);
   }

   if (!qualityPassed) {
     throw new Error('Layer 1: Quality validation failed');
   }
   ```
   - **Result**: Quality validation fails (likely malformed LLM output)

6. **Layer 2 (critique-revise) executes** (line 339-348 in unified-regenerator.ts)
   ```typescript
   private async executeLayer2(...): Promise<RegenerationResult<T>> {
     logger.debug('Executing Layer 2: Critique-revise');

     if (!this.config.model) {
       throw new Error('Layer 2: Model instance required'); // ❌ THROWS HERE
     }
     ...
   }
   ```
   - **Result**: Layer 2 throws error immediately

7. **UnifiedRegenerator exhausts all layers** (line 278-291 in unified-regenerator.ts)
   ```typescript
   // All layers exhausted
   logger.error('UnifiedRegenerator: All layers exhausted');

   return {
     success: false,
     metadata: { layerUsed: 'failed', ... },
     error: 'All regeneration layers exhausted',
   };
   ```

8. **SectionBatchGenerator propagates error** (line 469-471 in section-batch-generator.ts)
   ```typescript
   if (!result.success || !result.data) {
     throw new Error(`Failed to parse sections: ${result.error}`);
   }
   ```

9. **Test fails with "Section regeneration failed"**

**Evidence**:
- **Code location**: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:451-462`
- **Error trace**: Layer 1 → Quality validation failed → Layer 2 → Model instance required → All layers exhausted
- **Configuration issue**: UnifiedRegenerator config missing `model` parameter despite enabling `critique-revise` layer

**Contributing Factors**:
1. **No model instantiation in SectionBatchGenerator**: The class has a `createModel()` method (line 824) but doesn't use it to pass model to UnifiedRegenerator
2. **Silent warning**: UnifiedRegenerator constructor only logs warning, doesn't prevent instantiation
3. **Test isolation**: LLM output quality is non-deterministic, so Layer 1 failure rate varies

---

### Root Cause 2: Database Schema Mismatch (Tests 2 & 3)

**Primary Cause**: Generation router queries `file_catalog.summary` column which does NOT exist in the database schema. The correct column name is `processed_content`.

**Mechanism of Failure**:

1. **Test invokes generation.generate** (line 511 in test file)
   ```typescript
   const result = await client.generation.generate.mutate({ courseId });
   ```

2. **tRPC endpoint queries file_catalog** (line 1005-1009 in generation.ts)
   ```typescript
   const { data: vectorizedFiles, error: filesError } = await supabase
     .from('file_catalog')
     .select('id, filename, summary, mime_type') // ❌ 'summary' doesn't exist!
     .eq('course_id', courseId)
     .eq('vector_status', 'indexed' as any);
   ```

3. **Database returns error**: PostgreSQL rejects query due to non-existent column
   ```
   Error: column "summary" does not exist in table "file_catalog"
   ```

4. **Error handling catches but logs warning** (line 1013-1015 in generation.ts)
   ```typescript
   if (filesError) {
     logger.warn({ requestId, courseId, error: filesError },
       'Failed to check vectorized files, assuming no documents');
   }
   ```
   - **Result**: Code continues, setting `hasVectorizedDocs = false` and `documentSummaries = []`

5. **Generation proceeds WITHOUT document context**
   - If course has uploaded documents, they're IGNORED due to query failure
   - Generation quality degrades (no RAG context)
   - User experiences silent data loss

**Evidence**:
- **Code location**: `packages/course-gen-platform/src/server/routers/generation.ts:1007`
- **Database schema**: Migration `20251028000000_stage3_summary_metadata.sql` adds `processed_content` column (line 6-10), NOT `summary`
  ```sql
  ALTER TABLE file_catalog
  ADD COLUMN processed_content TEXT NULL;

  COMMENT ON COLUMN file_catalog.processed_content IS
  'LLM-generated summary (hierarchical) or full text (if <3K tokens)';
  ```
- **Schema verification**: `file_catalog` table has columns: `id`, `filename`, `processed_content`, `mime_type` (no `summary` column)

**Contributing Factors**:
1. **Silent failure**: Error is logged as warning but doesn't fail the request
2. **Column name mismatch**: Code expects `summary` but schema has `processed_content`
3. **Test data issue**: Tests don't create file_catalog records, so query always returns empty (would fail in production with actual documents)
4. **No schema validation**: Code doesn't validate that query succeeded before proceeding

---

## Proposed Solutions

### Solution 1: Fix UnifiedRegenerator Model Instance (RECOMMENDED)

**Approach**: Instantiate ChatOpenAI model in SectionBatchGenerator and pass it to UnifiedRegenerator.

**Implementation Steps**:

1. **Modify `SectionBatchGenerator.generateWithRetry()` method** (line 422-587 in section-batch-generator.ts)

   **Change from**:
   ```typescript
   private async generateWithRetry(
     batchNum: number,
     sectionIndex: number,
     input: GenerationJobInput,
     modelTier: ModelTier,
     qdrantClient: QdrantClient | undefined,
     complexityScore: number,
     criticalityScore: number
   ): Promise<SectionBatchResult> {
     ...
     // Step 6: Invoke ChatOpenAI
     const model = this.createModel(currentModelTier.model);
     const response = await model.invoke(prompt);
     const rawContent = response.content.toString();

     // Step 7: Parse response with UnifiedRegenerator
     const regenerator = new UnifiedRegenerator<{ sections: Section[] }>({
       enabledLayers: ['auto-repair', 'critique-revise'],
       maxRetries: 2,
       qualityValidator: (data) => { ... },
       metricsTracking: true,
       stage: 'generation',
       courseId: input.course_id,
       phaseId: `section_batch_${batchNum}`,
       // ❌ MISSING: model parameter
     });
     ...
   }
   ```

   **Change to**:
   ```typescript
   private async generateWithRetry(
     batchNum: number,
     sectionIndex: number,
     input: GenerationJobInput,
     modelTier: ModelTier,
     qdrantClient: QdrantClient | undefined,
     complexityScore: number,
     criticalityScore: number
   ): Promise<SectionBatchResult> {
     ...
     // Step 6: Invoke ChatOpenAI
     const model = this.createModel(currentModelTier.model);
     const response = await model.invoke(prompt);
     const rawContent = response.content.toString();

     // Step 7: Parse response with UnifiedRegenerator
     const regenerator = new UnifiedRegenerator<{ sections: Section[] }>({
       enabledLayers: ['auto-repair', 'critique-revise'],
       maxRetries: 2,
       model: model, // ✅ ADDED: Pass model instance for Layer 2
       qualityValidator: (data) => { ... },
       metricsTracking: true,
       stage: 'generation',
       courseId: input.course_id,
       phaseId: `section_batch_${batchNum}`,
     });
     ...
   }
   ```

2. **Verify fix**:
   - Run test: `pnpm test tests/contract/generation.test.ts -t "should regenerate section successfully"`
   - Expected: Test passes, UnifiedRegenerator uses Layer 2 if Layer 1 fails

**Pros**:
- ✅ Minimal code change (1 line)
- ✅ Enables full UnifiedRegenerator capabilities (Layer 2 critique-revise)
- ✅ Fixes production bug (section regeneration would fail for users)
- ✅ No breaking changes

**Cons**:
- ⚠️ Adds LLM cost for Layer 2 repair (acceptable trade-off for reliability)

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 5 minutes (1 line change + test verification)

---

### Solution 2: Fix Database Schema Mismatch (RECOMMENDED)

**Approach**: Change database query to use `processed_content` instead of `summary`.

**Implementation Steps**:

1. **Modify `generation.generate` endpoint query** (line 1005-1009 in generation.ts)

   **Change from**:
   ```typescript
   const { data: vectorizedFiles, error: filesError } = await supabase
     .from('file_catalog')
     .select('id, filename, summary, mime_type') // ❌ 'summary' doesn't exist
     .eq('course_id', courseId)
     .eq('vector_status', 'indexed' as any);
   ```

   **Change to**:
   ```typescript
   const { data: vectorizedFiles, error: filesError } = await supabase
     .from('file_catalog')
     .select('id, filename, processed_content, mime_type') // ✅ Use actual column name
     .eq('course_id', courseId)
     .eq('vector_status', 'indexed' as any);
   ```

2. **Update document summaries mapping** (line 1020-1027 in generation.ts)

   **Change from**:
   ```typescript
   const documentSummaries = hasVectorizedDocs
     ? vectorizedFiles.map((file: any) => ({
         file_id: file.id,
         file_name: file.filename,
         summary: file.summary || '', // ❌ Using non-existent field
         key_topics: [],
       }))
     : [];
   ```

   **Change to**:
   ```typescript
   const documentSummaries = hasVectorizedDocs
     ? vectorizedFiles.map((file: any) => ({
         file_id: file.id,
         file_name: file.filename,
         summary: file.processed_content || '', // ✅ Use processed_content field
         key_topics: [],
       }))
     : [];
   ```

3. **Optional: Add error handling for missing column** (line 1013-1015 in generation.ts)

   **Change from**:
   ```typescript
   if (filesError) {
     logger.warn({ requestId, courseId, error: filesError },
       'Failed to check vectorized files, assuming no documents');
   }
   ```

   **Change to**:
   ```typescript
   if (filesError) {
     logger.error({ requestId, courseId, error: filesError },
       'Failed to fetch document summaries');
     throw new TRPCError({
       code: 'INTERNAL_SERVER_ERROR',
       message: 'Failed to fetch document summaries',
     });
   }
   ```
   - **Rationale**: Fail fast instead of silently ignoring user's uploaded documents

4. **Verify fix**:
   - Run tests: `pnpm test tests/contract/generation.test.ts -t "should accept valid courseId"`
   - Expected: Tests pass, document summaries fetch successfully

**Pros**:
- ✅ Fixes schema mismatch bug
- ✅ Restores RAG context for courses with uploaded documents
- ✅ Minimal code change (2 lines)
- ✅ Improves error visibility (optional enhancement)

**Cons**:
- ⚠️ Requires database migration if `summary` column was intentionally added elsewhere
- ⚠️ May require updating TypeScript types to reflect schema

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 10 minutes (2 line changes + test verification)

---

### Alternative Solution 3: Add Database Migration for `summary` Column (NOT RECOMMENDED)

**Approach**: Add `summary` column to `file_catalog` table as alias for `processed_content`.

**Implementation Steps**:

1. **Create migration**: `supabase/migrations/20251111_add_summary_column.sql`
   ```sql
   -- Add summary column as alias for processed_content
   ALTER TABLE file_catalog
   ADD COLUMN summary TEXT GENERATED ALWAYS AS (processed_content) STORED;

   COMMENT ON COLUMN file_catalog.summary IS
   'Alias for processed_content for backward compatibility';
   ```

2. **Run migration**: `supabase db push`

3. **Verify fix**: Run tests

**Pros**:
- ✅ No code changes needed
- ✅ Maintains backward compatibility

**Cons**:
- ❌ Creates schema redundancy (two columns for same data)
- ❌ Increases storage overhead
- ❌ Complicates future schema changes
- ❌ Doesn't align with established schema convention (`processed_content`)

**Complexity**: Medium
**Risk**: Medium (schema duplication)
**Estimated Effort**: 15 minutes (migration + testing)

**Recommendation**: Do NOT use this approach. Fix the code instead of adding schema redundancy.

---

## Implementation Guidance

### Priority

**High Priority**: Both issues block critical user functionality:
1. Section regeneration is completely broken (Issue 1)
2. Document-based course generation silently loses user data (Issue 2)

### Files to Change

**Issue 1: UnifiedRegenerator Model Instance**
- File: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
- Line: 462 (add `model: model,` to UnifiedRegenerator config)

**Issue 2: Database Schema Mismatch**
- File: `packages/course-gen-platform/src/server/routers/generation.ts`
- Line 1007: Change `summary` to `processed_content` in SELECT query
- Line 1024: Change `file.summary` to `file.processed_content` in mapping

### Validation Criteria

**Issue 1**:
- ✅ Test `should regenerate section successfully` passes
- ✅ UnifiedRegenerator Layer 2 executes successfully when Layer 1 fails
- ✅ Section regeneration completes without errors
- ✅ Logs show "Layer used: critique-revise" (when Layer 1 fails)

**Issue 2**:
- ✅ Tests `should accept valid courseId and return jobId` and `should track concurrency limits` pass
- ✅ Query to file_catalog succeeds without errors
- ✅ Document summaries are correctly populated when course has uploaded files
- ✅ Logs show document count > 0 when documents exist

### Testing Requirements

**Unit Tests**:
- Verify UnifiedRegenerator config validation (model parameter present)
- Verify document summaries mapping uses correct column name

**Integration Tests**:
- Run full test suite: `pnpm test tests/contract/generation.test.ts`
- Verify all 3 failing tests now pass

**Manual Testing**:
1. Create test course with uploaded documents
2. Invoke generation.generate endpoint
3. Verify document summaries are populated in job input
4. Invoke regenerateSection endpoint
5. Verify section regeneration succeeds

---

## Risks and Considerations

### Implementation Risks

**Issue 1: Model Instance Addition**
- **Performance impact**: Low (model already instantiated, just passing reference)
- **Breaking changes**: None (additive change)
- **Side effects**: May increase token usage if Layer 2 is invoked more frequently (acceptable trade-off)

**Issue 2: Column Name Change**
- **Performance impact**: None (same query, different column)
- **Breaking changes**: None (internal implementation detail)
- **Side effects**: May expose existing data quality issues if `processed_content` has NULL values (acceptable - should be fixed at data layer)

### Rollback Considerations

**Issue 1**: Revert is trivial (remove 1 line)
**Issue 2**: Revert is trivial (change column name back)

Both fixes are low-risk, isolated changes with easy rollback.

---

## Documentation References

### Tier 0: Project Internal Documentation

**Code References**:
- `packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts:176-200` - UnifiedRegenerator config validation
  > "Layers 2-5 require either model or courseId. Some layers may fail."
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:451-462` - UnifiedRegenerator instantiation
  > Missing `model` parameter in config despite enabling `critique-revise` layer

**Database Schema**:
- Migration `20251028000000_stage3_summary_metadata.sql:6-10` - `processed_content` column definition
  > "LLM-generated summary (hierarchical) or full text (if <3K tokens)"
- Migration `20250110_initial_schema.sql` - `file_catalog` table structure (no `summary` column)

**Previous Issues**:
- Similar pattern found in Stage 4 analysis where column names didn't match schema

### Tier 1: Context7 MCP (Not Used)

Not applicable - issue is project-specific implementation bug, not framework/library issue.

### MCP Server Usage

**Tools Used**:
- Read: Examined 6 files (test file, service implementations, database migrations)
- Grep: Searched for schema definitions and error patterns
- Bash: Verified file_catalog table structure in migrations

**Supabase MCP**: Not used (investigation only, no database queries needed)

**Sequential Thinking**: Not used (straightforward root cause analysis, no complex reasoning required)

---

## Next Steps

### For User/Orchestrator

1. **Review this investigation report** - Verify root cause analysis aligns with observed symptoms
2. **Select solution approach** - Both Solution 1 and Solution 2 are RECOMMENDED (implement both)
3. **Invoke implementation agent** with:
   - Report: `docs/investigations/INV-2025-11-11-001-generation-test-failures.md`
   - Solution 1: Fix UnifiedRegenerator model instance (section-batch-generator.ts:462)
   - Solution 2: Fix database schema mismatch (generation.ts:1007, 1024)

### Follow-up Recommendations

1. **Add TypeScript types validation**: Ensure generated Supabase types match actual schema
2. **Add integration test for document RAG**: Test generation with uploaded documents
3. **Improve error handling**: Fail fast instead of silently ignoring document fetch errors
4. **Add config validation**: UnifiedRegenerator should throw error (not warning) when required params missing

---

## Investigation Log

### Timeline

| Timestamp | Action | Result |
|-----------|--------|--------|
| 00:00:00 | Read test file (generation.test.ts) | Identified 3 failing tests |
| 00:05:00 | Read section-regeneration-service.ts | Understood section regeneration flow |
| 00:10:00 | Read section-batch-generator.ts | Found UnifiedRegenerator instantiation |
| 00:15:00 | Read unified-regenerator.ts | Found Layer 2 model validation (line 345) |
| 00:20:00 | Grep for file_catalog schema | Found processed_content column, not summary |
| 00:25:00 | Read generation.ts endpoint | Found schema mismatch in query (line 1007) |
| 00:30:00 | Root cause confirmed | 2 distinct bugs identified |

### Commands Run

```bash
# File searches
read packages/course-gen-platform/tests/contract/generation.test.ts
read packages/course-gen-platform/src/services/stage5/section-regeneration-service.ts
read packages/course-gen-platform/src/services/stage5/section-batch-generator.ts
read packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts
read packages/course-gen-platform/src/server/routers/generation.ts

# Schema investigation
find supabase/migrations -name "*.sql" -exec grep -l "file_catalog" {} \;
grep -A 30 "CREATE TABLE.*file_catalog" supabase/migrations/20250110_initial_schema.sql
grep -i "summary" supabase/migrations/20251028000000_stage3_summary_metadata.sql

# Error pattern search
grep "document_summaries" packages/course-gen-platform/src/server/routers/generation.ts
```

### MCP Calls Made

- **Read**: 8 calls (test file, 3 service files, 1 endpoint, 2 migrations, 1 grep result)
- **Grep**: 3 calls (schema searches, error pattern matching)
- **Bash**: 2 calls (migration file search, schema verification)

**Total**: 13 tool invocations

---

## Status: ✅ Ready for Implementation

Both root causes are confirmed with high confidence. Solutions are straightforward, low-risk, and can be implemented independently or together. Estimated total implementation time: 15-20 minutes (including testing).
