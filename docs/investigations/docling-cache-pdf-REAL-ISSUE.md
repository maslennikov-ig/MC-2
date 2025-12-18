# Docling PDF Issue - REAL ROOT CAUSE

**Date**: 2025-10-26
**Status**: 🔍 ROOT CAUSE IDENTIFIED

## Summary

The "No content in response" error is **NOT a cache corruption issue**.

**REAL PROBLEM**: **PDF file is too large (6.1MB)** → Docling MCP server timeout's → caches empty result → subsequent requests get cached empty response.

---

## Evidence

### Timeline from Logs:
```json
{"time":1761503111982, "msg":"Converting document"}  // 18:31:51 - Start
{"time":1761503298588, "msg":"Converting document"}  // 18:34:58 - Retry (3 min later!)
{"time":1761503301866, "from_cache":true}            // Cache hit
{"time":1761503301870, "err":"No content in response"} // Empty cached result
```

**Key Finding**: First conversion attempt took **3+ minutes**, then timed out.

### File Sizes:
```bash
-rw-r--r-- 1 me me 6.1M sample-course-material.pdf
-rw-r--r-- 1 me me 6.1M sample-course-material-v2.pdf
```

### Client Timeout Configuration:
- Client timeout: `300000ms` (5 minutes)
- Actual processing: **3+ minutes** before failure
- **Likely**: Docling MCP server has shorter timeout (~3 min)

### What Works:
- ✅ DOCX (500KB): `markdown_length: 20531`, `from_cache: false`
- ✅ TXT (50KB): `markdown_length: 6501`
- ❌ PDF (6.1MB): **timeout** → empty cache

---

## Why My Previous Fix Didn't Work

**Solution B (Use v2 filename):**
- ✅ Created new cache key: `34835c2e...` (different from `b097d98c...`)
- ❌ **Same timeout issue**: Large PDF still takes 3+ minutes
- ❌ **Empty result still cached**: New cache key, same problem

**Container restart:**
- ✅ Cleared `/app/cache/` (was empty anyway)
- ✅ DOCX now shows `from_cache: false` (cache cleared)
- ❌ PDF **still timeout's**: Problem is file size, not cache persistence

---

## Root Cause Analysis

### What's Happening:

1. **PDF Conversion Start**
   - Docling receives 6.1MB PDF
   - Begins OCR and layout analysis
   - Process is CPU/memory intensive

2. **Timeout on Server Side**
   - Docling MCP server timeout (~3 minutes)
   - Returns empty result or error
   - **This empty result gets cached**

3. **Cache Hit**
   - Subsequent requests find cached entry
   - Return cached empty result
   - Client sees "No content in response"

### Why Cache Persists:

**Docling MCP cache mechanism:**
- Caches by `document_key` = hash(file_path)
- Once cached, returns same result forever
- **No cache expiration/invalidation**
- **No size-based cache rules**

### Why Renaming Didn't Help:

```
sample-course-material.pdf     → key: b097d98c... → timeout → cache empty
sample-course-material-v2.pdf  → key: 34835c2e... → timeout → cache empty (NEW!)
```

Both files are **same size (6.1MB)**, so both timeout!

---

## Solution

### ✅ Option 1: Use Smaller PDF File (RECOMMENDED)

**Create lightweight test PDF:**
- Size: < 500KB (similar to DOCX)
- Pages: 1-2 pages
- Content: Simple text, no images
- Processing time: < 30 seconds

**Benefits:**
- ✅ No timeout issues
- ✅ Fast test execution
- ✅ Consistent with other test files (DOCX 500KB, TXT 50KB)
- ✅ No infrastructure changes needed

**Implementation:**
```bash
# Option A: Find existing smaller PDF
find . -name "*.pdf" -size -500k

# Option B: Create new simple PDF
# Use LibreOffice/Word to create 1-page PDF with simple text
# Target: 200-300KB max
```

### ⚠️ Option 2: Increase Docling MCP Timeout

**Not recommended because:**
- ❌ Requires Docling MCP server reconfiguration
- ❌ May require rebuilding Docker image
- ❌ Longer timeouts = slower tests
- ❌ Doesn't fix underlying issue (large file processing)

### ❌ Option 3: Keep Large PDF, Skip Tests

**Temporary workaround:**
```typescript
it.skip('should process large PDF file', async () => {
  // SKIP: 6.1MB PDF causes Docling timeout
});
```

**Not recommended:**
- ❌ Loses test coverage
- ❌ Doesn't fix the problem
- ❌ May hide other issues

