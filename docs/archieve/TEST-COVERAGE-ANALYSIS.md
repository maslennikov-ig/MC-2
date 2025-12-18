# Test Coverage Analysis for UserStory 5 (RAG Infrastructure)

**Date**: 2025-10-15
**Analyst**: Claude Code
**Current Test**: T080 (End-to-End RAG Workflow Test)

---

## Executive Summary

**Current Test Coverage**: 60% of implemented features
**Missing Critical Features**: 5 major feature areas
**Recommendation**: Create T080.1 (Extended RAG Workflow Tests) + Update T080

---

## Implemented Features vs Test Coverage

### ✅ FULLY COVERED by T080

| Feature | Task | T080 Coverage | Evidence |
|---------|------|---------------|----------|
| Document Conversion (Markdown) | T074.3 | ✅ 100% | Lines 221-289 (Markdown direct read) |
| Hierarchical Chunking | T075 | ✅ 100% | Lines 295-325 (parent-child chunks) |
| Metadata Enrichment | T075 | ✅ 100% | Lines 330-366 (multi-tenancy fields) |
| Embedding Generation | T076 | ✅ 100% | Lines 371-411 (Jina-v3 + late chunking) |
| Vector Upload (Dense) | T077 | ✅ 100% | Lines 416-447 (Qdrant upload) |
| Semantic Search (Dense) | T078 | ✅ 100% | Lines 449-505 (dense search only) |

**Total Coverage**: 6/11 features (55%)

---

### ⚠️ PARTIALLY COVERED by T080

| Feature | Task | T080 Coverage | Missing Coverage |
|---------|------|---------------|------------------|
| Redis Caching | T076, T078 | ⚠️ 30% | Only graceful degradation tested, no cache hits/validation |
| Structure-Aware Chunking | T075 | ⚠️ 50% | Tests basic hierarchy, missing code blocks, formulas, tables detection |

**Partial Coverage Issues**:
1. **Redis**: Test only validates workflow continues without Redis, doesn't test actual caching behavior
2. **Structure Detection**: No test for `has_code`, `has_formulas`, `has_tables` metadata enrichment

---

### ❌ NOT COVERED by T080

| Feature | Task | Description | Why Critical |
|---------|------|-------------|--------------|
| **Tier-Based Processing** | T074.4 | FREE/BASIC/STANDARD/PREMIUM tier restrictions + Docling OCR control | **CRITICAL** - Core business logic, billing impact |
| **Docling Conversion** | T074.3 | PDF, DOCX, PPTX → Markdown via Docling MCP | **CRITICAL** - 80% of uploads are PDFs |
| **BM25 Hybrid Search** | T075 | Sparse vectors + RRF (Reciprocal Rank Fusion) | **HIGH** - +7-10pp precision improvement |
| **Content Deduplication** | T079 | Reference counting, SHA-256 hashing, vector duplication | **CRITICAL** - 80% cost savings |
| **Image Processing** | T074.4 | OCR extraction from images in documents | **MEDIUM** - STANDARD/PREMIUM tier feature |

**Missing Coverage**: 5/11 features (45%)

---

## Detailed Gap Analysis

### Gap 1: Tier-Based Processing (T074.4) - CRITICAL ❌

**What's Missing**:
```typescript
// T080 doesn't test:
1. FREE tier → Upload rejected with error message
2. BASIC tier → TXT/MD only, no Docling
3. BASIC tier → PDF upload rejected with upgrade message
4. STANDARD tier → PDF/DOCX/PPTX with OCR enabled
5. STANDARD tier → Image upload rejected (requires PREMIUM)
6. PREMIUM tier → Images processed with OCR
```

**Why Critical**:
- **Business Impact**: Incorrect tier handling = revenue loss or unauthorized feature access
- **User Experience**: Clear error messages with upgrade paths required
- **Compliance**: Tier restrictions must be enforced (contractual obligation)

**Test Complexity**: Medium (requires tier metadata setup)

**Recommendation**: **MUST ADD to T080.1**

---

### Gap 2: Docling Document Conversion (T074.3) - CRITICAL ❌

