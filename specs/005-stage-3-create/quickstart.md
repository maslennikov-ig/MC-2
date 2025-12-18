# Quickstart Guide: Stage 3 - Document Summarization

**Feature**: Stage 3 - Document Summarization
**Created**: 2025-10-28
**Target Audience**: Developers implementing or testing Stage 3

## Prerequisites

Before starting Stage 3 implementation or testing, ensure:

1. ✅ **Stage 0-2 Complete**:
   - PostgreSQL database with RLS policies
   - Redis + BullMQ orchestrator running
   - Qdrant Cloud configured (Jina-v3 embeddings)
   - Stage 2 document processing working (file upload → text extraction → vectorization)

2. ✅ **Environment Variables**:
   ```bash
   # .env.local (or .env)
   OPENROUTER_API_KEY=sk-or-v1-...           # OpenRouter API key
   JINA_API_KEY=jina_...                     # Jina AI API key (existing from Stage 2)
   QDRANT_URL=https://...qdrant.io          # Qdrant Cloud URL (existing)
   QDRANT_API_KEY=...                       # Qdrant API key (existing)
   DATABASE_URL=postgresql://...            # Supabase connection string (existing)
   REDIS_URL=redis://localhost:6379         # Redis connection (existing)
   ```

3. ✅ **Dependencies Installed**:
   ```bash
   pnpm install
   ```

4. ✅ **Database Migration Applied**:
   ```bash
   # Run Stage 3 migration
   pnpm supabase migration up
   # Verify new columns exist
   pnpm supabase db diff --file verify-stage3
   ```

5. ✅ **Research Phase Complete** (P0):
   - Architecture decision documented in `research/architecture-decision.md`
   - AI framework selected (LangChain/LangGraph/direct API/Vercel AI SDK)
   - Summarization strategy validated (Map-Reduce/Refine/other)
   - Model benchmarked (Llama 3.3/GPT-4/Claude 3.5/Gemini 1.5)

---

## Quick Test (End-to-End)

**Goal**: Verify Stage 3 summarization works for a single document

### Step 1: Start Services

```bash
# Terminal 1: Start Supabase (if local)
pnpm supabase start

# Terminal 2: Start Redis (if local)
redis-server

# Terminal 3: Start BullMQ worker
pnpm --filter course-gen-platform dev:worker

# Terminal 4: Start Next.js dev server
pnpm --filter course-gen-platform dev
```

### Step 2: Upload Test Document

**Option A: Via Frontend UI**

1. Navigate to http://localhost:3000
2. Login with test user
3. Create new course
4. Upload a 5-10 page PDF document (Russian or English)
5. Wait for Stage 2 to complete (document processing)

**Option B: Via API (curl)**

```bash
# Upload file via tRPC endpoint (example)
curl -X POST http://localhost:3000/api/trpc/files.upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-document.pdf" \
  -F "course_id=550e8400-e29b-41d4-a716-446655440000"
```

**Option C: Via Database (testing only)**

```sql
-- Insert test document with extracted text
INSERT INTO file_catalog (
  file_id, course_id, organization_id, original_filename,
  storage_path, mime_type, file_size_bytes, upload_status,
  extracted_text, content_hash
) VALUES (
  gen_random_uuid(),
  '550e8400-e29b-41d4-a716-446655440000', -- Replace with real course_id
  'org_test123',                           -- Replace with real org_id
  'test-document.pdf',
  '/uploads/org_test123/course123/test-document.pdf',
  'application/pdf',
  102400,
  'completed',
  'This is a long test document text that exceeds the no-summary threshold...',
  encode(sha256('test-content'::bytea), 'hex')
);
```

### Step 3: Trigger Stage 3 Job

**Automatic Trigger** (if Stage 1 orchestrator running):

- Stage 3 jobs auto-start after Stage 2 completes for all documents in course

**Manual Trigger** (for testing):

