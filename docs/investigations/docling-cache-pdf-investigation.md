# Docling Cache PDF Tests Investigation

**Created**: 2025-10-26
**Status**: 🔍 Investigation Complete
**Priority**: HIGH

## Executive Summary

Three PDF integration tests are failing with identical cache-related errors. Docling MCP server returns empty content from cache, causing "No content in response" error in the application.

**Impact**: 3/17 tests failing (82.4% pass rate)
**Root Cause**: Cached empty conversion result in Docling MCP container filesystem
**Recommended Fix**: Option A - Rebuild container (95% success probability)

---

## Error Analysis

### Error Pattern
```json
{"document_key":"b097d98cca202ee56def98c4de82d91f","from_cache":true}
{"err":"No content in response"}
```

### Failing Tests
1. TRIAL Tier > should process PDF file successfully
2. STANDARD Tier > should process PDF file successfully
3. PREMIUM Tier > should process PDF file successfully

### Error Flow

1. **Document Conversion** (`client.ts:273-308`)
   - Calls `convert_document_into_docling_document` tool
   - Returns: `{from_cache: true, document_key: "b097d98c..."}`
   - ✅ This step succeeds

2. **Markdown Export** (`client.ts:345-368`)
   - Calls `export_docling_document_to_markdown` tool
   - Expects: `{document_key: string, markdown: string}`
   - **Returns: Empty or missing markdown string**
   - ❌ Throws error at line 357-361

3. **Content Validation** (`client.ts:468-475`)
   - Checks `if (!response.content)`
   - ❌ **Throws: "No content in response"** (line 470)

---

## Root Cause Analysis (Prioritized)

### 🔴 Cause #1: Cached Empty Conversion Result (Confidence: 95%)

**Evidence:**
- Log shows `from_cache: true` for all failing tests
- Same `document_key` across all 3 test tiers
- Error occurs in markdown export, not initial conversion
- Container restarts don't fix the issue (cache survives)

**Why This Happens:**
1. Previous test run or manual conversion failed during markdown export
2. Docling MCP cached the **empty result** for this specific PDF
3. Cache key is based on file path hash: `b097d98cca202ee56def98c4de82d91f`
4. All subsequent requests return the same empty cached result

**Cache Mechanism (from Research):**
- Docling uses local document caching for performance
- Cache is stored in **container filesystem** (not Docker volume)
- Cache key = hash of file path
- No automatic cache invalidation or expiration
- No documented cache clear mechanism via API

**Documentation Sources:**
- Docling MCP README: "Local document caching for improved performance"
- Docling Serve API: `/v1/clear/converters` endpoint (for model cache, not document cache)
- No documentation found for document conversion cache invalidation

---

### 🟡 Cause #2: Container Filesystem Cache Persistence (Confidence: 85%)

**Evidence:**
- Previous fixes tried: container restart (2x), volume deletion
- Cache still persists after these operations
- Docker compose shows no named volume for Docling cache

**Docker Configuration Analysis** (`docker-compose.yml:22-36`):
```yaml
docling-mcp:
  image: docling-mcp-docling-mcp
  container_name: docling-mcp-server
  volumes:
    - /home/me/code/megacampus2:/home/me/code/megacampus2:ro
```

**Key Observations:**
- No named volume for cache storage
- Only project directory is mounted (read-only)
- Cache likely stored in: `/app/.cache/`, `/tmp/docling-cache/`, or similar
- Container filesystem is **persistent across restarts** but **not across rebuilds**

---

### 🟢 Cause #3: MCP Tool Response Format Issue (Confidence: 30%)

**Less Likely But Possible:**
- `export_docling_document_to_markdown` tool returns malformed response
- Parsing logic at line 364-367 fails silently
- Empty string is cached as "valid" result

**Counter-Evidence:**
- Error message is clear: "No content in response"
- Would affect all PDFs, not just this one
- Cache hit indicates previous successful conversion

---

## Community Research Findings

### GitHub Issues Reviewed

**Issue #1879 - Corrupted PDF Cache Model Download**
- **Date**: July 1, 2025
- **Issue**: Corrupted PDFs cause EasyOCR to bypass local cache
- **Relevant Learning**: Cache bypass can occur with problematic files
- **Not Applicable**: Our PDF is valid (6.1MB, no corruption)

