# 009: Investigate Hierarchical Chunking for Parent-Child Test

**Status**: ✅ DONE
**Created**: 2025-10-26
**Completed**: 2025-10-27
**Parent**: 003-stage-2-implementation
**Priority**: LOW

## Overview

Investigate why parent-child structure test finds 0 child chunks. Determine if hierarchical chunking is implemented and working.

**Current**: 1 test skipped (Parent-Child Structure)
**Target**: Test passing OR documented why it should remain skipped
**Impact**: +1 test → 14/17 passing (82.4%, or 17/17 if all fixes work → 100%)

## ✅ Resolution

**Root Cause Found**: Test was looking for **wrong field name** in Qdrant payload!

- **Test searched for**: `payload.parent_id`
- **Code actually uses**: `payload.parent_chunk_id`

**Solution Applied**:
1. Updated test to use correct field: `parent_chunk_id` instead of `parent_id`
2. Removed `.skip` from test - hierarchical chunking IS implemented
3. Test now correctly identifies parent and child chunks

**Files Changed**:
- `tests/integration/document-processing-worker.test.ts:2493` - Fixed parent chunk filter
- `tests/integration/document-processing-worker.test.ts:2496` - Fixed child chunk filter
- `tests/integration/document-processing-worker.test.ts:2510` - Fixed assertion field name
- `tests/integration/document-processing-worker.test.ts:2515` - Fixed parent lookup field name
- `tests/integration/document-processing-worker.test.ts:2433` - Removed `.skip`, added fix comment

**Outcome**: Outcome C - Bug in Test Logic (not chunking logic)

## Current State

### Skipped Test
**Test**: `Chunking Validation > should produce correct parent-child structure`

**Status**: `.skip` - Currently skipped

### Error When Enabled
```
AssertionError: expected 0 to be greater than 0

At: tests/integration/document-processing-worker.test.ts:2500
     expect(childChunks.length).toBeGreaterThan(0)
                                ^
```

**Symptom**: Test finds parent chunks but 0 child chunks.

## Root Cause Investigation

### What Test Expects

**Hierarchical Structure**:
```
Document
  ├── Parent Chunk 1 (1500 tokens)
  │   ├── Child Chunk 1.1 (400 tokens)
  │   ├── Child Chunk 1.2 (400 tokens)
  │   └── Child Chunk 1.3 (400 tokens)
  ├── Parent Chunk 2 (1500 tokens)
  │   ├── Child Chunk 2.1 (400 tokens)
  │   └── Child Chunk 2.2 (400 tokens)
  ...
```

**Qdrant Payload Expected**:
- **Parent chunks**: `{ parent_id: null, chunk_type: 'parent' }`
- **Child chunks**: `{ parent_id: "parent-chunk-id", chunk_type: 'child' }`

### Test Logic
```typescript
// Line ~2492: Separate chunks by parent_id
const parentChunks = allChunks.filter(
  p => p.payload.parent_id === null || p.payload.parent_id === undefined
)
const childChunks = allChunks.filter(
  p => p.payload.parent_id !== null && p.payload.parent_id !== undefined
)

// Line ~2499: Expects both types
expect(parentChunks.length).toBeGreaterThan(0) // ✅ PASSES
expect(childChunks.length).toBeGreaterThan(0)  // ❌ FAILS (0 children)
```

---

## Investigation Tasks

### Task 1: Check if parent_id Field is Set

**Objective**: Verify if Qdrant payload includes `parent_id` field.

**Steps**:
1. Enable test (remove `.skip`)
2. Add debug logging before assertion:
```typescript
// Line ~2490: Add debugging
console.log('=== CHUNK ANALYSIS ===')
console.log('Total chunks:', allChunks.length)
console.log('\nFirst 3 chunks payloads:')
allChunks.slice(0, 3).forEach((chunk, i) => {
  console.log(`\n[${i}] Payload:`, JSON.stringify(chunk.payload, null, 2))
})
```

3. Run test and examine output:
```bash
pnpm test tests/integration/document-processing-worker.test.ts -t "parent-child"
```

**Expected Findings**:
- **If parent_id exists**: Shows `"parent_id": "some-uuid"` or `"parent_id": null`
- **If parent_id missing**: No `parent_id` field in payload at all

---

### Task 2: Check Chunking Implementation

**Objective**: Verify if hierarchical chunking is implemented for markdown files.

**Files to Investigate**:
1. **Chunking Logic**: `src/shared/embeddings/structure-extractor.ts`
   - Search for: `parent_id`, `hierarchical`, `chunk_type`
   - Check if code sets parent-child relationships

2. **Upload Logic**: `src/shared/embeddings/generate.ts`
   - Search for: `parent_id` in payload
   - Check if parent_id is included in Qdrant upload

3. **Research Docs**: `docs/research/RAG1-ANALYSIS.md`
   - Verify if hierarchical chunking is in "Recommended" or "Future Work"

**Commands**:
```bash
# Search for parent_id in chunking code
grep -r "parent_id\|parent_chunk_id" src/shared/embeddings/

# Search for hierarchical in research
grep -i "hierarchical" docs/research/RAG1-ANALYSIS.md
```

---

### Task 3: Test with Different File Type

**Objective**: Determine if issue is markdown-specific or global.