```typescript
// File: scripts/trigger-stage3-test.ts
import { Queue } from 'bullmq';

const queue = new Queue('course-generation', {
  connection: { host: 'localhost', port: 6379 }
});

await queue.add('STAGE_3_SUMMARIZATION', {
  course_id: '550e8400-e29b-41d4-a716-446655440000',
  organization_id: 'org_test123',
  file_id: 'abc-123-file-id',
  correlation_id: 'test-' + Date.now(),
  extracted_text: 'Long document text here...',
  original_filename: 'test-document.pdf',
  strategy: 'map_reduce', // From research decision
  model: 'openai/gpt-oss-20b', // From research decision
  no_summary_threshold_tokens: 3000,
  quality_threshold: 0.75,
  max_output_tokens: 200000
});

console.log('Stage 3 job added to queue');
```

```bash
# Run trigger script
pnpm tsx scripts/trigger-stage3-test.ts
```

### Step 4: Monitor Progress

**Option A: BullMQ Dashboard**

1. Navigate to http://localhost:3000/admin/queues
2. View `STAGE_3_SUMMARIZATION` job status
3. Check logs for processing details

**Option B: Database Query**

```sql
-- Check summarization status
SELECT
  file_id,
  original_filename,
  processing_method,
  summary_metadata->>'quality_score' as quality_score,
  summary_metadata->>'estimated_cost_usd' as cost,
  summary_metadata->>'processing_duration_ms' as duration_ms,
  LEFT(processed_content, 200) as summary_preview
FROM file_catalog
WHERE course_id = '550e8400-e29b-41d4-a716-446655440000'
  AND processed_content IS NOT NULL;
```

**Option C: tRPC Query**

```typescript
// In browser console or test script
const status = await trpc.summarization.getSummarizationStatus.query({
  course_id: '550e8400-e29b-41d4-a716-446655440000'
});

console.log(status);
// {
//   total_documents: 1,
//   completed_count: 1,
//   failed_count: 0,
//   progress_percentage: 100,
//   files: [{ quality_score: 0.82, ... }]
// }
```

### Step 5: Verify Summary Quality

```sql
-- Retrieve full summary
SELECT
  original_filename,
  processing_method,
  processed_content,
  summary_metadata
FROM file_catalog
WHERE file_id = 'abc-123-file-id';
```

**Manual Quality Check**:
1. Read `processed_content` (summary)
2. Compare to `extracted_text` (original)
3. Verify:
   - ✅ Summary captures main ideas
   - ✅ No hallucinations (facts match original)
   - ✅ Coherent narrative (not choppy/disjointed)
   - ✅ Appropriate length (not too short/long)
   - ✅ Quality score in `summary_metadata` >= 0.75

---

## Development Workflow

### Implementing a New Summarization Strategy

**Example**: Add "Hierarchical" strategy (research validated)

#### 1. Create Strategy File

**Location**: `packages/course-gen-platform/src/orchestrator/strategies/hierarchical.ts`

```typescript
import { SummarizationStrategy } from '@/shared-types';
import { LLMClient } from '../services/llm-client';
import { Logger } from '../services/logger';

export async function hierarchicalSummarization(
  text: string,
  model: string,
  maxOutputTokens: number,
  logger: Logger
): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  // Implementation based on research
  logger.info('Starting hierarchical summarization', {
    textLength: text.length,
    model
  });

  // 1. Split text into semantic chunks (heading-aware)
  const chunks = splitIntoSemanticChunks(text);

  // 2. Summarize each chunk (leaf level)
  const leafSummaries = await Promise.all(
    chunks.map(chunk => summarizeChunk(chunk, model, logger))
  );

  // 3. Recursively combine summaries (tree reduction)
  let currentLevel = leafSummaries;
  let level = 1;

  while (currentLevel.length > 1) {
    logger.info(`Hierarchical level ${level}`, { chunks: currentLevel.length });
    currentLevel = await combineLevel(currentLevel, model, logger);
    level++;
  }

  const finalSummary = currentLevel[0];

  return {
    summary: finalSummary.text,
    inputTokens: calculateTotalInputTokens(chunks, leafSummaries),
    outputTokens: calculateTotalOutputTokens(finalSummary)
  };
}

// Helper functions...
```