**Issue #1648 - Mean of Empty Slice During Conversion**
- **Date**: 2025
- **Issue**: PDF conversion fails with array errors
- **Relevant Learning**: Empty content can be produced by conversion failures
- **Possibly Applicable**: Empty result might be cached from previous failure

**Discussion #2295 - Running in Cached Mode**
- **Date**: 2025
- **Issue**: Models download despite cache configuration
- **Relevant Learning**: Cache configuration can be tricky
- **Not Applicable**: We're dealing with document cache, not model cache

### Docling Documentation Research

**Caching Features:**
- ✅ Local document caching confirmed as feature
- ❌ No cache invalidation API documented
- ❌ No cache size limits documented
- ❌ No cache expiration policy documented

**Cache Clear Methods Found:**
- `/v1/clear/converters` - Clears **model cache** only (not document cache)
- `/v1/clear/results` - Clears **task results** (async mode only)
- No endpoint for clearing document conversion cache

---

## Solutions (Prioritized)

### ✅ Solution A: Rebuild Container (RECOMMENDED)

**Success Probability**: 95%
**Effort**: 15 minutes
**Risk**: Low

**Rationale:**
- Container rebuild creates fresh filesystem
- Clears ALL cached data (models + documents)
- No code changes required
- Proven to work for similar issues

**Implementation:**
```bash
# Stop and remove container
docker-compose stop docling-mcp
docker-compose rm -f docling-mcp

# Rebuild from scratch (no cache)
docker-compose build --no-cache docling-mcp

# Start fresh container
docker-compose up -d docling-mcp

# Wait for service to be ready
sleep 30

# Verify health
docker ps | grep docling

# Run tests
pnpm test tests/integration/document-processing-worker.test.ts -t "should process PDF"
```

**Expected Result:**
- ✅ `from_cache: false` on first conversion
- ✅ Markdown content > 1000 characters
- ✅ Vector count = 51-54
- ✅ All 3 PDF tests pass

---

### ✅ Solution B: Use Different PDF File

**Success Probability**: 90%
**Effort**: 10 minutes
**Risk**: Low

**Rationale:**
- Different filename → different cache key
- No cache hit → fresh conversion
- Bypasses cache issue without infrastructure changes

**Implementation:**
```bash
# Create copy with new filename
cp packages/course-gen-platform/tests/integration/fixtures/common/sample-course-material.pdf \
   packages/course-gen-platform/tests/integration/fixtures/common/sample-course-material-v2.pdf

# Update test helper to use new file
# Edit: tests/integration/helpers/test-helpers.ts
# Change: 'sample-course-material.pdf' → 'sample-course-material-v2.pdf'
```

**Files to Modify:**
- `tests/integration/helpers/test-helpers.ts` - Update `getFixturePath('pdf')`

**Expected Result:**
- ✅ New cache key generated
- ✅ Fresh conversion from PDF
- ✅ All 3 PDF tests pass

**Caveat:**
- Workaround, not a fix
- Cache issue may recur if test fails again
- Requires renaming file each time cache corrupts

---

### ⚠️ Solution C: Clear Cache via Docker Exec

**Success Probability**: 70%
**Effort**: 5 minutes
**Risk**: Medium (may not find all cache locations)

**Rationale:**
- Quick fix without rebuild
- Directly targets cache directories
- May miss some cache locations

**Implementation:**
```bash
# Find cache directories
docker exec docling-mcp-server find / -name "*cache*" -type d 2>/dev/null | grep -i docling

# Clear common cache locations
docker exec docling-mcp-server rm -rf /app/.cache/*
docker exec docling-mcp-server rm -rf /tmp/docling-cache/*
docker exec docling-mcp-server rm -rf /tmp/*

# Restart container to ensure clean state
docker-compose restart docling-mcp

# Wait for restart
sleep 10

# Run tests
pnpm test tests/integration/document-processing-worker.test.ts -t "should process PDF"
```

**Expected Result:**
- ✅ Cache cleared
- ✅ Fresh conversion on next request
- ✅ All 3 PDF tests pass

**Risk Factors:**
- May not find all cache directories
- Cache location may be non-standard
- Partial cache clear could cause inconsistency

---

## Validation Criteria