**Hypothesis**: Hierarchical chunking may only work for DOCX files, not markdown.

**Steps**:
1. Change test to use DOCX instead of markdown:
```typescript
// Line ~2450: Change from markdown to DOCX
const mdFixturePath = getFixturePath('docx') // was: getFixturePath('md')
const { fileId } = await uploadFileAndProcess(
  trialOrg.id,
  testUser.id,
  testCourseId,
  mdFixturePath,
  'hierarchical-test.docx', // was: 'hierarchical-test.md'
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // was: 'text/markdown'
)
```

2. Run test:
```bash
pnpm test tests/integration/document-processing-worker.test.ts -t "parent-child"
```

**Expected Results**:
- **If DOCX works**: Child chunks found → markdown doesn't support hierarchical chunking
- **If DOCX fails too**: Hierarchical chunking not implemented yet

---

## Possible Outcomes

### Outcome A: parent_id Not Implemented

**Evidence**: Payload has no `parent_id` field at all.

**Solution**: Implement hierarchical chunking
1. Update `structure-extractor.ts` to create parent-child relationships
2. Update `generate.ts` to include `parent_id` in payload
3. Add `chunk_type` field: "parent" or "child"
4. Follow RAG1-ANALYSIS.md recommendations

**Effort**: 2-4 hours (new feature implementation)

---

### Outcome B: Markdown Doesn't Support Hierarchical Chunking

**Evidence**: DOCX shows child chunks, markdown doesn't.

**Solution**: Update test to use DOCX OR document limitation
1. **Option 1**: Change test to use DOCX file
2. **Option 2**: Skip test with note: "Hierarchical chunking only for DOCX/PDF"
3. **Option 3**: Implement markdown hierarchical chunking (based on headers)

**Effort**: 1 hour (test change) OR 2-3 hours (implement for markdown)

---

### Outcome C: Bug in Chunking Logic

**Evidence**: parent_id field exists but always null OR incorrect logic.

**Solution**: Debug and fix chunking logic
1. Add logging to chunking functions
2. Identify where parent_id should be set but isn't
3. Fix the bug
4. Verify with tests

**Effort**: 1-2 hours (debugging + fix)

---

### Outcome D: Test Expectations Wrong

**Evidence**: All chunks are parents by design (no hierarchy needed).

**Solution**: Update or remove test
1. Document that current design uses flat chunking
2. Update test to verify flat structure instead
3. OR remove test entirely if not applicable

**Effort**: 30 minutes (documentation)

---

## Success Criteria

### Investigation Complete When:
- [ ] Determined which outcome (A, B, C, or D)
- [ ] Documented findings with evidence
- [ ] Recommended solution with effort estimate
- [ ] Decision made: fix, update test, or skip

### Implementation Complete When (if fixing):
- [ ] parent_id field present in Qdrant payload
- [ ] Child chunks found in query results
- [ ] Test assertions pass:
  ```typescript
  expect(parentChunks.length).toBeGreaterThan(0) // ✅
  expect(childChunks.length).toBeGreaterThan(0)  // ✅
  ```
- [ ] Parent-child relationships validated
- [ ] Token sizes within expected ranges

---

## Validation

### Test Command
```bash
# Enable test first (remove .skip)
pnpm test tests/integration/document-processing-worker.test.ts -t "parent-child"
```

### Expected Output (if fixed)
```
✓ Chunking Validation > should produce correct parent-child structure

📊 Chunk Distribution:
   - Total chunks: 22
   - Parent chunks: 11
   - Child chunks: 11
✅ All 11 child chunks reference valid parent chunks
```

---

## Files to Investigate

**Chunking Implementation**:
- `src/shared/embeddings/structure-extractor.ts` - Chunking logic
- `src/shared/embeddings/generate.ts` - Embedding generation + payload
- `src/shared/embeddings/markdown-converter.ts` - Markdown processing

**Research**:
- `docs/research/RAG1.md` - Original RAG research
- `docs/research/RAG1-ANALYSIS.md` - Implementation analysis

**Tests**:
- `tests/integration/document-processing-worker.test.ts` - Line ~2433

---

## Notes

**Why This Test Was Skipped Originally**:
- Test was added early in development
- Hierarchical chunking may have been planned but not implemented
- Or implemented for DOCX/PDF only, not markdown
- Skipped with comment: "Parent-child logic needs review"

**Research Recommendation** (from RAG1-ANALYSIS.md):
- Variant 2 "Balanced" recommends:
  - Parent chunks: 1500 tokens
  - Child chunks: 400 tokens
  - Both uploaded to Qdrant with parent-child links

**Current Implementation Status**: UNKNOWN (needs investigation)

---

## Priority Justification

**Why LOW Priority**:
1. Production code works for flat chunking
2. All other tests pass without hierarchical structure
3. Feature may not be critical for MVP
4. Can be implemented later as enhancement

**When to Increase Priority**:
- If RAG search quality suffers without hierarchy
- If contextual retrieval needs parent-child relationships
- If product requirements specify hierarchical chunking

---

## References

- Test File: `tests/integration/document-processing-worker.test.ts:2433`
- RAG Research: `docs/research/RAG1-ANALYSIS.md`
- Previous Investigation: `006-fix-qdrant-scroll-inconsistency.md`
- Chunking Code: `src/shared/embeddings/structure-extractor.ts`
