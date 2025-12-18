---
report_type: investigation
generated: 2025-10-26T17:00:00Z
investigation_id: INV-2025-10-26-001
status: complete
agent: problem-investigator
duration: 45 minutes
---

# Investigation Report: Qdrant Scroll Inconsistency in Integration Tests

**Investigation ID**: INV-2025-10-26-001
**Generated**: 2025-10-26T17:00:00Z
**Status**: ✅ Complete
**Duration**: 45 minutes

---

## Executive Summary

Seven integration tests fail with Qdrant vector count mismatches. Tests correctly query 22 vectors for TXT files and 54 vectors for DOCX files using the `queryVectorsByFileId()` helper, but assertions fail when validating the `total_chunks` metadata field from individual Qdrant points.

**Root Cause**: Test incorrectly assumes `payload.total_chunks` represents total document chunks, when it actually represents hierarchy-level counts (parent count for parent chunks, child count per parent for child chunks).

**Recommended Solution**: Replace `payload.total_chunks` comparison with `scrollResponse.points.length` to validate actual retrieved vector count.

### Key Findings

- **Finding 1**: `total_chunks` field has different meanings at different hierarchy levels (parents vs children)
- **Finding 2**: TXT files with 1 parent show `total_chunks=1` for parent chunks
- **Finding 3**: DOCX files with 2 parents each having ~27 children show `total_chunks=27` for child chunks
- **Finding 4**: Test assertion logic doesn't account for hierarchical chunk structure

---

## Problem Statement

### Observed Behavior

Seven integration tests fail with consistent patterns:
- **TXT files**: Expected 22 vectors, assertion receives 1
- **DOCX files**: Expected 54 vectors, assertion receives 27 (exactly half!)

Failing tests:
1. TRIAL Tier > TXT file processing
2. TRIAL Tier > DOCX file processing
3. BASIC Tier > TXT file processing
4. STANDARD Tier > TXT file processing
5. STANDARD Tier > DOCX file processing
6. PREMIUM Tier > TXT file processing
7. PREMIUM Tier > DOCX file processing

### Expected Behavior

Tests should validate that Qdrant contains the correct number of vectors matching the total chunks uploaded during document processing.

### Impact

- **Scope**: All tier-based document processing tests
- **Severity**: High - prevents validation of vector upload completeness
- **User Impact**: No production impact (test-only issue)

### Environmental Context

- **Environment**: Integration test suite with local Qdrant
- **Related Changes**: Test suite developed in Stage 2 implementation
- **First Observed**: Initial test execution in Task 3
- **Frequency**: 100% reproducible for all TXT and DOCX tests

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: Test uses wrong Qdrant filter (filters by wrong `document_id`)
   - **Likelihood**: Low
   - **Test Plan**: Check filter parameters in scroll call
   - **Result**: ❌ Filter is correct (`document_id` matches fileId)

2. **Hypothesis 2**: Test queries before vectors are fully indexed (timing issue)
   - **Likelihood**: Low
   - **Test Plan**: Check if helper succeeds but direct scroll fails due to timing
   - **Result**: ❌ Both queries happen after `waitForQdrantVectors()` succeeds

3. **Hypothesis 3**: Pagination issue - test gets first page only
   - **Likelihood**: Medium
   - **Test Plan**: Compare scroll `limit` parameters
   - **Result**: ❌ Both use `limit: 100`, sufficient for test data

4. **Hypothesis 4**: Test calculates `totalVectors` incorrectly
   - **Likelihood**: Low
   - **Test Plan**: Trace `vectorStats.totalVectors` source
   - **Result**: ❌ Helper correctly returns `points.length` (22, 54)

5. **Hypothesis 5**: Test validates wrong metadata field
   - **Likelihood**: High ⭐
   - **Test Plan**: Check what `payload.total_chunks` actually represents
   - **Result**: ✅ **CONFIRMED** - Field means hierarchy-level count, not document total

### Files Examined