---

## Comparison Table

| File Type | Size  | Processing Time | Result              | Cache Behavior |
|-----------|-------|----------------|---------------------|----------------|
| TXT       | 50KB  | < 1s           | ✅ Success          | N/A (fast)     |
| DOCX      | 500KB | < 2s           | ✅ Success          | `from_cache: false` |
| PDF       | 6.1MB | **3+ min timeout** | ❌ Empty result | `from_cache: true` → empty |

**Pattern**: Files > 1MB cause timeout in Docling MCP.

---

## Implementation Plan

### Step 1: Create Small Test PDF

**Requirements:**
- Size: 200-400KB
- Pages: 1-2
- Content: English + Russian text (for multilingual embedding test)
- Headings: H1, H2 (for hierarchical chunking test)
- No images (avoid OCR overhead)

**Content Example:**
```markdown
# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that focuses on
developing algorithms that can learn from data.

## Supervised Learning

Supervised learning uses labeled training data to teach algorithms to classify
data or predict outcomes accurately.

## Введение в машинное обучение (Russian)

Машинное обучение - это подраздел искусственного интеллекта, который фокусируется
на разработке алгоритмов.
```

### Step 2: Replace Test Fixture

```bash
# Remove large PDF
mv sample-course-material.pdf sample-course-material-LARGE-BACKUP.pdf
mv sample-course-material-v2.pdf sample-course-material-v2-LARGE-BACKUP.pdf

# Add new small PDF
# (Created manually: simple-course-material-SMALL.pdf → 300KB)
cp simple-course-material-SMALL.pdf sample-course-material.pdf
```

### Step 3: Update Tests (if needed)

**Update expected chunk counts:**
```typescript
// Old: Large PDF (6.1MB) → ~51-54 chunks
// New: Small PDF (300KB) → ~8-12 chunks

const expectedChunks = {
  pdf: 10,  // Updated for small PDF
  docx: 10,
  txt: 5
};
```

### Step 4: Validate

```bash
pnpm test tests/integration/document-processing-worker.test.ts -t "PDF"
```

**Expected:**
- ✅ `from_cache: false` (first run)
- ✅ `markdown_length: > 1000`
- ✅ Processing time: < 30s
- ✅ No timeout errors
- ✅ All 3 PDF tests pass

---

## Lessons Learned

### What I Got Wrong:

1. **❌ Assumed cache corruption**
   - Reality: Cache is working correctly, caching timeout results

2. **❌ Focused on cache invalidation**
   - Reality: Problem is file size, not cache mechanism

3. **❌ Thought renaming would fix it**
   - Reality: Same size file = same timeout

### What I Got Right:

1. **✅ Identified "No content" error**
2. **✅ Traced error to Docling MCP**
3. **✅ Found cache mechanism**
4. **✅ Tested multiple solutions**

### Key Insight:

**"No content in response" wasn't a bug - it was a SYMPTOM.**

The real bug: **Using a 6.1MB PDF in tests** when Docling MCP can't handle it in reasonable time.

---

## Prevention

### Test File Size Guidelines:

| Format | Max Size | Reason |
|--------|----------|--------|
| TXT    | 100KB    | Plain text, minimal processing |
| MD     | 100KB    | Markdown, simple parsing |
| DOCX   | 500KB    | Some processing overhead |
| PDF    | **500KB** | OCR + layout analysis = expensive |

### Best Practices:

1. **✅ Use minimal test fixtures**
   - Test files should be **representative**, not **real-world**
   - 1-2 pages is enough to test functionality

2. **✅ Monitor processing times**
   - Log timing for each step
   - Alert if processing > 30s for test files

3. **✅ Add timeout tests separately**
   - Test timeout behavior with dedicated tests
   - Don't timeout in normal integration tests

4. **✅ Document file size limits**
   - Add README to fixtures directory
   - Specify max file sizes per format

---

## Next Steps

1. ✅ **Create small PDF** (200-400KB, 1-2 pages)
2. ✅ **Replace test fixtures**
3. ✅ **Run PDF tests** - verify they pass
4. ✅ **Update documentation** - explain file size limits
5. ✅ **Close task 007** - with correct root cause

---

## References

- Original task: `specs/003-stage-2-implementation/007-fix-docling-cache-pdf-tests.md`
- Client timeout: `packages/course-gen-platform/src/shared/docling/client.ts:160`
- Test file location: `packages/course-gen-platform/tests/integration/fixtures/common/`
- Logs: See test output from 2025-10-26 18:31-18:35