#### 2. Register Strategy

**Location**: `packages/course-gen-platform/src/orchestrator/strategies/index.ts`

```typescript
import { mapReduceSummarization } from './map-reduce';
import { refineSummarization } from './refine';
import { hierarchicalSummarization } from './hierarchical'; // Add import

export const strategies = {
  map_reduce: mapReduceSummarization,
  refine: refineSummarization,
  hierarchical: hierarchicalSummarization, // Add entry
  // ... other strategies
};

export function getStrategy(name: string) {
  const strategy = strategies[name];
  if (!strategy) {
    throw new Error(`Unknown strategy: ${name}`);
  }
  return strategy;
}
```

#### 3. Update Type Definitions

**Location**: `packages/shared-types/src/summarization-job.ts`

```typescript
export type SummarizationStrategy =
  | 'full_text'
  | 'map_reduce'
  | 'refine'
  | 'map_rerank'
  | 'stuffing'
  | 'hierarchical'; // Add here
```

#### 4. Write Unit Tests

**Location**: `tests/unit/hierarchical-strategy.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { hierarchicalSummarization } from '@/orchestrator/strategies/hierarchical';

describe('Hierarchical Summarization', () => {
  it('should split text into semantic chunks', async () => {
    const text = 'Long document with multiple sections...';
    const result = await hierarchicalSummarization(text, 'test-model', 200000, mockLogger);

    expect(result.summary).toBeDefined();
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it('should handle single-chunk documents', async () => {
    const shortText = 'Short document.';
    const result = await hierarchicalSummarization(shortText, 'test-model', 200000, mockLogger);

    expect(result.summary).toContain('Short document');
  });

  // More test cases...
});
```

#### 5. Integration Test

**Location**: `tests/integration/stage3-hierarchical.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { testSummarizationWorkflow } from './helpers/workflow-helper';

describe('Stage 3: Hierarchical Strategy Integration', () => {
  it('should process document with hierarchical strategy', async () => {
    const result = await testSummarizationWorkflow({
      strategy: 'hierarchical',
      model: 'openai/gpt-oss-20b',
      testDocument: 'long-technical-manual.pdf'
    });

    expect(result.processing_method).toBe('hierarchical');
    expect(result.summary_metadata.quality_score).toBeGreaterThan(0.75);
    expect(result.summary_metadata.hierarchical_levels).toBeGreaterThan(1);
  });
});
```

---

### Testing Quality Validation

**Goal**: Verify semantic similarity check works correctly

#### 1. Create Test with Known Quality Score

```typescript
// File: tests/unit/quality-validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateSummaryQuality } from '@/orchestrator/services/quality-validator';

describe('Quality Validator', () => {
  it('should pass high-quality summaries (>0.75)', async () => {
    const originalText = 'Detailed explanation of quantum mechanics...';
    const goodSummary = 'Summary covering key quantum mechanics concepts...';

    const result = await validateSummaryQuality(originalText, goodSummary);

    expect(result.quality_score).toBeGreaterThan(0.75);
    expect(result.quality_check_passed).toBe(true);
  });

  it('should fail low-quality summaries (<0.75)', async () => {
    const originalText = 'Detailed explanation of quantum mechanics...';
    const badSummary = 'Unrelated content about cooking pasta...';

    const result = await validateSummaryQuality(originalText, badSummary);

    expect(result.quality_score).toBeLessThan(0.75);
    expect(result.quality_check_passed).toBe(false);
  });

  it('should handle multilingual content (Russian)', async () => {
    const russianText = 'Подробное объяснение квантовой механики...';
    const russianSummary = 'Краткое изложение ключевых концепций...';

    const result = await validateSummaryQuality(russianText, russianSummary);

    expect(result.quality_score).toBeGreaterThan(0.0); // Language-agnostic
  });
});
```

#### 2. Integration Test with Real LLM