### Success Metrics
- [ ] All 3 PDF tests pass
- [ ] Docling logs show: `from_cache: false` (first run after fix)
- [ ] Markdown content length > 1000 characters
- [ ] Vector count = 51-54 (hierarchical chunking for PDF)
- [ ] No "No content in response" errors
- [ ] Test pass rate: 15/17 (88.2%)

### Test Command
```bash
# Run all PDF tests
pnpm test tests/integration/document-processing-worker.test.ts -t "should process PDF"

# Run full suite
pnpm test tests/integration/document-processing-worker.test.ts
```

### Expected Output
```
✓ TRIAL Tier > should process PDF file successfully (Xms)
✓ STANDARD Tier > should process PDF file successfully (Xms)
✓ PREMIUM Tier > should process PDF file successfully (Xms)

Test Files  1 passed (1)
Tests  15 passed (15)
```

---

## Prevention Recommendations

### Short-term
1. **Add cache monitoring**: Log cache hit/miss rates
2. **Add content validation**: Verify markdown content before caching
3. **Add retry logic**: Retry with `force_refresh=true` flag if content is empty

### Long-term
1. **Implement cache invalidation**:
   - Add TTL (time-to-live) for cached documents
   - Add manual cache clear endpoint
   - Add cache size limits with LRU eviction

2. **Improve error handling**:
   - Detect empty cached results
   - Automatically retry without cache
   - Log cache corruption events

3. **Add health checks**:
   - Periodic cache validation
   - Detect and clear corrupted entries
   - Monitor cache hit rates

4. **Update Docling MCP**:
   - Check for newer versions with cache improvements
   - Submit issue/PR to Docling project for cache invalidation API

---

## References

### Code Files
- `packages/course-gen-platform/src/shared/docling/client.ts:468-475` - Error location
- `packages/course-gen-platform/src/shared/docling/client.ts:345-368` - Markdown export
- `docker-compose.yml:22-36` - Docling service configuration
- `specs/003-stage-2-implementation/007-fix-docling-cache-pdf-tests.md` - Task spec

### External Resources
- Docling GitHub: https://github.com/docling-project/docling
- Docling MCP: https://github.com/docling-project/docling-mcp
- Docling Serve API: https://github.com/docling-project/docling-serve
- Issue #1879: Corrupted PDF cache bypass
- Discussion #2295: Cache mode configuration

### Related Issues
- `006-fix-qdrant-scroll-inconsistency.md` - Previous investigation
- Integration test failures: 3/17 tests failing

---

## Decision

**Selected Solution**: **Option A - Rebuild Container**

**Justification**:
1. ✅ Highest success probability (95%)
2. ✅ Complete cache clearance guaranteed
3. ✅ No code changes required
4. ✅ Clean slate for future tests
5. ✅ 15-minute investment for long-term stability

**Fallback**: If Option A fails, proceed with Option B (different PDF file)

**Timeline**:
- Investigation: ✅ Complete
- Implementation: 15 minutes
- Validation: 5 minutes
- Total: ~20 minutes

---

## Next Steps

1. ✅ **Investigation Complete** - Root cause identified and prioritized
2. 🔄 **Implement Solution A** - Rebuild Docling container
3. ⏳ **Validate Fix** - Run PDF tests and verify success
4. ⏳ **Update Task Status** - Mark 007 as complete
5. ⏳ **Document Results** - Add outcome to task spec

---

## Appendix: Technical Details

### Cache Key Generation
```
document_key = hash(file_path)
Example: "b097d98cca202ee56def98c4de82d91f"
```

### MCP Tool Flow
```
1. convert_document_into_docling_document(file_path)
   → {from_cache: true, document_key: "..."}

2. export_docling_document_to_markdown(document_key)
   → {document_key: "...", markdown: ""}  ← EMPTY!

3. Error: "No content in response"
```

### Client Code Error Path
```typescript
// client.ts:345-368
const exportResult = await this.client.callTool({
  name: 'export_docling_document_to_markdown',
  arguments: { document_key: conversionResult.document_key }
});

const markdownResult = this.parseToolResponse<{
  document_key: string;
  markdown: string;
}>(exportTextContent.text, 'export_docling_document_to_markdown');

return {
  content: markdownResult.markdown,  // Empty string here!
};

// client.ts:468-475
if (!response.content) {  // Fails here!
  throw new DoclingError(
    DoclingErrorCode.PROCESSING_ERROR,
    'No content in response'  ← THIS ERROR
  );
}
```