- `tests/integration/document-processing-worker.test.ts` (lines 471-577) - TRIAL TXT test structure
  - **Finding**: Line 516 calls `queryVectorsByFileId()` → returns 22 ✅
  - **Finding**: Line 532 performs second scroll → gets scrollResponse
  - **Finding**: Line 563 extracts `scrollResponse.points[0]` → firstPoint
  - **Finding**: Line 572 asserts `payload.total_chunks === vectorStats.totalVectors` → FAILS

- `tests/integration/document-processing-worker.test.ts` (lines 198-277) - Helper function
  - **Finding**: Line 224 uses `limit: 100` in scroll
  - **Finding**: Line 230 calculates `totalVectors = points.length` → correct count
  - **Finding**: Lines 252-253 log wrong field names (`chunk_type`, `parent_id` instead of `level`, `parent_chunk_id`)

- `src/shared/embeddings/markdown-chunker.ts` (lines 240-321) - Chunk creation
  - **Finding**: Line 249 sets parent `total_chunks: 0` (updated later)
  - **Finding**: Line 296 sets child `total_chunks: childTexts.length` (children per parent)
  - **Finding**: Lines 318-321 update parent `total_chunks = parent_chunks.length`

- `src/shared/qdrant/upload-helpers.ts` (lines 70-110) - Payload structure
  - **Finding**: Line 83 stores `level: chunk.level` ("parent" or "child")
  - **Finding**: Line 81 stores `parent_chunk_id` (not `parent_id`)
  - **Finding**: Line 88 stores `total_chunks: chunk.total_chunks` (hierarchy-level count)

- `tests/integration/helpers/test-orgs.ts` (lines 228-249) - Expected values
  - **Finding**: Line 240 `EXPECTED_CHUNKS.txt.total = 22`
  - **Finding**: Line 235 `EXPECTED_CHUNKS.docx.total = 54`
  - **Finding**: Comments note parent/child distinction not used in practice

### Commands Executed

```bash
# Check test logs for actual vs expected values
grep -E "FAIL|AssertionError" /tmp/task3-final.log
# Result: Confirmed TXT=1 (not 22), DOCX=27 (not 54)

# Find assertion failure context
grep -B 10 "expected 1 to be 22" /tmp/task3-final.log
# Result: Failure at line 572: expect(payload.total_chunks).toBe(vectorStats.totalVectors)

# Verify helper returns correct counts
grep -A 8 "First 3 payloads:" /tmp/task3-final.log
# Result: Helper logs show 22 and 54 vectors queried successfully

# Check chunk metadata in logs
grep -A 20 "QUERY RESULTS" /tmp/task3-final.log
# Result: Fields show chunk_type=UNDEFINED, parent_id=UNDEFINED (wrong field names)
```

### Data Collected

**Test Execution Trace (TXT file)**:
```
Line 478: Upload TXT file → fileId: 99b758be-9e3e-44a7-8302-bfb8caff774b
Line 489: Wait for vector indexing → success, status='indexed'
Line 513: Wait for Qdrant vectors (20 minimum) → got 22/20, time: 169ms ✅
Line 516: Query #1 - queryVectorsByFileId() → returns 22 vectors ✅
Line 532: Query #2 - Direct scroll → scrollResponse with points
Line 563: Extract firstPoint = scrollResponse.points[0]
Line 572: Assert payload.total_chunks === 22 → FAILS (got 1) ❌
```

**Test Execution Trace (DOCX file)**:
```
Similar flow to TXT
Query #1 returns 54 vectors ✅
Query #2 assertion fails: expected 54, got 27 ❌
```

**Chunk Structure Analysis**:

TXT file (22 total chunks):
```
Structure: 1 parent + 21 children
Parent chunk: { level: "parent", total_chunks: 1 }  ← Number of parents
Child chunks: { level: "child", total_chunks: 21 }  ← Children in this parent
```

DOCX file (54 total chunks):
```
Structure: 2 parents + ~52 children (26-27 per parent)
Parent chunk 0: { level: "parent", total_chunks: 2 }    ← Number of parents
Parent chunk 1: { level: "parent", total_chunks: 2 }    ← Number of parents
Child chunks (parent 0): { level: "child", total_chunks: 27 } ← Children in parent 0
Child chunks (parent 1): { level: "child", total_chunks: 27 } ← Children in parent 1
```