```typescript
// File: tests/integration/quality-validation-e2e.test.ts
import { describe, it, expect } from 'vitest';
import { summarizationWorker } from '@/orchestrator/workers/stage3-summarization.worker';

describe('Stage 3: Quality Validation E2E', () => {
  it('should retry with better strategy when quality fails', async () => {
    // Create job with intentionally poor strategy for test document
    const job = createTestJob({
      strategy: 'stuffing', // Known to produce low quality for this doc
      extracted_text: longComplexDocument,
      quality_threshold: 0.75
    });

    const result = await summarizationWorker.process(job);

    // Expect retry with improved strategy
    expect(result.summary_metadata.retry_attempts).toBeGreaterThan(0);
    expect(result.summary_metadata.retry_strategy_changes).toContain('stuffing->refine');
    expect(result.summary_metadata.quality_check_passed).toBe(true); // Eventually passes
  });
});
```

---

### Testing Cost Tracking

**Goal**: Verify API cost calculations are accurate

```typescript
// File: tests/unit/cost-estimation.test.ts
import { describe, it, expect } from 'vitest';
import { estimateCost } from '@/orchestrator/services/token-estimator';

describe('Cost Estimation', () => {
  it('should calculate cost for Llama 3.3 70B', () => {
    const inputTokens = 125000;
    const outputTokens = 3500;
    const model = 'openai/gpt-oss-20b';

    const cost = estimateCost(model, inputTokens, outputTokens);

    // Llama 3.3 pricing (example): $0.50/1M input, $1.50/1M output
    const expectedCost = (125000 / 1_000_000) * 0.50 + (3500 / 1_000_000) * 1.50;
    expect(cost).toBeCloseTo(expectedCost, 4); // 4 decimal places
  });

  it('should handle different model pricing', () => {
    const cost1 = estimateCost('openai/gpt-oss-20b', 100000, 5000);
    const cost2 = estimateCost('anthropic/claude-3.5-sonnet', 100000, 5000);

    // Claude should be more expensive than Llama
    expect(cost2).toBeGreaterThan(cost1);
  });
});
```

---

## Debugging

### Common Issues

#### Issue 1: Job Stuck in Queue

**Symptoms**:
- BullMQ dashboard shows job "active" for >10 minutes
- No progress updates in database

**Diagnosis**:

```bash
# Check worker logs
pnpm --filter course-gen-platform dev:worker 2>&1 | grep ERROR

# Check Redis connection
redis-cli PING
# Expected: PONG

# Check active jobs
redis-cli LRANGE bull:course-generation:active 0 -1
```

**Solutions**:
1. Check worker process is running
2. Verify Redis connection (REDIS_URL in .env)
3. Check timeout setting (default: 10 minutes)
4. Review error logs in database

#### Issue 2: Quality Check Always Fails

**Symptoms**:
- `quality_score` always <0.75
- Jobs retry multiple times, eventually fail

**Diagnosis**:

```sql
-- Check quality scores distribution
SELECT
  processing_method,
  AVG((summary_metadata->>'quality_score')::numeric) as avg_quality,
  MIN((summary_metadata->>'quality_score')::numeric) as min_quality,
  MAX((summary_metadata->>'quality_score')::numeric) as max_quality
FROM file_catalog
WHERE processing_method IS NOT NULL
GROUP BY processing_method;
```

**Solutions**:
1. Verify Jina-v3 API key is valid
2. Check Qdrant connection (vectors exist for documents)
3. Review summarization strategy (may need different approach)
4. Lower threshold temporarily for testing (e.g., 0.60)
5. Check if LLM is hallucinating (compare summary to original)

#### Issue 3: High API Costs

**Symptoms**:
- `estimated_cost_usd` higher than expected
- Budget alerts triggering

**Diagnosis**:

```sql
-- Analyze cost drivers
SELECT
  processing_method,
  summary_metadata->>'model_used' as model,
  AVG((summary_metadata->>'input_tokens')::numeric) as avg_input_tokens,
  AVG((summary_metadata->>'output_tokens')::numeric) as avg_output_tokens,
  AVG((summary_metadata->>'estimated_cost_usd')::numeric) as avg_cost
FROM file_catalog
WHERE processing_method IS NOT NULL
GROUP BY processing_method, model;
```

