---
report_type: investigation
generated: 2025-10-26T00:00:00Z
investigation_id: INV-2025-10-26-001
status: complete
agent: problem-investigator
duration: 45 minutes
---

# Investigation Report: Qdrant Vector Query Returning 0 Results

**Investigation ID**: INV-2025-10-26-001
**Generated**: 2025-10-26T00:00:00Z
**Status**: ✅ Complete
**Duration**: 45 minutes

---

## Executive Summary

Investigation into why Qdrant vector queries return 0 results despite successful vector uploads has identified a **payload field name mismatch** between upload and query operations.

**Root Cause**: Test code queries for `file_id` field while upload code stores `document_id` field in payload.

**Recommended Solution**: Update test query to use `document_id` instead of `file_id`.

### Key Findings

- **Finding 1**: Upload code stores `document_id` in payload (upload-helpers.ts:98)
- **Finding 2**: Test queries for non-existent `file_id` field (document-processing-worker.test.ts:213)
- **Finding 3**: Payload index configured for `file_id` but field never populated (create-collection.ts:105)

---

## Problem Statement

### Observed Behavior

Integration tests are failing with the following error:
```
expect(vectorStats.totalVectors).toBeGreaterThanOrEqual(7)
Actual: totalVectors=0
```

Vectors are successfully uploaded to Qdrant (logs show 22 points uploaded), and the database correctly shows `vector_status='indexed'` with `chunk_count=22`. However, when querying Qdrant using `file_id` filter, zero results are returned.

### Expected Behavior

Query should return the 22 uploaded vectors when filtering by the file identifier.

### Impact

- All integration tests for document processing worker are failing
- Cannot verify end-to-end workflow functionality
- Blocks validation of tier-based file processing

### Environmental Context

- **Environment**: Test environment
- **Related Changes**:
  - Removed redundant `updateQdrantVectorStatus()` call from document-processing.ts:190
  - Changed collection name from 'course_documents' to 'course_embeddings' in tests
  - Added `file_id` to PAYLOAD_INDEXES in create-collection.ts
  - Manually added `file_id` index to existing collection via script
- **First Observed**: During Stage 2 implementation integration testing
- **Frequency**: Consistently fails (100% reproduction rate)

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: Payload structure mismatch - `document_id` vs `file_id`
   - **Likelihood**: High
   - **Test Plan**: Compare payload structure in upload code vs test query code

2. **Hypothesis 2**: Timing issue - vectors not yet indexed when query runs
   - **Likelihood**: Low (tests wait for status='indexed')
   - **Test Plan**: Check test polling logic and Qdrant indexing status

3. **Hypothesis 3**: Collection name mismatch - wrong collection queried
   - **Likelihood**: Low (recently fixed to 'course_embeddings')
   - **Test Plan**: Verify collection names in upload and query match

### Files Examined

- `packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts` - Payload structure definition
  - Line 98: Stores `document_id: chunk.document_id` in payload
  - No `file_id` field present in payload

- `packages/course-gen-platform/tests/integration/document-processing-worker.test.ts` - Test query implementation
  - Line 213: Queries for `file_id` field in filter
  - Lines 198-250: `queryVectorsByFileId()` function implementation

- `packages/course-gen-platform/src/shared/qdrant/create-collection.ts` - Index configuration
  - Line 105: Defines `file_id` payload index (never populated)
  - Lines 108-115: Defines `course_id` and `organization_id` indexes

- `packages/course-gen-platform/src/shared/embeddings/metadata-enricher.ts` - EnrichedChunk type definition
  - Lines 19-49: `EnrichedChunk` interface includes `document_id` field
  - No `file_id` field in type definition

### Commands Executed

```bash
# Command 1: Search for file_id usage in Qdrant code
grep -r "file_id" src/shared/qdrant/*.ts | grep -v "original_file_id" | head -20
# Result: Found file_id in lifecycle.ts (deduplication feature) and create-collection.ts (index config)
# No file_id in upload-helpers.ts payload structure

# Command 2: Context7 documentation research
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/qdrant/qdrant-js",
  topic: "payload filtering scroll query"
})
# Result: Confirmed correct Qdrant scroll filter syntax:
# filter: { must: [{ key: 'field_name', match: { value: 'value' } }] }
```

### Data Collected

**From upload-helpers.ts (toQdrantPoint function, lines 78-124)**:
```typescript
const rawPayload = {
  // Chunk metadata
  chunk_id: chunk.chunk_id,
  parent_chunk_id: chunk.parent_chunk_id,
  // ... other fields ...

  // Document metadata
  document_id: chunk.document_id,  // ← USES document_id
  document_name: chunk.document_name,
  document_version: chunk.document_version,
  version_hash: chunk.version_hash,

  // ... remaining fields ...
};
```