**What's Missing**:
```typescript
// T080 only tests Markdown (bypasses Docling)
// Missing tests for:
1. PDF conversion → Markdown (with text layer)
2. PDF with images → Markdown + image extraction
3. PDF scanned → Markdown with OCR
4. DOCX conversion → Markdown (preserves structure)
5. PPTX conversion → Markdown (slide content)
6. Conversion error handling (corrupted files)
```

**Why Critical**:
- **Usage Stats**: 80% of educational content is PDFs
- **Infrastructure**: Docling MCP Server is separate service (T074.1.2)
- **Quality**: Markdown quality determines chunking quality

**Test Complexity**: High (requires Docling MCP Server running)

**Current Workaround**: T080 comment says "Markdown doesn't need Docling" (line 236)

**Recommendation**: **ADD to T080.1** or separate **T080.2 (Docling Integration Test)**

---

### Gap 3: BM25 Hybrid Search (T075) - HIGH ❌

**What's Missing**:
```typescript
// T080 uses: enable_sparse: false (line 427)
// T080 uses: enable_hybrid: false (line 46 in searchChunks)
// Missing tests for:
1. Sparse vector generation (BM25 with IDF)
2. Sparse vector upload to Qdrant
3. Hybrid search (dense + sparse with RRF)
4. Lexical matching quality (exact term matches)
5. Semantic + lexical combination (RRF ranking)
```

**Why Important**:
- **Performance**: +7-10pp precision improvement (82% → 89-92%)
- **Implementation**: 600+ lines of production code (bm25.ts, search.ts)
- **Cost**: Same infrastructure, better results

**Test Complexity**: Medium (requires corpus statistics, BM25 scorer)

**Current Status**: Hybrid search implemented but not tested in T080

**Recommendation**: **MUST ADD to T080.1**

---

### Gap 4: Content Deduplication (T079) - CRITICAL ❌

**What's Missing**:
```typescript
// T079 implements reference counting + vector duplication
// Missing tests for:
1. Upload identical file → Deduplicate detected (SHA-256 match)
2. Upload identical file → Vectors duplicated instantly
3. Upload identical file → No Jina API call (0 cost)
4. Upload identical file → Reference count incremented
5. Delete reference → Physical file retained (other refs exist)
6. Delete last reference → Physical file deleted
7. Cross-organization deduplication → Works correctly
8. Storage quota accounting → Each org pays for reference
```

**Why Critical**:
- **Cost Impact**: 80% savings on duplicate uploads ($50/year for medium org)
- **Performance**: 14× faster (1.75s vs 25s for 1000 chunks)
- **Complexity**: 2000+ lines of code (migrations, lifecycle, tests)
- **Data Integrity**: Reference counting must be atomic

**Test Complexity**: High (requires multiple uploads, reference tracking)

**Current Status**: Comprehensive unit tests exist (lifecycle.test.ts), but not integrated into workflow test

**Recommendation**: **ADD to T080.1** or separate **T080.3 (Deduplication Integration Test)**

---

### Gap 5: Redis Cache Validation (T076, T078) - MEDIUM ⚠️

**What's Missing**:
```typescript
// T080 only tests graceful degradation (Redis down)
// Missing tests for:
1. Embedding cache hit → Faster response
2. Embedding cache miss → API call + cache write
3. Search cache hit → Instant results
4. Search cache TTL → Expiration behavior
5. Cache invalidation → Correct cleanup
```

**Why Important**:
- **Performance**: 90% latency reduction for cache hits
- **Cost**: Reduced Jina API calls
- **Reliability**: Cache failures should be graceful

**Test Complexity**: Low (start Redis, test with/without)

**Current Status**: T080 logs Redis errors but doesn't validate caching works

**Recommendation**: **OPTIONAL - Add to T080.1 if Redis available**

---

### Gap 6: Image Processing with OCR (T074.4) - MEDIUM ❌

**What's Missing**:
```typescript
// Images in PDFs (STANDARD/PREMIUM tiers)
// Missing tests for:
1. PDF with embedded images → Images extracted
2. Scanned PDF → OCR applied
3. Image-heavy document → All images processed
4. OCR quality → Text extracted correctly
```