**Solutions**:
1. Check if documents are larger than expected (analyze token distribution)
2. Verify no-summary threshold is working (bypass small docs)
3. Consider cheaper model (Llama vs GPT-4)
4. Optimize chunk size to reduce API calls
5. Review retry logic (retries add cost)

#### Issue 4: Summary Quality Poor (Human Eval)

**Symptoms**:
- Semantic similarity >0.75 but summary is incoherent
- Missing key information from original

**Diagnosis**:
1. Read 5-10 summaries manually
2. Compare to original documents
3. Identify patterns (e.g., always misses tables, code blocks)

**Solutions**:
1. Switch summarization strategy (Map-Reduce → Refine)
2. Increase output token budget (less aggressive compression)
3. Add preprocessing for structured content (tables, code)
4. Adjust temperature parameter (lower = more conservative)
5. Consider better model (GPT-4/Claude vs Llama)

---

## Performance Benchmarking

### Goal: Validate Research Assumptions

```typescript
// File: scripts/benchmark-stage3.ts
import { performance } from 'perf_hooks';

async function benchmarkStrategy(
  strategy: string,
  model: string,
  documents: Array<{ text: string; name: string }>
) {
  const results = [];

  for (const doc of documents) {
    const start = performance.now();

    const result = await runSummarization({
      strategy,
      model,
      text: doc.text
    });

    const duration = performance.now() - start;

    results.push({
      document: doc.name,
      strategy,
      model,
      duration_ms: duration,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      quality_score: result.qualityScore,
      cost_usd: result.estimatedCost
    });
  }

  // Calculate statistics
  const avgDuration = results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length;
  const avgQuality = results.reduce((sum, r) => sum + r.quality_score, 0) / results.length;
  const avgCost = results.reduce((sum, r) => sum + r.cost_usd, 0) / results.length;

  console.log(`\n=== Benchmark Results: ${strategy} + ${model} ===`);
  console.log(`Avg Duration: ${avgDuration.toFixed(0)}ms`);
  console.log(`Avg Quality: ${avgQuality.toFixed(3)}`);
  console.log(`Avg Cost: $${avgCost.toFixed(4)}`);
  console.log(`\nDetails:`);
  console.table(results);

  return results;
}

// Run benchmark
const testDocuments = loadTestDocuments(); // 50-100 docs
await benchmarkStrategy('map_reduce', 'openai/gpt-oss-20b', testDocuments);
await benchmarkStrategy('refine', 'openai/gpt-oss-20b', testDocuments);
```

```bash
# Run benchmark
pnpm tsx scripts/benchmark-stage3.ts > benchmark-results.txt
```

---

## Next Steps

After completing Stage 3 quickstart:

1. ✅ **Verify All Tests Pass**:
   ```bash
   pnpm test
   pnpm type-check
   pnpm build
   ```

2. ✅ **Run Integration Tests**:
   ```bash
   pnpm test:integration
   ```

3. ✅ **Code Review**:
   - Run code-reviewer agent
   - Verify constitution compliance
   - Check for security issues

4. ✅ **Update Documentation**:
   - Update README.md with Stage 3 status
   - Document any research decisions made
   - Add troubleshooting notes for common issues

5. ➡️ **Proceed to Stage 4**:
   - Stage 4 (Course Structure Analyze) can begin once ALL documents are summarized
   - Verify strict barrier enforcement (100% completion required)

---

## References

- **Spec**: [spec.md](./spec.md) - Feature requirements and user stories
- **Plan**: [plan.md](./plan.md) - Implementation plan and architecture
- **Research**: [research/architecture-decision.md](./research/architecture-decision.md) - AI framework, strategy, model selection
- **Data Model**: [data-model.md](./data-model.md) - Database schema and types
- **API Contracts**: [contracts/](./contracts/) - tRPC endpoints and JSON schemas
- **Constitution**: [/.specify/memory/constitution.md](../../.specify/memory/constitution.md) - Project principles