**From test file (queryVectorsByFileId function, lines 208-221)**:
```typescript
const scrollResponse = await qdrantClient.scroll(collectionName, {
  filter: {
    must: [
      {
        key: 'file_id',  // ← QUERIES file_id (WRONG)
        match: { value: fileId }
      }
    ]
  },
  limit: 100,
  with_payload: true,
  with_vector: true
})
```

**From create-collection.ts (PAYLOAD_INDEXES, lines 103-116)**:
```typescript
export const PAYLOAD_INDEXES = [
  {
    field_name: 'file_id',  // ← INDEX DEFINED BUT NEVER POPULATED
    field_schema: 'keyword' as const,
  },
  {
    field_name: 'course_id',
    field_schema: 'keyword' as const,
  },
  {
    field_name: 'organization_id',
    field_schema: 'keyword' as const,
  },
] as const;
```

---

## Root Cause Analysis

### Primary Root Cause

**Field name mismatch between upload payload and query filter**

The upload code in `upload-helpers.ts` stores `document_id` in the Qdrant payload (inherited from the `EnrichedChunk` type), while the test code in `document-processing-worker.test.ts` queries for `file_id`.

**Evidence**:
1. **Upload code (upload-helpers.ts:98)**: `document_id: chunk.document_id` - stores document_id
2. **Query code (test file:213)**: `key: 'file_id'` - queries for file_id
3. **Type definition (metadata-enricher.ts:21)**: `document_id: string;` - EnrichedChunk uses document_id
4. **Context7 Qdrant Documentation**: Confirms filter must match exact payload field name

**Mechanism of Failure**:

1. Document processing worker uploads vectors to Qdrant
2. `toQdrantPoint()` creates payload with `document_id` field from `chunk.document_id`
3. Qdrant successfully stores 22 vectors with payload containing `document_id`
4. Database correctly updated: `vector_status='indexed'`, `chunk_count=22`
5. Test executes `queryVectorsByFileId(fileId)`
6. Query filters by `file_id` field using scroll API
7. Qdrant finds zero points because no payload has `file_id` field
8. Test assertion fails: `totalVectors=0` vs expected `>=7`

### Contributing Factors

**Factor 1**: Inconsistent field naming convention
- Database table uses `file_catalog` with `id` column (the "file ID")
- TypeScript types use `document_id` field name
- Payload index configuration uses `file_id` field name
- No single source of truth for field naming

**Factor 2**: Payload index defined for non-existent field
- `create-collection.ts` defines `file_id` payload index
- This index is never populated because upload code uses `document_id`
- The index definition creates expectation that `file_id` should exist
- May have led test author to assume `file_id` was the correct field name

---

## Proposed Solutions

### Solution 1: Update Test to Use `document_id` ⭐ RECOMMENDED

**Description**: Change test query filter from `file_id` to `document_id` to match actual payload structure

**Why This Addresses Root Cause**: Aligns query field name with the actual payload field that upload code populates

**Implementation Steps**:
1. Open `packages/course-gen-platform/tests/integration/document-processing-worker.test.ts`
2. Locate `queryVectorsByFileId` function (line 198)
3. Change line 213 from:
   ```typescript
   key: 'file_id',
   ```
   to:
   ```typescript
   key: 'document_id',
   ```
4. Optionally rename function from `queryVectorsByFileId` to `queryVectorsByDocumentId` for clarity

**Files to Modify**:
- `packages/course-gen-platform/tests/integration/document-processing-worker.test.ts`
  - **Line 213**: Change filter key from 'file_id' to 'document_id'
  - **Line 198** (optional): Rename function for semantic accuracy

**Testing Strategy**:
- Run integration tests: `pnpm test tests/integration/document-processing-worker.test.ts`
- Verify all tier tests pass (TRIAL, FREE, BASIC, STANDARD, PREMIUM)
- Confirm `vectorStats.totalVectors` returns expected counts (7-22 vectors)
- Validate hierarchical structure assertions pass

**Pros**:
- ✅ Minimal code change (single line)
- ✅ Low risk - only affects test code
- ✅ Matches actual implementation
- ✅ Quick to implement and verify
- ✅ No production code changes needed

**Cons**:
- ❌ Leaves inconsistency in naming (file_id index vs document_id payload)
- ❌ Does not address unused payload index

**Complexity**: Low

**Risk Level**: Low

**Estimated Effort**: 5 minutes

---

### Solution 2: Standardize on `document_id` Everywhere

**Description**: Remove `file_id` from payload indexes and standardize all code to use `document_id`