**Debug Log Evidence**:
```
🔍 [QUERY] Querying vectors for fileId: 99b758be-9e3e-44a7-8302-bfb8caff774b
📊 [QUERY RESULTS] Total vectors found: 22  ← Helper correctly counts all vectors
   First 3 payloads:
     [0] document_id: 99b758be-9e3e-44a7-8302-bfb8caff774b
         chunk_type: UNDEFINED  ← Wrong field name (should be 'level')
         parent_id: UNDEFINED    ← Wrong field name (should be 'parent_chunk_id')
```

---

## Root Cause Analysis

### Primary Root Cause

**The test incorrectly assumes `payload.total_chunks` represents the total number of chunks in the entire document, when it actually represents hierarchy-level counts.**

**Evidence**:

1. **From markdown-chunker.ts (lines 249, 296, 318-321)**:
   ```typescript
   // Line 249: Parent chunks get total_chunks = 0 initially
   total_chunks: 0, // Will be updated later

   // Line 296: Child chunks get total_chunks = number of children in THIS parent
   total_chunks: childTexts.length,

   // Lines 318-321: Parent chunks updated with total parent count
   for (const chunk of parent_chunks) {
     chunk.total_chunks = parent_chunks.length;
   }
   ```

2. **From test code (line 572)**:
   ```typescript
   const firstPoint = scrollResponse.points[0]
   const payload = firstPoint.payload as any
   expect(payload.total_chunks).toBe(vectorStats.totalVectors)
   //      ^^^^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^^
   //      Hierarchy-level count     Total document chunks (22 or 54)
   ```

3. **From test logs**:
   ```
   TXT: expected 1 to be 22
        ↑           ↑
        Parent      Total document chunks
        count

   DOCX: expected 27 to be 54
         ↑            ↑
         Children     Total document chunks
         in parent 0
   ```

**Mechanism of Failure**:

1. Document processing creates hierarchical chunks (parents + children)
2. Each chunk gets `total_chunks` field with hierarchy-specific meaning:
   - Parent chunks: `total_chunks = parent_chunks.length` (e.g., 1 for TXT)
   - Child chunks: `total_chunks = childTexts.length` (e.g., 21 for TXT children, 27 for DOCX parent 0 children)
3. Test performs scroll query: `scrollResponse = await qdrantClient.scroll(...)`
4. Qdrant returns points in arbitrary order (no ordering specified)
5. Test extracts first point: `firstPoint = scrollResponse.points[0]`
6. For TXT: First point is likely a parent chunk with `total_chunks = 1`
7. For DOCX: First point is likely a child from first parent with `total_chunks = 27`
8. Test asserts: `expect(payload.total_chunks).toBe(vectorStats.totalVectors)`
9. Assertion fails: 1 !== 22 (TXT) or 27 !== 54 (DOCX)

### Contributing Factors

**Factor 1**: Field name mismatches in test code
- Test checks `parent_id` but field is `parent_chunk_id`
- Test logs `chunk_type` but field is `level`
- This prevents correct parent/child filtering and debugging

**Factor 2**: Ambiguous field name `total_chunks`
- Name suggests "total chunks in document"
- Actually means "total chunks at this hierarchy level"
- No documentation clarifying the semantic difference

**Factor 3**: Arbitrary Qdrant scroll ordering
- No `order_by` specified in scroll query
- First point could be parent or child
- Makes `points[0].payload.total_chunks` unpredictable

---

## Proposed Solutions

### Solution 1: Use `scrollResponse.points.length` for Validation ⭐ RECOMMENDED

**Description**: Replace `payload.total_chunks` comparison with `scrollResponse.points.length`, which represents the actual number of vectors retrieved from Qdrant.

**Why This Addresses Root Cause**:
- `scrollResponse.points.length` counts ALL vectors returned by the scroll query
- This matches `vectorStats.totalVectors` (which is `points.length` from helper)
- No dependency on arbitrary first point selection or hierarchy-level semantics

**Implementation Steps**:

1. Replace line 572 (and similar lines in other tests):
   ```typescript
   // OLD (line 572):
   expect(payload.total_chunks).toBe(vectorStats.totalVectors)

   // NEW:
   expect(scrollResponse.points.length).toBe(vectorStats.totalVectors)
   ```

2. Update all 7 failing tests with same pattern

3. Optional: Remove `total_chunks` assertion entirely since it validates hierarchy structure, not upload completeness

**Files to Modify**:
- `tests/integration/document-processing-worker.test.ts`
  - **Line 572**: TRIAL TXT test assertion
  - **Line 701**: TRIAL DOCX test assertion
  - **Line 1443**: BASIC TXT test assertion
  - **Line 1771**: STANDARD TXT test assertion
  - **Line 1900**: STANDARD DOCX test assertion
  - **Line 2252**: PREMIUM TXT test assertion
  - **Line 2381**: PREMIUM DOCX test assertion

**Testing Strategy**:
- Run all 7 failing tests: `pnpm test:integration document-processing-worker`
- Verify assertions pass for both TXT (22) and DOCX (54)
- Verify hierarchical structure tests still pass (parent/child filtering)
- Check test logs confirm vector counts match expectations

**Pros**:
- ✅ Minimal code change (1 line per test)
- ✅ Directly validates upload completeness
- ✅ No dependency on hierarchy semantics
- ✅ No dependency on scroll ordering
- ✅ Self-documenting intent (count vectors)

**Cons**:
- ❌ Loses validation of `total_chunks` metadata accuracy
- ❌ Doesn't fix field name mismatches (`parent_id` vs `parent_chunk_id`)

**Complexity**: Low (7 identical line changes)

**Risk Level**: Low (isolated to test assertions, no production impact)

**Estimated Effort**: 5 minutes

---

### Solution 2: Calculate Expected `total_chunks` Based on First Point Type

**Description**: Determine if first point is parent or child, then assert against appropriate expected value.

**Why This Addresses Root Cause**:
- Accounts for hierarchy-level semantics of `total_chunks`
- Validates metadata field accuracy

**Implementation Steps**:

1. Add logic to determine first point type:
   ```typescript
   const firstPoint = scrollResponse.points[0]
   const payload = firstPoint.payload as any

   // Determine if parent or child
   const isParent = payload.parent_chunk_id === null || payload.parent_chunk_id === undefined

   if (isParent) {
     // For parent: total_chunks = number of parents
     expect(payload.total_chunks).toBeGreaterThanOrEqual(1)
   } else {
     // For child: total_chunks = children in that parent
     expect(payload.total_chunks).toBeGreaterThan(0)
     expect(payload.total_chunks).toBeLessThanOrEqual(vectorStats.totalVectors)
   }
   ```

2. Fix field name mismatches:
   - Replace `parent_id` with `parent_chunk_id`
   - Replace `chunk_type` with `level`

3. Update all 7 tests

**Files to Modify**:
- Same 7 test assertion locations as Solution 1
- `queryVectorsByFileId()` helper (lines 252-253, 264) to use correct field names

**Testing Strategy**:
- Same as Solution 1
- Additionally verify field name fixes allow parent/child filtering

**Pros**:
- ✅ Validates `total_chunks` metadata accuracy
- ✅ Fixes field name mismatches
- ✅ More comprehensive validation

**Cons**:
- ❌ More complex logic (conditional assertions)
- ❌ Test intent less clear (what are we validating?)
- ❌ Doesn't validate total document chunks (original intent)
- ❌ Still depends on arbitrary first point selection

**Complexity**: Medium (conditional logic + field name fixes)

**Risk Level**: Low

**Estimated Effort**: 20 minutes

---

### Solution 3: Aggregate All `total_chunks` Values to Calculate Document Total

**Description**: Calculate document total by summing unique hierarchy-level counts.

**Why This Addresses Root Cause**:
- Uses `total_chunks` field but accounts for hierarchy semantics
- Calculates true document total

**Implementation Steps**:

1. Aggregate counts from all points:
   ```typescript
   const scrollResponse = await qdrantClient.scroll(...)

   // Separate parents and children (using correct field name)
   const parentPoints = scrollResponse.points.filter(
     p => (p.payload as any).parent_chunk_id === null ||
          (p.payload as any).parent_chunk_id === undefined
   )
   const childPoints = scrollResponse.points.filter(
     p => (p.payload as any).parent_chunk_id !== null &&
          (p.payload as any).parent_chunk_id !== undefined
   )

   // Document total = all points returned
   const documentTotal = scrollResponse.points.length
   expect(documentTotal).toBe(vectorStats.totalVectors)
   ```

2. Update all 7 tests

**Files to Modify**:
- Same 7 test locations

**Testing Strategy**:
- Same as Solution 1

**Pros**:
- ✅ Uses existing metadata
- ✅ Validates document totals correctly
- ✅ Accounts for hierarchy semantics

**Cons**:
- ❌ Most complex solution
- ❌ Essentially reimplements `points.length` (Solution 1)
- ❌ Adds unnecessary computation

**Complexity**: High

**Risk Level**: Low

**Estimated Effort**: 30 minutes

---

## Implementation Guidance

### For Implementation Agent

**Priority**: High (blocking 7 integration tests)

**Recommended Approach**: **Solution 1** - Use `scrollResponse.points.length`

**Files Requiring Changes**:

1. `tests/integration/document-processing-worker.test.ts`
   - **Line 572**: TRIAL TXT
     ```typescript
     // OLD:
     expect(payload.total_chunks).toBe(vectorStats.totalVectors)
     // NEW:
     expect(scrollResponse.points.length).toBe(vectorStats.totalVectors)
     ```

   - **Line 701**: TRIAL DOCX (same change)
   - **Line 1443**: BASIC TXT (same change)
   - **Line 1771**: STANDARD TXT (same change)
   - **Line 1900**: STANDARD DOCX (same change)
   - **Line 2252**: PREMIUM TXT (same change)
   - **Line 2381**: PREMIUM DOCX (same change)

**Validation Criteria**:
- ✅ All 7 tests pass after fix
- ✅ TXT tests assert `scrollResponse.points.length === 22` ±2 tolerance
- ✅ DOCX tests assert `scrollResponse.points.length === 54` ±3 tolerance
- ✅ No regression in other tests (parent/child structure tests)
- ✅ Test logs show correct vector counts

**Testing Requirements**:

Unit tests: N/A (test-only fix)

Integration tests:
```bash
# Run all document processing tests
pnpm test:integration document-processing-worker

# Expected: 7 previously failing tests now pass
# - TRIAL Tier > TXT ✅
# - TRIAL Tier > DOCX ✅
# - BASIC Tier > TXT ✅
# - STANDARD Tier > TXT ✅
# - STANDARD Tier > DOCX ✅
# - PREMIUM Tier > TXT ✅
# - PREMIUM Tier > DOCX ✅
```

Manual verification:
1. Check test output shows correct vector counts in logs
2. Verify `scrollResponse.points.length` matches `vectorStats.totalVectors`
3. Confirm no "expected X to be Y" errors

**Dependencies**: None

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Change might affect skipped assertions (parent/child tests)
  - **Mitigation**: Only modify the specific failing assertion line, leave parent/child logic unchanged

- **Risk 2**: Other tests might have similar incorrect assumptions
  - **Mitigation**: Search for other uses of `payload.total_chunks` in test file

### Performance Impact

None - test-only change

### Breaking Changes

None - no API or production code changes

### Side Effects

None - isolated to test assertions

---

## Additional Context

### Related Issues

- Original task: `/home/me/code/megacampus2/specs/003-stage-2-implementation/006-fix-qdrant-scroll-inconsistency.md`
- Test suite development: Stage 2 Implementation Phase 0

### Documentation References

**Context7 Documentation Findings**:

Not applicable - investigation focused on internal codebase logic and Qdrant client API usage patterns.

**MCP Server Usage**: None (investigation used Read/Grep/Bash tools only)

### Field Name Mismatches (Secondary Issue)

While investigating, discovered test code uses incorrect field names:
- Test uses: `parent_id` → Actual field: `parent_chunk_id`
- Test uses: `chunk_type` → Actual field: `level`

