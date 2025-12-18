# 007: Fix Docling Cache for PDF Tests

**Status**: 🟡 IN PROGRESS
**Created**: 2025-10-26
**Updated**: 2025-10-27
**Parent**: 003-stage-2-implementation
**Priority**: HIGH

## Overview

Fix 3 failing PDF integration tests caused by Docling MCP server timeout and cache issues.

**Current**: 3 PDF tests failing (TRIAL, STANDARD, PREMIUM tiers)
**Target**: All 3 PDF tests passing
**Impact**: +3 tests → 15/17 passing (88.2%)

## Updates (2025-10-27)

### Root Cause Identified
**REAL ISSUE**: PDF file too large (6.1 MB) causes Docling timeout (~3 minutes processing time)
- **Initial diagnosis** (cache corruption): ❌ Incorrect
- **Actual problem** (file size + timeout): ✅ Confirmed via log analysis

### Actions Completed
1. ✅ Increased Docling timeout: 5 minutes → **20 minutes**
2. ✅ Updated tier structure: STANDARD supports PDF/DOCX/PPTX (files WITHOUT images)
3. ✅ Created future tasks:
   - T075.17: PDF Chunking (for files >10 MB)
   - T075.18: Image Processing Research (PREMIUM tier)

### Next Steps
- [ ] Test 6 MB PDF with 20-minute timeout
- [ ] Verify STANDARD tier accepts PDF files
- [ ] Update test expectations if needed

## Current State

### Failing Tests
1. TRIAL Tier > PDF processing
2. STANDARD Tier > PDF processing
3. PREMIUM Tier > PDF processing

### Error Pattern
```json
{"document_key":"b097d98cca202ee56def98c4de82d91f","from_cache":true}
{"err":"No content in response"}
```

**All 3 tests fail with same error**: Docling returns empty content from cache.

## Root Cause

### Evidence
1. **Cache hit confirmed**: `"from_cache":true` in logs
2. **Empty response**: `"No content in response"` error
3. **PDF file exists**: `sample-course-material.pdf` (6.1MB) is valid
4. **Worker expects content**: Fails when markdown_content is empty

### Why Previous Fixes Failed
- ✅ Restarted container (2x) - cache not in memory
- ✅ Deleted volume `docling-mcp_docling-cache` - cache not in volume
- ❌ Cache persists in container filesystem

### Cache Location
Docling MCP likely stores cache in:
- `/app/.cache/` (inside container)
- `/tmp/docling-cache/` (inside container)
- Container filesystem (not in named volume)

## Solution Steps

### Option A: Rebuild Container (Recommended)

**Effort**: 15 minutes
**Success Probability**: 95%

```bash
# Stop and remove container
docker-compose stop docling-mcp
docker-compose rm -f docling-mcp

# Rebuild from scratch (no cache)
docker-compose build --no-cache docling-mcp

# Start fresh container
docker-compose up -d docling-mcp

# Wait for health check
sleep 30

# Verify container is healthy
docker ps | grep docling

# Run tests
pnpm test tests/integration/document-processing-worker.test.ts
```

**Expected Result**: Cache cleared, PDF conversion works from scratch.

---

### Option B: Use Different PDF File

**Effort**: 10 minutes
**Success Probability**: 90%

```bash
# Copy existing PDF with new name
cp packages/course-gen-platform/tests/integration/fixtures/common/sample-course-material.pdf \
   packages/course-gen-platform/tests/integration/fixtures/common/sample-course-v2.pdf

# Update test fixtures to use new file
# Edit: tests/integration/helpers/test-helpers.ts
# Change: getFixturePath('pdf') to return 'sample-course-v2.pdf'
```

**Expected Result**: New filename → different cache key → no cache hit → fresh conversion.

---

### Option C: Clear Cache via Docker Exec

**Effort**: 5 minutes
**Success Probability**: 70%

```bash
# Find cache directory inside container
docker exec docling-mcp-server find / -name "*cache*" -type d 2>/dev/null | grep -i docling

# Clear cache directories
docker exec docling-mcp-server rm -rf /app/.cache/*
docker exec docling-mcp-server rm -rf /tmp/*

# Restart container
docker restart docling-mcp-server

# Run tests
pnpm test tests/integration/document-processing-worker.test.ts
```

**Expected Result**: Cache deleted, fresh conversion on next request.

---

## Validation