**Why This Addresses Root Cause**: Eliminates naming inconsistency by choosing one canonical field name

**Implementation Steps**:
1. Update test query (same as Solution 1)
2. Remove `file_id` from PAYLOAD_INDEXES in `create-collection.ts`:
   ```typescript
   export const PAYLOAD_INDEXES = [
     // Remove file_id entry
     {
       field_name: 'course_id',
       field_schema: 'keyword' as const,
     },
     {
       field_name: 'organization_id',
       field_schema: 'keyword' as const,
     },
   ] as const;
   ```
3. Add `document_id` to PAYLOAD_INDEXES:
   ```typescript
   {
     field_name: 'document_id',
     field_schema: 'keyword' as const,
   },
   ```
4. Update existing Qdrant collection to add `document_id` index via script
5. Optionally remove unused `file_id` index from collection

**Files to Modify**:
- `packages/course-gen-platform/tests/integration/document-processing-worker.test.ts` - Update query
- `packages/course-gen-platform/src/shared/qdrant/create-collection.ts` - Update indexes
- Create migration script to update existing collection indexes

**Testing Strategy**:
- Same as Solution 1, plus:
- Verify `document_id` payload index created successfully
- Test query performance with new index
- Confirm no production queries depend on `file_id`

**Pros**:
- ✅ Eliminates naming confusion
- ✅ Proper indexing for actual payload field
- ✅ Better query performance for document_id filters
- ✅ Single source of truth for field naming
- ✅ Future-proof against similar issues

**Cons**:
- ❌ Requires production code changes
- ❌ Requires index migration on existing collections
- ❌ More testing required
- ❌ Higher implementation effort

**Complexity**: Medium

**Risk Level**: Low-Medium

**Estimated Effort**: 30 minutes

---

### Solution 3: Add `document_id` Alias as `file_id` in Upload

**Description**: Modify upload code to store both `document_id` and `file_id` (as aliases) in payload

**Why This Addresses Root Cause**: Maintains backward compatibility while allowing either field name in queries

**Implementation Steps**:
1. Modify `toQdrantPoint` in `upload-helpers.ts`:
   ```typescript
   const rawPayload = {
     // ... existing fields ...

     // Document metadata
     document_id: chunk.document_id,
     file_id: chunk.document_id,  // ADD: Alias for backward compatibility
     document_name: chunk.document_name,
     // ... rest of fields ...
   };
   ```
2. No test changes needed - query will work with `file_id`

**Files to Modify**:
- `packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts`
  - **Line 98**: Add `file_id: chunk.document_id` after document_id

**Testing Strategy**:
- Run integration tests (should pass without modification)
- Test queries using both `document_id` and `file_id` filters
- Verify no payload size increase issues
- Confirm both indexes work correctly

**Pros**:
- ✅ No test changes needed
- ✅ Backward compatible with existing queries
- ✅ Supports both field names
- ✅ Minimal code change

**Cons**:
- ❌ Duplicates data in payload (storage overhead)
- ❌ Perpetuates naming confusion
- ❌ Technical debt - two names for same field
- ❌ Not recommended per best practices
- ❌ Harder to maintain long-term

**Complexity**: Low

**Risk Level**: Low

**Estimated Effort**: 10 minutes

**⚠️ Not Recommended**: Creates technical debt and naming ambiguity

---

## Implementation Guidance

### For Implementation Agent

**Priority**: High (blocks integration tests)

**Files Requiring Changes**:

**Solution 1 (Recommended)**:
1. `packages/course-gen-platform/tests/integration/document-processing-worker.test.ts`
   - **Line Range**: 213
   - **Change Type**: modify
   - **Purpose**: Change filter key from 'file_id' to 'document_id'
   - **Before**:
     ```typescript
     key: 'file_id',
     ```
   - **After**:
     ```typescript
     key: 'document_id',
     ```

**Validation Criteria**:
- ✅ Test query uses `document_id` field in filter - Verify line 213 updated
- ✅ All integration tests pass - Run test suite successfully
- ✅ Vector counts match expected ranges - Verify assertions pass (totalVectors >= 7-22)
- ✅ No other `file_id` queries in test code - Search for remaining instances

**Testing Requirements**:
- **Unit tests**: N/A (test-only change)
- **Integration tests**:
  - Run: `pnpm test tests/integration/document-processing-worker.test.ts`
  - All tier tests should pass (TRIAL, FREE, BASIC, STANDARD, PREMIUM)
  - Verify vector counts for TXT (7±2), DOCX (15±3), PDF (22±3)