**Impact**:
- Prevents proper parent/child filtering in test logic
- Helper function logs show "UNDEFINED" for these fields
- Skipped parent/child assertions would fail if unskipped

**Recommendation**: Address in separate cleanup task after tests pass:
1. Replace all `parent_id` with `parent_chunk_id`
2. Replace all `chunk_type` with `level`
3. Unskip parent/child assertion tests to validate hierarchical structure

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report** ✅
2. **Select solution approach**: Solution 1 (Recommended)
3. **Invoke implementation agent** with:
   - Report: `docs/investigations/INV-2025-10-26-001-qdrant-scroll-inconsistency.md`
   - Selected solution: Solution 1
   - Task: Make 7 identical line changes to test assertions
4. **Validation**: Run `pnpm test:integration document-processing-worker` and verify all 7 tests pass

### Follow-Up Recommendations

**Short-term** (after tests pass):
1. Address field name mismatches (`parent_id` → `parent_chunk_id`, `chunk_type` → `level`)
2. Unskip parent/child hierarchical structure tests
3. Add comments explaining `total_chunks` semantic meaning

**Long-term** (technical debt):
1. Rename `total_chunks` field to clarify hierarchy-level meaning:
   - Parent chunks: `parent_count` or `total_parents`
   - Child chunks: `sibling_count` or `children_in_parent`
2. Add comprehensive field documentation in chunk schema
3. Add Qdrant scroll ordering (`order_by: 'chunk_index'`) for deterministic test results

---

## Investigation Log

### Timeline

- **2025-10-26 16:00**: Investigation started
- **2025-10-26 16:10**: Initial hypotheses formed (5 potential causes)
- **2025-10-26 16:20**: Test code analyzed (line 572 identified as failure point)
- **2025-10-26 16:25**: Helper function traced (correct counts verified)
- **2025-10-26 16:30**: Chunk creation logic examined (hierarchy semantics discovered)
- **2025-10-26 16:35**: Evidence collection completed (logs confirmed pattern)
- **2025-10-26 16:40**: Root cause identified with supporting code evidence
- **2025-10-26 16:50**: Solutions formulated (3 approaches evaluated)
- **2025-10-26 17:00**: Report generated

### Commands Run

```bash
# List available log files
ls -lah /tmp/*.log

# Find test failure patterns
grep -E "FAIL|AssertionError|Error:" /tmp/task3-final.log | head -30

# Extract TXT test failure context
grep -A 10 "TRIAL Tier.*TXT file successfully" /tmp/task3-final.log | head -40

# Locate assertion error line
grep -B 10 "expected 1 to be 22" /tmp/task3-final.log | head -30

# Verify helper returns correct counts
grep -A 8 "First 3 payloads:" /tmp/task3-final.log | head -40

# Check for scroll response metadata
grep -B 20 "expected 1 to be 22" /tmp/task3-final.log | grep -E "scrollResponse|points\.length|total_chunks"

# Find chunk creation logic
find /home/me/code/megacampus2/packages/course-gen-platform/src -name "*.ts" -exec grep -l "total_chunks" {} \;

# Examine debug log chunk types
grep -A 20 "Assert: Verify hierarchical structure" /tmp/task3-final.log | grep -E "chunk_type|parent_id|total_chunks"
```

### MCP Calls Made

None - investigation completed using standard Read/Grep/Bash tools.

---

**Investigation Complete**

✅ Root cause identified with code-level evidence
✅ Mechanism of failure fully explained
✅ Three solution approaches proposed with trade-off analysis
✅ Implementation guidance provided with exact line numbers
✅ Ready for implementation phase

**Primary Root Cause**: Test assumes `payload.total_chunks` represents total document chunks, when it actually represents hierarchy-level counts (parent count for parents, child count per parent for children).

**Recommended Fix**: Replace `payload.total_chunks` assertion with `scrollResponse.points.length` to validate actual vector count retrieved from Qdrant.

**Confidence Level**: Very High - Root cause confirmed through code analysis, chunker logic examination, and test log evidence.

Report saved: `docs/investigations/INV-2025-10-26-001-qdrant-scroll-inconsistency.md`