**Why Important**:
- **Tier Feature**: STANDARD/PREMIUM tier differentiator
- **Educational Content**: Diagrams, charts, screenshots common
- **OCR Infrastructure**: Tesseract/EasyOCR configured

**Test Complexity**: Medium (requires sample PDFs with images)

**Recommendation**: **OPTIONAL - Add to T080.2 (Docling Tests)**

---

### Gap 7: Structure-Aware Enrichment (T075) - LOW ⚠️

**What's Missing**:
```typescript
// T080 checks basic metadata but not structure detection
// Missing validation for:
1. has_code: true → Code blocks detected
2. has_formulas: true → Math formulas detected
3. has_tables: true → Tables detected
4. has_images: true → Images detected
```

**Why Important**:
- **Search Filtering**: Users can filter by content type
- **Context Quality**: Better retrieval for technical content

**Test Complexity**: Low (add markdown with code/formulas)

**Recommendation**: **SHOULD ADD to T080 (minimal effort)**

---

## Test Coverage Summary

| Category | Covered | Not Covered | Coverage % |
|----------|---------|-------------|------------|
| Document Processing | 1 format (MD) | 3 formats (PDF, DOCX, PPTX) | 25% |
| Tier Restrictions | 0 tiers | 4 tiers (FREE, BASIC, STD, PREM) | 0% |
| Chunking | Hierarchical | Structure detection | 70% |
| Embeddings | Dense + caching fallback | Cache validation | 80% |
| Vector Upload | Dense vectors | Sparse vectors | 50% |
| Search | Dense semantic | Hybrid (BM25 + RRF) | 50% |
| Deduplication | 0 scenarios | 8 scenarios | 0% |
| Caching | Graceful degradation | Cache hit/miss | 30% |

**Overall Coverage**: **55%** (6/11 features fully tested)

---

## Recommendations

### Option 1: Extend T080 (Minimal Approach) ⭐ RECOMMENDED

**Add to existing T080**:
1. ✅ **Structure-aware metadata** (5 minutes)
   - Add test document with code blocks, formulas
   - Validate `has_code`, `has_formulas` detection

2. ✅ **BM25 hybrid search** (10 minutes)
   - Change `enable_sparse: true` in upload
   - Change `enable_hybrid: true` in search
   - Validate sparse vectors and RRF results

**Effort**: 15 minutes
**Impact**: Coverage 55% → 65%

---

### Option 2: Create T080.1 (Extended RAG Workflow Tests) ⭐⭐ BEST OPTION

**New Task: T080.1 [integration-tester] [US5] Extended RAG workflow tests (tier + hybrid + deduplication)**

**Test Coverage**:
1. **Tier-Based Processing** (30 minutes)
   - Test FREE tier rejection
   - Test BASIC tier (TXT/MD only)
   - Test STANDARD tier (PDF with OCR)
   - Test PREMIUM tier (PDF with images)
   - Validate error messages and upgrade prompts

2. **BM25 Hybrid Search** (15 minutes)
   - Upload documents with sparse vectors enabled
   - Test dense-only search
   - Test hybrid search (dense + sparse + RRF)
   - Compare precision improvements

3. **Content Deduplication** (30 minutes)
   - Upload identical file to 2 courses
   - Verify deduplication detected
   - Verify vectors duplicated (not regenerated)
   - Verify reference counting
   - Delete one reference, verify file retained
   - Delete last reference, verify file deleted

**Total Effort**: 75 minutes
**Impact**: Coverage 55% → 90%

---

### Option 3: Create Multiple Specialized Tests

**T080.1**: Tier-Based Processing Tests (30 min)
**T080.2**: Docling Integration Tests (45 min, requires MCP)
**T080.3**: Deduplication Integration Tests (30 min)
**T080.4**: Hybrid Search Tests (15 min)
**T080.5**: Redis Caching Tests (15 min, optional)

**Total Effort**: 135 minutes
**Impact**: Coverage 55% → 100%
**Complexity**: High (5 new test files)

---

## Proposed Task Structure

### T080 (Current) - Keep as Basic Smoke Test

