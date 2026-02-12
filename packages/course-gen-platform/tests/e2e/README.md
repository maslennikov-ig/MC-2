# End-to-End Tests

This directory contains comprehensive end-to-end tests for the MegaCampusAI course generation platform.

## Test Files

### `stage3-real-documents.test.ts`

**Purpose**: Validate Stage 3 document summarization workflow with production-grade Russian documents.

**Test Coverage**:

- PDF document processing with Docling extraction (622KB, 23 pages)
- Large TXT document processing with hierarchical chunking (275KB)
- Small TXT document processing (70KB)
- Russian language detection and processing
- Quality validation using Jina-v3 embeddings
- Cost tracking accuracy across multiple documents
- Multi-document progress tracking

**Test Documents** (located in `/home/me/code/megacampus2/.tmp/`):

1. `Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf` - Russian government ministry letter
2. `Постановление Правительства РФ от 23.12.2024 N 1875 О мерах по предоставлению национального режима.txt` - Government decree
3. `Презентация и обучение.txt` - Business presentation

**Test Cases**:

1. **Test 1**: PDF Document Processing
   - Validates PDF upload to Supabase storage
   - Tests Docling extraction pipeline
   - Verifies hierarchical chunking for large documents
   - Checks Russian language entity preservation

2. **Test 2**: Large TXT Document Processing
   - Tests direct TXT processing (no upload needed)
   - Validates hierarchical chunking strategy
   - Verifies cost calculation accuracy
   - Checks quality score > 0.75

3. **Test 3**: Small TXT Document Processing
   - Tests smaller document (still above 3K token threshold)
   - Validates processing method selection
   - Verifies quality and cost metrics

4. **Test 4**: Cost Accuracy Verification
   - Processes multiple documents sequentially
   - Aggregates cost data across all tests
   - Provides manual verification instructions for OpenRouter dashboard
   - Expected total cost: < $3.00 for 2 large TXT documents

5. **Test 5**: Quality Comparison
   - Generates summaries for manual quality review
   - Displays preview of each summary (first 500 chars)
   - Verifies compression ratios (5-30% of original)
   - Validates key information preservation

**Prerequisites**:

```bash
# Required environment variables (in .env.local):
OPENROUTER_API_KEY=sk-or-...
JINA_API_KEY=jina_...

# Required services:
# - Redis: docker run -d -p 6379:6379 redis:7-alpine
# - Supabase: database accessible
# - Docling: optional (PDF tests will skip if unavailable)

# Required test documents:
# - Copy test documents to /home/me/code/megacampus2/.tmp/
```

**Running Tests**:

```bash
# Run all E2E tests
pnpm test tests/e2e/stage3-real-documents.test.ts

# Run with verbose output
pnpm test tests/e2e/stage3-real-documents.test.ts --reporter=verbose

# Run specific test
pnpm test tests/e2e/stage3-real-documents.test.ts -t "Test 1"
```

**Expected Output**:

```
✓ Test 1: Should process Russian government letter (PDF, 622KB, 23 pages) (Xs)
  📄 Processing: Russian government ministry letter (PDF, 23 pages, 622KB)
     File: Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf
     ✓ Uploaded to storage: test-e2e/1730000000000-...
     ✓ Created file_catalog entry: 00000000-0000-0000-0000-000000000001
     ✓ Queued job: 1
     ⏳ Waiting for completion (timeout: 10 minutes)...
     ✓ Completed in 45s
     ✓ Summary length: 5234 chars (first 500 chars below)
     Preview: Министерство финансов Российской Федерации...
     ✓ Processing method: hierarchical
     ✓ Token counts: 12345 in, 1234 out
     ✓ Total tokens: 13579
     ✓ Estimated cost: $0.0456
     ✓ Quality score: 0.812
     ✓ Detected language: ru
     ✓ Key entities found: Минфин, России, 31.01.2025

✅ Test 1 complete: Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf
```

**Timeout Configuration**:

- Per-test timeout: 10 minutes (600,000ms)
- Sufficient for large document processing with LLM calls

**Manual Verification Steps**:

After running Test 4 (Cost Accuracy):

1. Visit OpenRouter dashboard: https://openrouter.ai/activity
2. Check recent API usage (last 15-20 minutes)
3. Verify costs match within ±10% tolerance
4. Compare dashboard costs to test output

After running Test 5 (Quality Comparison):

1. Review summary previews in console output
2. Verify key information is preserved:
   - Document dates and numbers
   - Key entities (Министерство, Правительство, etc.)
   - Main topics and actions
3. Check Russian language quality (grammar, coherence)
4. Verify compression ratios are reasonable (5-30%)

**Known Limitations**:

- PDF processing relies on Docling service availability
- If Docling is unavailable, Test 1 will be skipped gracefully
- Tests require real API keys (no mocking for E2E validation)
- Long-running tests (up to 10 minutes per document)

**Troubleshooting**:

If tests are skipped:

```
⚠️  OPENROUTER_API_KEY not found - tests will be skipped
   Set in .env.local: OPENROUTER_API_KEY=sk-or-...
```

Solution: Add missing API keys to `.env.local`

If tests timeout:

```
Error: Timeout waiting for summary completion on file ...
```

Solution: Check:

- Stage 3 worker is running
- Redis connection is active
- OpenRouter API is responding
- Network connectivity

If quality scores are low:

- Check document language matches `jobData.language`
- Verify Jina API key is valid
- Review summary content for accuracy
- Consider adjusting `quality_threshold` parameter

## Best Practices

1. **Run E2E tests in isolation**: Don't run alongside unit/integration tests
2. **Monitor API costs**: E2E tests consume real API credits
3. **Check logs**: Review console output for detailed progress
4. **Manual verification**: Always perform manual checks after automated tests
5. **Test data maintenance**: Keep test documents up to date and relevant

## Future Test Coverage

Planned additions:

- Multi-language document testing (English, Spanish, etc.)
- Very large document handling (>500KB)
- Error recovery scenarios (API failures, timeouts)
- Concurrent document processing
- Storage cleanup verification
- Progress tracking edge cases