- **Manual verification**:
  - Check test output shows totalVectors > 0
  - Verify hierarchical structure assertions pass

**Dependencies**:
- None - self-contained test fix

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Other code may also query for `file_id`
  - **Mitigation**: Search entire codebase for `file_id` queries before implementing
  - **Command**: `grep -r "key.*file_id" packages/course-gen-platform/`

- **Risk 2**: Production queries may depend on `file_id` field
  - **Mitigation**: Verify no production search/query code uses `file_id` filter
  - **Check**: Review `src/shared/qdrant/search*.ts` files

### Performance Impact

**Solution 1**: None - test-only change

**Solution 2**: Minimal - adding payload index improves query performance for `document_id` filters

**Solution 3**: Small payload size increase (~36 bytes per vector for UUID string)

### Breaking Changes

**Solution 1**: None - only affects test code

**Solution 2**: Non-breaking - adds new index, doesn't remove functionality

**Solution 3**: None - additive change only

### Side Effects

No negative side effects expected for recommended Solution 1.

Future consideration: Standardize field naming across codebase (Solution 2 long-term)

---

## Documentation Research Findings

### Context7 Documentation Findings

**IMPORTANT**: This section includes direct quotes from Context7 MCP documentation showing what guidance was available.

**From Qdrant-JS Documentation** (Context7: `/qdrant/qdrant-js`):

> **Scroll API with Match Filter (TypeScript)**
> ```typescript
> client.scroll("{collection_name}", {
>   filter: {
>     must: [
>       {
>         key: "field_name",  // Must match exact payload field
>         match: { value: "value" }
>       }
>     ]
>   }
> });
> ```

**From Qdrant Documentation** (Context7: `/websites/qdrant_tech`):

> **Scroll API with Filters**: "The filter key must match the exact field name stored in the payload. Qdrant performs exact string matching on field names."

**Key Insights from Context7**:
- Filter `key` parameter must exactly match payload field name (case-sensitive)
- Qdrant does not perform fuzzy matching or field name aliasing
- Common error: querying for field that doesn't exist in payload returns 0 results
- Best practice: Use single canonical field name throughout application

**What Context7 Provided**:
- Correct Qdrant scroll API syntax and filter structure
- Confirmation that field names must match exactly
- Examples of proper TypeScript client usage
- Troubleshooting guidance for zero-result queries

**What Was Missing from Context7**:
- Project-specific field naming conventions (document_id vs file_id)
- Payload structure documentation (application-level concern)

**Tier 2/3 Sources Used**: None required - Context7 provided sufficient information

---

## MCP Server Usage

**Context7 MCP**:
- Libraries queried:
  - `/qdrant/qdrant-js` - TypeScript client library
  - `/websites/qdrant_tech` - Official Qdrant documentation
- Topics searched:
  - "payload filtering scroll query"
  - "scroll payload filter must match"
- **Quotes/excerpts included**: ✅ YES
- Insights gained:
  - Confirmed filter syntax correctness
  - Learned that field names must match exactly (no aliasing)
  - Understood that zero results indicate field name mismatch

**Sequential Thinking MCP**: Not used (straightforward field mismatch investigation)

**Supabase MCP**: Not used (issue is in Qdrant layer, not database)

---

## Additional Context

### Related Issues

This issue relates to broader field naming standardization concerns:
- Database uses `file_catalog` table with `id` column
- Code uses `document_id` in types
- Configuration uses `file_id` in indexes
- Recommendation: Establish naming conventions document

### Future Improvements

1. **Naming Convention Standards**: Create `docs/standards/field-naming.md` to document:
   - When to use `file_id` vs `document_id`
   - Payload field naming rules
   - Index naming conventions

2. **Type Safety**: Consider adding TypeScript type for Qdrant payload structure:
   ```typescript
   type QdrantPayload = {
     document_id: string;
     course_id: string;
     organization_id: string;
     // ... other fields
   };
   ```

3. **Test Utilities**: Create reusable test helper that validates payload structure:
   ```typescript
   function assertPayloadStructure(payload: unknown) {
     expect(payload).toHaveProperty('document_id');
     expect(payload).not.toHaveProperty('file_id');
   }
   ```

4. **Documentation**: Add comment in `upload-helpers.ts` clarifying:
   ```typescript
   // Note: Uses document_id (not file_id) to match EnrichedChunk type
   document_id: chunk.document_id,
   ```

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report**
2. **Select solution approach** (Recommended: Solution 1)
3. **Verify no production code queries for `file_id`**:
   ```bash
   grep -r "file_id.*match" packages/course-gen-platform/src/
   ```