**Purpose**: Validate core RAG pipeline works end-to-end
**Scope**: Markdown → Chunking → Embeddings → Upload → Search (Dense)
**Time**: <10 seconds
**Status**: ✅ COMPLETE

---

### T080.1 (NEW) - Extended RAG Workflow Tests ⭐⭐

**Purpose**: Validate advanced features (tiers, hybrid, deduplication)
**Agent**: integration-tester
**Priority**: HIGH
**Blocking**: T081, T082, T083

**Scope**:
```typescript
1. Tier-Based Processing (CRITICAL)
   - FREE tier: Reject uploads
   - BASIC tier: TXT/MD only
   - STANDARD tier: PDF/DOCX/PPTX with OCR
   - PREMIUM tier: All formats + images

2. BM25 Hybrid Search (HIGH)
   - Upload with sparse vectors enabled
   - Test hybrid search (dense + sparse + RRF)
   - Validate precision improvement

3. Content Deduplication (CRITICAL)
   - Upload identical file 2× → Deduplicate
   - Verify reference counting
   - Delete scenarios (retain file, delete file)

4. Structure-Aware Enrichment (LOW)
   - Validate has_code, has_formulas detection
```

**Time**: 75 minutes implementation, <30 seconds runtime
**Files**:
- `scripts/test-rag-extended.ts` (800 lines)
- Update `tasks.md` with T080.1

**Acceptance Criteria**:
- ✅ All 4 tiers tested with correct behavior
- ✅ Hybrid search shows >5% precision improvement vs dense
- ✅ Deduplication saves >80% processing time
- ✅ Structure metadata correctly detected

---

### T080.2 (NEW) - Docling Integration Tests

**Purpose**: Validate Docling MCP conversion quality
**Agent**: integration-tester
**Priority**: MEDIUM
**Depends On**: Docling MCP Server running
**Blocking**: None (optional for MVP)

**Scope**:
```typescript
1. PDF Conversion
   - Text-layer PDF → Clean markdown
   - Scanned PDF → OCR applied
   - Complex PDF → Structure preserved

2. DOCX Conversion
   - Document with styles → Markdown hierarchy
   - Tables → Markdown tables
   - Images → Image refs

3. PPTX Conversion
   - Slides → Markdown sections
   - Slide notes → Content
```

**Time**: 45 minutes implementation, <60 seconds runtime (Docling slow)
**Files**:
- `scripts/test-docling-conversion.ts` (500 lines)
- `test-data/sample.pdf`, `sample.docx`, `sample.pptx`

---

## Implementation Priority

### Phase 1: Immediate (Before T081, T082, T083) ⚠️ BLOCKING

1. **T080.1** - Extended RAG Workflow Tests
   - Reason: T081/T082/T083 depend on complete feature coverage
   - Time: 75 minutes
   - Impact: Coverage 55% → 90%

### Phase 2: Optional (Before Production)

2. **T080.2** - Docling Integration Tests
   - Reason: PDF conversion quality critical for production
   - Time: 45 minutes
   - Impact: Coverage 90% → 95%

3. **Redis Caching Tests**
   - Add to T080 if Redis available
   - Time: 15 minutes
   - Impact: Coverage 95% → 100%

---

## Conclusion

**Current T080 Status**: ✅ Good basic coverage (55%)
**Critical Gaps**: Tiers, Deduplication, Hybrid Search (45%)
**Recommendation**: **Create T080.1 immediately** (75 min effort, 35pp coverage gain)

**Rationale**:
- Tier-based processing is core business logic (MUST TEST)
- Deduplication is 2000 lines of critical code (MUST TEST)
- Hybrid search is advertised +7-10pp improvement (SHOULD VALIDATE)
- T081/T082/T083 assume full feature coverage (BLOCKED without T080.1)

**Next Steps**:
1. Create T080.1 task in tasks.md
2. Implement `scripts/test-rag-extended.ts`
3. Run full test suite (T080 + T080.1)
4. Proceed with T081, T082, T083

---

**Analysis completed**: 2025-10-15
**Analyst**: Claude Code (infrastructure-specialist)
**Status**: ⚠️ **ACTION REQUIRED** - Create T080.1 before proceeding to T081