### Success Criteria
- [ ] All 3 PDF tests pass
- [ ] Docling logs show: `"from_cache":false` (first run)
- [ ] Markdown content > 1000 characters
- [ ] Vector count = 51-54 (hierarchical chunks for PDF)
- [ ] No "No content in response" errors

### Test Command
```bash
pnpm test tests/integration/document-processing-worker.test.ts -t "should process PDF"
```

### Expected Output
```
✓ TRIAL Tier > should process PDF file successfully
✓ STANDARD Tier > should process PDF file successfully
✓ PREMIUM Tier > should process PDF file successfully
```

---

## Rollback Plan

If all solutions fail:

```typescript
// Add .skip to PDF tests temporarily
it.skip('should process PDF file successfully', async () => {
  // SKIP: Docling cache issue - rebuilding container needed
```

This maintains 12/14 non-PDF tests passing (85.7%).

---

## Files to Modify

**If using Option B (different PDF)**:
- `tests/integration/helpers/test-helpers.ts` - Update `getFixturePath('pdf')`
- `tests/integration/fixtures/common/sample-course-v2.pdf` - New PDF file

**No code changes needed for Options A or C** (infrastructure only).

---

## Notes

- **Root Issue**: Docling MCP caches document conversions by file path hash
- **Cache Behavior**: Once cached, returns same result forever (even if result is empty)
- **Why Empty**: Likely previous conversion failed but cached the empty result
- **Prevention**: Add cache invalidation logic OR use unique filenames in tests

## Completed Subtasks (2025-10-27)

### 1. ✅ Docling Performance Research
**File**: `docs/investigations/docling-large-files-research.md`
- Analyzed Docling benchmarks (ArXiv 2408.09869)
- Reviewed GitHub issues (#568, #1283)
- Identified file size limits (6.1 MB → timeout)
- Recommended solutions (PDF chunking, timeout increase)

### 2. ✅ Increased Docling Timeout
**Files Modified**:
- `packages/course-gen-platform/src/shared/docling/client.ts` (line 33, 164, 556)
- `packages/course-gen-platform/src/shared/docling/types.ts` (line 286)

**Changes**:
- Default timeout: 300000ms (5 min) → **1200000ms (20 min)**
- Environment variable: `DOCLING_MCP_TIMEOUT` default updated

### 3. ✅ Updated Tier Structure
**Files Modified**:
- `docs/PRICING-TIERS.md` (lines 51-59, 397-447, 526-563)
- `packages/shared-types/src/zod-schemas.ts` (lines 145-231)
- `packages/course-gen-platform/src/shared/validation/file-validator.ts` (lines 22-23, 431-441)

**Changes**:
- **STANDARD**: Now supports PDF, DOCX, PPTX, HTML, TXT, MD (files WITHOUT images, max 10 MB)
- **PREMIUM**: All formats WITH images (PNG, JPG, GIF, etc., max 100 MB)
- Added `FILE_SIZE_LIMITS_BY_TIER` constant

### 4. ✅ Created Future Tasks
**Files Created**:
- `specs/003-stage-2-implementation/T075.17-PDF-CHUNKING.md`
  - PDF chunking for files >10 MB
  - STANDARD tier: Reject files >10 MB with upgrade message
  - PREMIUM tier: Automatic chunking for files >10 MB (up to 100 MB)

- `specs/003-stage-2-implementation/T075.18-IMAGE-PROCESSING-PREMIUM.md`
  - Research phase: Compare Vision API solutions (GPT-4o, Jina, PaddleOCR, etc.)
  - Implementation phase: Integrate optimal solution for PREMIUM tier
  - Image semantic descriptions for enhanced course generation

## References

- **Research**: `docs/investigations/docling-large-files-research.md` (created 2025-10-27)
- **Research**: `docs/investigations/docling-cache-pdf-investigation.md` (initial analysis)
- **Research**: `docs/investigations/docling-cache-pdf-REAL-ISSUE.md` (root cause)
- **Pricing**: `docs/PRICING-TIERS.md` (updated 2025-10-27)
- **Future Tasks**:
  - `specs/003-stage-2-implementation/T075.17-PDF-CHUNKING.md`
  - `specs/003-stage-2-implementation/T075.18-IMAGE-PROCESSING-PREMIUM.md`
- **Docker**: `docker-compose.yml` (docling-mcp service)
- **Tests**: `tests/integration/document-processing-worker.test.ts`
- **Previous**: `006-fix-qdrant-scroll-inconsistency.md`