4. **Apply fix to test file** (change line 213 from `file_id` to `document_id`)
5. **Run integration tests** to validate fix
6. **Consider Solution 2 as follow-up** for long-term field naming consistency

### Follow-Up Recommendations

- **Long-term**: Implement Solution 2 to standardize field naming
- **Process improvement**: Add linter rule to detect payload/query field name mismatches
- **Monitoring**: Add logging to track which payload fields are actually queried
- **Documentation**: Update QDRANT-REFERENCE.md with correct field names

---

## Investigation Log

### Timeline

- **00:00**: Investigation started - Problem analysis phase
- **00:05**: Initial hypotheses formed (payload mismatch most likely)
- **00:15**: Evidence collection - Read upload-helpers.ts, found `document_id`
- **00:20**: Evidence collection - Read test file, found `file_id` query
- **00:25**: Context7 documentation research - Confirmed filter syntax
- **00:30**: Root cause identified - Field name mismatch confirmed
- **00:35**: Solutions formulated - 3 approaches evaluated
- **00:40**: Implementation guidance prepared
- **00:45**: Report generated

### Commands Run

```bash
# 1. Search for file_id usage in Qdrant code
grep -r "file_id" src/shared/qdrant/*.ts | grep -v "original_file_id" | head -20

# 2. Create investigations directory
mkdir -p docs/investigations
```

### MCP Calls Made

```javascript
// 1. Resolve Qdrant library
mcp__context7__resolve-library-id({ libraryName: "qdrant" })

// 2. Get Qdrant JS client documentation
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/qdrant/qdrant-js",
  topic: "payload filtering scroll query"
})

// 3. Get Qdrant official documentation
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/websites/qdrant_tech",
  topic: "scroll payload filter must match"
})
```

---

## Code Snippets

### Current Test Code (BROKEN)
```typescript
// packages/course-gen-platform/tests/integration/document-processing-worker.test.ts
async function queryVectorsByFileId(
  fileId: string,
  collectionName: string = 'course_embeddings'
): Promise<{
  totalVectors: number
  parentChunks: number
  childChunks: number
  dimensions: number
}> {
  try {
    const scrollResponse = await qdrantClient.scroll(collectionName, {
      filter: {
        must: [
          {
            key: 'file_id',  // ❌ WRONG - field doesn't exist
            match: { value: fileId }
          }
        ]
      },
      limit: 100,
      with_payload: true,
      with_vector: true
    })
    // Returns 0 points because file_id field doesn't exist
    // ...
  }
}
```

### Fixed Test Code (SOLUTION 1)
```typescript
// packages/course-gen-platform/tests/integration/document-processing-worker.test.ts
async function queryVectorsByFileId(  // Could rename to queryVectorsByDocumentId
  fileId: string,  // Parameter name can stay (it's the file catalog ID)
  collectionName: string = 'course_embeddings'
): Promise<{
  totalVectors: number
  parentChunks: number
  childChunks: number
  dimensions: number
}> {
  try {
    const scrollResponse = await qdrantClient.scroll(collectionName, {
      filter: {
        must: [
          {
            key: 'document_id',  // ✅ CORRECT - matches payload field
            match: { value: fileId }
          }
        ]
      },
      limit: 100,
      with_payload: true,
      with_vector: true
    })
    // Now returns actual points
    // ...
  }
}
```

### Upload Code (CURRENT - NO CHANGES NEEDED FOR SOLUTION 1)
```typescript
// packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts
export function toQdrantPoint(
  embeddingResult: EmbeddingResult,
  enable_sparse: boolean
): QdrantUploadPoint {
  const { chunk, dense_vector } = embeddingResult;

  const rawPayload = {
    // ... chunk metadata ...

    // Document metadata
    document_id: chunk.document_id,  // ✅ This is what gets stored
    document_name: chunk.document_name,
    document_version: chunk.document_version,
    version_hash: chunk.version_hash,

    // ... remaining fields ...
  };

  // ... rest of function
}
```

---

**Investigation Complete**

✅ Root cause identified with supporting evidence
✅ Multiple solution approaches proposed
✅ Implementation guidance provided
✅ Ready for implementation phase

**Report saved**: `docs/investigations/INV-2025-10-26-001-qdrant-query-mismatch.md`

---

## Summary for Quick Reference

**Problem**: Qdrant queries return 0 results

**Root Cause**: Test queries for `file_id`, but upload stores `document_id`

**Fix**: Change line 213 in test file from `key: 'file_id'` to `key: 'document_id'`

**Affected File**: `tests/integration/document-processing-worker.test.ts`

**Test Command**: `pnpm test tests/integration/document-processing-worker.test.ts`

**Expected Result**: All tests pass with vector counts 7-22
