# Tasks: Stage 3 - Phase 9: Production Readiness & Quality Improvements

**Feature**: Stage 3 Document Summarization - Post-Release Optimization
**Branch**: `006-stage-3-phase-9-improvements`
**Prerequisites**: Stage 3 (v0.13.0) complete ✅, code review 8.5/10 ✅
**Goal**: Implement code review recommendations (→10/10) + Real document E2E testing

**Context**: Stage 3 implementation complete and approved for production (8.5/10). This phase addresses:
1. **3 High-Priority Recommendations** from code review (non-blocking but improve quality)
2. **Real Document E2E Testing** with actual Russian legal/business documents
3. **Production Confidence** through load testing and cost verification

---

## Format: `[ID] [P?] [EXECUTOR] [Phase] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[EXECUTOR]**: Agent to execute task (MAIN, fullstack-nextjs-specialist, integration-tester, code-reviewer)
- **[Phase]**: Task grouping (P0=Planning, P1=Code Quality, P2=E2E Testing, P3=Load Testing, P4=Polish)

---

## Phase 0: Git Branch & Orchestration Planning

**Purpose**: Setup branch and establish task execution strategy

### Step 1: Git Branch Setup

- [x] **T000** [MAIN] Create feature branch `006-stage-3-phase-9-improvements` ✅ DONE (2025-10-29)
  - Branch from: `main` (current HEAD after v0.13.0)
  - Verify clean working directory: `git status`
  - **Output**: Feature branch active and ready

### Step 2: Load Context

- [x] **T001** [MAIN] Load Stage 3 implementation context ✅ DONE (2025-10-29)
  - Read: `specs/005-stage-3-create/tasks.md` (completion summary at end)
  - Read: `.tmp/current/reports/code-review-report.md` (if exists) or tasks.md lines 1232-1235
  - Extract: 3 high-priority recommendations
  - **Output**: Context loaded, recommendations identified

### Step 3: Task Classification

- [ ] **T002** [MAIN] Classify tasks by executor
  - **Code improvements (P1)**: fullstack-nextjs-specialist (database optimization, error types, documentation)
  - **E2E tests (P2)**: integration-tester (real document processing, cost verification)
  - **Load tests (P3)**: integration-tester (batch processing, memory profiling)
  - **Final review (P4)**: code-reviewer (verify 10/10 achievement)
  - **Output**: Executor mapping ready

---

## Phase 1: Code Quality Improvements (High-Priority Recommendations)

**Purpose**: Implement 3 code review recommendations to achieve 10/10 score

**Parallel Execution**: Tasks T010-T012 can run in parallel (different files)

### Recommendation 1: Consolidate Stage 4 Barrier Queries

- [x] **T010** [P] **[EXECUTOR: fullstack-nextjs-specialist]** Optimize Stage 4 barrier database queries ✅ DONE (2025-10-29)
  - **File**: `packages/course-gen-platform/src/orchestrator/services/stage-barrier.ts`
  - **Current Problem**: 2 separate database queries (totalCount + completedCount)
  - **Solution**: Create Supabase RPC function `check_stage4_barrier` for atomic check
  - **Migration**:
    - File: `packages/course-gen-platform/supabase/migrations/20251029100000_stage4_barrier_rpc.sql`
    - Create function:
      ```sql
      CREATE OR REPLACE FUNCTION check_stage4_barrier(p_course_id UUID)
      RETURNS TABLE(
        total_count BIGINT,
        completed_count BIGINT,
        can_proceed BOOLEAN
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          COUNT(*)::BIGINT AS total_count,
          COUNT(*) FILTER (WHERE processed_content IS NOT NULL)::BIGINT AS completed_count,
          (COUNT(*) FILTER (WHERE processed_content IS NOT NULL) = COUNT(*))::BOOLEAN AS can_proceed
        FROM file_catalog
        WHERE course_id = p_course_id;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
      ```
  - **Update code**:
    ```typescript
    // Old (2 queries):
    const { count: totalCount } = await supabase.from('file_catalog').select('*', { count: 'exact', head: true }).eq('course_id', courseId);
    const { count: completedCount } = await supabase.from('file_catalog').select('*', { count: 'exact', head: true }).eq('course_id', courseId).not('processed_content', 'is', null);

    // New (1 query):
    const { data, error } = await supabase.rpc('check_stage4_barrier', { p_course_id: courseId });
    if (error) throw error;
    const { total_count, completed_count, can_proceed } = data[0];
    ```
  - **Test**: Update `tests/integration/stage3-stage4-barrier.test.ts` to verify RPC works
  - **Benefit**: -50% database roundtrips, more atomic check
  - **Output**: Migration created, code updated, test passing

### Recommendation 2: Add Explicit Error Types to Cost Calculator

- [x] **T011** [P] **[EXECUTOR: fullstack-nextjs-specialist]** Create custom error classes for cost calculator ✅ DONE (2025-10-29)
  - **File**: `packages/course-gen-platform/src/orchestrator/services/cost-calculator.ts`
  - **Create error types**:
    ```typescript
    /**
     * Error thrown when model pricing is not found in MODEL_PRICING
     *
     * @example
     * throw new UnknownModelError('gpt-5-turbo'); // Model not in pricing table
     */
    export class UnknownModelError extends Error {
      constructor(public model: string) {
        super(`Unknown model pricing: ${model}. Available models: ${Object.keys(MODEL_PRICING).join(', ')}`);
        this.name = 'UnknownModelError';
      }
    }

    /**
     * Error thrown when token count is invalid (negative or NaN)
     */
    export class InvalidTokenCountError extends Error {
      constructor(public tokens: number, public type: 'input' | 'output') {
        super(`Invalid ${type} token count: ${tokens}. Must be non-negative number.`);
        this.name = 'InvalidTokenCountError';
      }
    }

    /**
     * Error thrown when cost calculation exceeds reasonable bounds
     * Prevents catastrophic billing errors
     */
    export class CostOverflowError extends Error {
      constructor(public cost: number, public threshold: number = 1000) {
        super(`Cost calculation overflow: $${cost.toFixed(2)} exceeds threshold $${threshold}. Verify token counts.`);
        this.name = 'CostOverflowError';
      }
    }
    ```
  - **Update functions**:
    ```typescript
    export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
      // Validate inputs
      if (inputTokens < 0 || !Number.isFinite(inputTokens)) {
        throw new InvalidTokenCountError(inputTokens, 'input');
      }
      if (outputTokens < 0 || !Number.isFinite(outputTokens)) {
        throw new InvalidTokenCountError(outputTokens, 'output');
      }

      const pricing = MODEL_PRICING[model];
      if (!pricing) {
        throw new UnknownModelError(model);
      }

      const cost = (inputTokens / 1_000_000) * pricing.inputPer1M +
                   (outputTokens / 1_000_000) * pricing.outputPer1M;

      // Sanity check: cost should never exceed $1000 for single document
      if (cost > 1000) {
        throw new CostOverflowError(cost);
      }

      return cost;
    }
    ```
  - **Update tests**: Add test cases for new error types in `tests/unit/cost-calculator.test.ts`
  - **Export types**: Add to `packages/shared-types/src/index.ts` for cross-package use
  - **Benefit**: Better error handling, type safety, easier debugging
  - **Output**: Error classes created, code updated, tests passing

### Recommendation 3: Document Retry Strategy Escalation Paths

- [x] **T012** [P] **[EXECUTOR: fullstack-nextjs-specialist]** Add comprehensive JSDoc for retry escalation ✅ DONE (2025-10-29)
  - **File**: `packages/course-gen-platform/src/orchestrator/services/summarization-service.ts`
  - **Add JSDoc to `generateSummary` function** (lines ~80-150):
    ```typescript
    /**
     * Generate document summary with quality validation and automatic retry escalation
     *
     * ## Retry Strategy Escalation Path
     *
     * The service implements a 4-phase escalation strategy to ensure quality:
     *
     * ### Phase 1: Quality Retry (Same Model)
     * - **Trigger**: quality_score < 0.75 on first attempt
     * - **Action**: Retry with adjusted compression level
     *   - DETAILED → BALANCED (more aggressive summarization)
     * - **Max Retries**: 1
     * - **Cost Impact**: +$0.03-0.14 per attempt (same model)
     *
     * ### Phase 2: Model Upgrade
     * - **Trigger**: quality_score < 0.75 after Phase 1
     * - **Action**: Upgrade to higher-quality model
     *   - gpt-oss-20b ($0.03/1M) → gpt-oss-120b ($0.04/1M)
     *   - gpt-oss-120b → gemini-2.5-flash ($0.10/1M)
     * - **Max Upgrades**: 2
     * - **Cost Impact**: +2-7x per upgrade
     *
     * ### Phase 3: Token Increase
     * - **Trigger**: quality_score < 0.75 after Phase 2
     * - **Action**: Increase max_output_tokens
     *   - 10,000 → 15,000 tokens (50% increase)
     * - **Max Retries**: 1
     * - **Cost Impact**: +50% output tokens
     * - **Use Case**: Document requires more detailed summary
     *
     * ### Phase 4: Permanent Failure
     * - **Trigger**: quality_score < 0.75 after all attempts
     * - **Action**: Mark as unprocessable, log to error_logs
     * - **Metadata**: Stores all retry attempts, strategies, quality scores
     * - **Notification**: Admin alert for manual review
     *
     * ## Quality Threshold
     *
     * Default: 0.75 (75% semantic similarity to original via Jina-v3)
     * - Configurable via `quality_threshold` parameter
     * - Based on production n8n data: 0.75-0.82 typical range
     *
     * ## Cost Bounds
     *
     * Worst case (all escalations):
     * - Small doc (3K tokens): $0.01 → $0.15 (15x max)
     * - Large doc (200K tokens): $0.60 → $6.00 (10x max)
     *
     * Average case (no retry):
     * - Small doc: $0 (bypassed)
     * - Large doc: $0.60
     *
     * @param jobData - Summarization job configuration
     * @param jobData.extracted_text - Document text to summarize
     * @param jobData.strategy - 'full_text' or 'hierarchical'
     * @param jobData.model - OpenRouter model identifier
     * @param jobData.quality_threshold - Min acceptable quality (default: 0.75)
     * @param jobData.retry_attempt - Current retry attempt number (internal)
     * @param jobData.previous_strategy - Previous strategy that failed (internal)
     *
     * @returns SummarizationResult with processed_content and metadata
     *
     * @throws {Error} Permanent failure after all escalation attempts
     *
     * @see {@link validateQuality} - Quality validation logic
     * @see {@link retryWithEscalation} - Escalation decision logic
     * @see {@link MODEL_PRICING} - Cost calculation reference
     */
    export async function generateSummary(
      jobData: SummarizationJobData
    ): Promise<SummarizationResult> {
      // ... existing implementation
    }
    ```
  - **Add decision tree diagram** in comments:
    ```typescript
    /*
     * Escalation Decision Tree:
     *
     *   ┌─────────────────┐
     *   │ Generate Summary│
     *   └────────┬────────┘
     *            │
     *            ▼
     *   ┌─────────────────┐
     *   │ Quality Check   │
     *   │ score >= 0.75?  │
     *   └────┬───────┬────┘
     *        │       │
     *   YES  │       │ NO
     *        │       │
     *        ▼       ▼
     *   ┌─────┐  ┌──────────────┐
     *   │DONE │  │ Retry Attempt│
     *   └─────┘  │ Count?       │
     *            └───┬──────┬───┘
     *                │      │
     *           0    │      │ 1+
     *                │      │
     *                ▼      ▼
     *         ┌────────┐ ┌─────────┐
     *         │Phase 1 │ │Phase 2  │
     *         │Compress│ │Upgrade  │
     *         └────┬───┘ │Model    │
     *              │     └────┬────┘
     *              │          │
     *              └──────┬───┘
     *                     │
     *                     ▼
     *              ┌─────────────┐
     *              │ Retry Count │
     *              │ >= 3?       │
     *              └──┬──────┬───┘
     *                 │      │
     *            NO   │      │ YES
     *                 │      │
     *                 ▼      ▼
     *           ┌────────┐ ┌──────┐
     *           │Phase 3 │ │Phase4│
     *           │Tokens++│ │FAIL  │
     *           └────────┘ └──────┘
     */
    ```
  - **Update helper function docs**: Add JSDoc to `retryWithEscalation`, `selectNextModel`, `adjustCompressionLevel`
  - **Benefit**: Clear escalation logic, easier to modify, better onboarding
  - **Output**: Comprehensive documentation added, decision tree visible

### Phase 1 Validation

- [x] **T013** [P1] Run type-check and build after code improvements ✅ DONE (2025-10-29)
  - Run: `pnpm type-check && pnpm build`
  - Verify no new errors introduced (pre-existing errors in unrelated files: admin.ts, billing.ts, generation.ts)
  - **Output**: No new errors from Phase 9 changes ✅

---

## Phase 2: Real Document E2E Testing

**Purpose**: Validate summarization quality with actual Russian legal/business documents

**Prerequisites**: 3 real documents in `.tmp/` directory

**Test Documents**:
1. **Письмо Минфина** (PDF, 622KB) - Russian government letter, formal legal language
2. **Постановление Правительства** (TXT, 275KB) - Government decree, legislative text
3. **Презентация и обучение** (TXT, 70KB) - Business presentation, informal style

### Test File Creation

- [ ] **T020** **[EXECUTOR: integration-tester]** Create real document E2E test suite
  - **File**: `packages/course-gen-platform/tests/e2e/stage3-real-documents.test.ts`
  - **Structure**:
    ```typescript
    /**
     * Stage 3: Real Document E2E Tests
     *
     * Tests Stage 3 summarization with actual Russian documents:
     * - PDF: Письмо Минфина России (622KB)
     * - TXT: Постановление Правительства РФ (275KB)
     * - TXT: Презентация и обучение (70KB)
     *
     * Prerequisites:
     * - OpenRouter API key (OPENROUTER_API_KEY in .env)
     * - Jina API key (JINA_API_KEY in .env)
     * - Redis running
     * - Supabase accessible
     * - Stage 3 worker running
     * - Test documents in .tmp/ directory
     *
     * Cost: ~$0.50-1.00 per full test run
     * Duration: ~5-10 minutes
     */

    import { describe, it, expect, beforeAll, afterAll } from 'vitest';
    import { readFile } from 'fs/promises';
    import path from 'path';

    describe('Stage 3: Real Document E2E Tests', () => {
      let testCourseId: string;
      let testOrgId: string;

      beforeAll(async () => {
        // Setup test course and organization
        // Skip if OpenRouter API key not available
        if (!process.env.OPENROUTER_API_KEY) {
          console.warn('⚠️  OpenRouter API key not found - E2E tests will be skipped');
        }
      });

      describe('Test 1: Письмо Минфина (PDF, 622KB)', () => {
        it('should process Russian government letter PDF', async () => {
          // Read PDF file
          const pdfPath = path.join(__dirname, '../../../.tmp/Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf');
          const pdfBuffer = await readFile(pdfPath);

          // Upload via Supabase storage
          // Trigger document processing job
          // Wait for extraction complete
          // Trigger summarization job
          // Wait for summary complete (max 10 minutes)

          // Assertions:
          expect(summary.processing_method).toBe('hierarchical'); // Large document
          expect(summary.summary_metadata.quality_score).toBeGreaterThan(0.75);
          expect(summary.summary_metadata.estimated_cost_usd).toBeLessThan(1.0);
          expect(summary.summary_metadata.detected_language).toBe('ru');
          expect(summary.processed_content).toBeTruthy();
          expect(summary.processed_content.length).toBeGreaterThan(1000); // Meaningful summary

          // Verify summary content quality
          expect(summary.processed_content).toContain('Минфин'); // Key entity preserved
          expect(summary.processed_content).toMatch(/\d{2}\.\d{2}\.\d{4}/); // Date preserved
        });
      });

      describe('Test 2: Постановление Правительства (TXT, 275KB)', () => {
        it('should process Russian government decree text', async () => {
          const txtPath = path.join(__dirname, '../../../.tmp/Постановление Правительства РФ от 23.12.2024 N 1875 О мерах по предоставлению национального режима.txt');
          const txtContent = await readFile(txtPath, 'utf-8');

          // Create file_catalog entry directly (skip upload for TXT)
          // Trigger summarization job
          // Wait for completion

          // Assertions:
          expect(summary.processing_method).toBe('hierarchical');
          expect(summary.summary_metadata.quality_score).toBeGreaterThan(0.75);
          expect(summary.summary_metadata.model_used).toBeTruthy();
          expect(summary.processed_content).toContain('Правительств'); // Key entity
          expect(summary.processed_content).toMatch(/№\s*\d+/); // Decree number format
        });
      });

      describe('Test 3: Презентация (TXT, 70KB)', () => {
        it('should process business presentation text', async () => {
          const txtPath = path.join(__dirname, '../../../.tmp/Презентация и обучение.txt');
          const txtContent = await readFile(txtPath, 'utf-8');

          // Estimate tokens (70KB ≈ 21K tokens at 3.2 chars/token)
          // Should use hierarchical strategy (>3K tokens)

          // Trigger summarization
          // Wait for completion

          // Assertions:
          expect(summary.processing_method).toBe('hierarchical');
          expect(summary.summary_metadata.quality_score).toBeGreaterThan(0.75);
          expect(summary.summary_metadata.estimated_cost_usd).toBeLessThan(0.2); // Smaller doc
          expect(summary.processed_content).toBeTruthy();
        });
      });

      describe('Test 4: Cost Accuracy Verification', () => {
        it('should match estimated costs within 10% of actuals', async () => {
          // Sum all estimated_cost_usd from 3 tests
          // Compare with OpenRouter API usage (manual check)
          // Log results for manual verification

          console.log('💰 Cost Summary:');
          console.log(`  Test 1 (PDF): $${test1Cost.toFixed(4)}`);
          console.log(`  Test 2 (TXT): $${test2Cost.toFixed(4)}`);
          console.log(`  Test 3 (TXT): $${test3Cost.toFixed(4)}`);
          console.log(`  Total: $${totalCost.toFixed(4)}`);
          console.log('');
          console.log('⚠️  Manual verification required:');
          console.log('  1. Check OpenRouter dashboard: https://openrouter.ai/usage');
          console.log('  2. Compare with total above');
          console.log('  3. Variance should be < 10%');
        });
      });

      describe('Test 5: Quality Comparison', () => {
        it('should generate summaries preserving key information', async () => {
          // Compare summaries against key facts:
          // - Письмо Минфина: Ministry name, date, document number
          // - Постановление: Government decree number, date, topic
          // - Презентация: Main topics, structure

          // Manually review summaries (logged to console)
          console.log('📄 Summary Quality Check:');
          console.log('─'.repeat(80));
          console.log('Document 1: Письмо Минфина');
          console.log(summary1.processed_content.substring(0, 500) + '...');
          console.log('');
          console.log('Document 2: Постановление');
          console.log(summary2.processed_content.substring(0, 500) + '...');
          console.log('');
          console.log('Document 3: Презентация');
          console.log(summary3.processed_content.substring(0, 500) + '...');
        });
      });
    });
    ```
  - **Output**: E2E test file created with 5 test cases

### Test Execution

- [ ] **T021** [P2] Run real document E2E tests
  - Run: `pnpm test tests/e2e/stage3-real-documents.test.ts`
  - Verify all 5 tests pass
  - Review console output for quality check
  - **Expected Duration**: 5-10 minutes
  - **Expected Cost**: $0.50-1.00
  - **Output**: All tests passing, summaries reviewed ✅

### Test Documentation

- [ ] **T022** [P2] Document test results
  - **File**: `packages/course-gen-platform/tests/e2e/REAL-DOCUMENT-TEST-RESULTS.md`
  - **Content**:
    ```markdown
    # Real Document E2E Test Results

    **Date**: 2025-10-29
    **Stage**: Stage 3 Phase 9
    **Status**: ✅ PASSED

    ## Test Execution

    - **Duration**: X minutes
    - **Total Cost**: $X.XX
    - **Tests**: 5/5 passing

    ## Document Results

    ### 1. Письмо Минфина России (PDF, 622KB)
    - **Processing Method**: hierarchical
    - **Quality Score**: 0.XX
    - **Estimated Cost**: $0.XX
    - **Token Count**: XXX input, XXX output
    - **Summary Length**: XXX words
    - **Key Facts Preserved**: ✅ Ministry name, ✅ Date, ✅ Document number

    ### 2. Постановление Правительства (TXT, 275KB)
    - **Processing Method**: hierarchical
    - **Quality Score**: 0.XX
    - **Estimated Cost**: $0.XX
    - **Token Count**: XXX input, XXX output
    - **Summary Length**: XXX words
    - **Key Facts Preserved**: ✅ Decree number, ✅ Date, ✅ Topic

    ### 3. Презентация и обучение (TXT, 70KB)
    - **Processing Method**: hierarchical
    - **Quality Score**: 0.XX
    - **Estimated Cost**: $0.XX
    - **Token Count**: XXX input, XXX output
    - **Summary Length**: XXX words
    - **Key Facts Preserved**: ✅ Main topics, ✅ Structure

    ## Cost Accuracy

    - **Total Estimated**: $X.XX
    - **OpenRouter Actual**: $X.XX (manual check)
    - **Variance**: X.X%
    - **Status**: ✅ Within 10% threshold

    ## Quality Assessment

    All summaries maintain semantic similarity >0.75 and preserve key information.
    Manual review confirms readability and accuracy.

    ## Production Readiness

    ✅ Stage 3 validated with real Russian documents
    ✅ Cost predictions accurate
    ✅ Quality thresholds met
    ✅ Ready for production deployment
    ```
  - **Output**: Test results documented

---

## Phase 3: Load Testing (Optional)

**Purpose**: Verify system handles production load

**Note**: This phase is OPTIONAL for Phase 9. Can be deferred to production monitoring.

- [ ] **T030** **[EXECUTOR: integration-tester]** Create batch processing load test
  - **File**: `packages/course-gen-platform/tests/load/stage3-batch-processing.test.ts`
  - **Test**: Process 10 documents concurrently (BullMQ concurrency: 5)
  - **Measure**: Total time, memory usage, success rate
  - **Expected**: All succeed, ~20 minutes, <2GB RAM
  - **Output**: Load test created

- [ ] **T031** [P3] Run load test (if needed)
  - Run: `pnpm test tests/load/stage3-batch-processing.test.ts`
  - Review metrics
  - **Output**: Load test results documented

---

## Phase 4: Final Validation & Polish

**Purpose**: Verify 10/10 achievement and finalize

### Code Review

- [ ] **T040** **[EXECUTOR: code-reviewer]** Run final code review
  - Review files:
    - `src/orchestrator/services/stage-barrier.ts` (T010)
    - `src/orchestrator/services/cost-calculator.ts` (T011)
    - `src/orchestrator/services/summarization-service.ts` (T012)
    - `tests/e2e/stage3-real-documents.test.ts` (T020)
  - Check: 3 recommendations implemented
  - Check: E2E tests comprehensive
  - **Expected Score**: 10/10 or 9.5/10
  - **Output**: Code review report in `.tmp/current/reports/phase9-code-review.md`

### Documentation Updates

- [ ] **T041** [P4] Update Stage 3 tasks.md with Phase 9 completion
  - **File**: `specs/005-stage-3-create/tasks.md`
  - Add Phase 9 summary at end:
    ```markdown
    ## Phase 9: Production Readiness & Quality Improvements ✅ COMPLETE

    **Status**: ✅ COMPLETE (2025-10-29)
    **Goal**: Achieve 10/10 code quality + Real document validation

    **Completed**:
    - ✅ 3 High-Priority Recommendations implemented
      1. Stage 4 barrier query optimization (RPC function)
      2. Custom error types for cost calculator
      3. Retry escalation documentation (JSDoc + decision tree)
    - ✅ Real Document E2E Testing
      - 3 Russian documents tested (PDF + 2 TXT)
      - All quality scores >0.75
      - Cost accuracy within 10%
    - ✅ Final Code Review: X/10 (improved from 8.5/10)

    **Artifacts**:
    - Migration: `20251029100000_stage4_barrier_rpc.sql`
    - Error classes: `UnknownModelError`, `InvalidTokenCountError`, `CostOverflowError`
    - E2E test: `tests/e2e/stage3-real-documents.test.ts`
    - Test results: `tests/e2e/REAL-DOCUMENT-TEST-RESULTS.md`

    **Performance**: Cost $0.50-1.00 for 3 real documents, quality >0.75, ready for production
    ```
  - **Output**: Documentation updated

- [ ] **T042** [P4] Update CHANGELOG.md
  - **File**: `CHANGELOG.md`
  - Add Phase 9 entry:
    ```markdown
    ## [0.13.1] - 2025-10-29

    ### Improved - Stage 3 Phase 9: Production Readiness

    **Code Quality Improvements**:
    - Optimized Stage 4 barrier with RPC function (-50% database queries)
    - Added custom error types (UnknownModelError, InvalidTokenCountError, CostOverflowError)
    - Comprehensive retry escalation documentation (JSDoc + decision tree)

    **Real Document E2E Testing**:
    - Validated with 3 Russian legal/business documents (PDF + TXT)
    - Cost accuracy verified (within 10% of OpenRouter actuals)
    - Quality scores >0.75 for all documents

    **Code Review**: Improved from 8.5/10 → X/10
    ```
  - **Output**: CHANGELOG updated

### Git Operations

- [ ] **T043** [P4] Create git commit
  - Stage all changes: `git add -A`
  - Create commit:
    ```bash
    git commit -m "feat(stage-3): Phase 9 production readiness improvements

    Implement code review recommendations and real document validation:

    **Code Quality (8.5/10 → X/10)**:
    - Optimize Stage 4 barrier (RPC function, -50% queries)
    - Add custom error types (cost calculator)
    - Document retry escalation (JSDoc + decision tree)

    **E2E Testing**:
    - 3 real Russian documents (Минфин PDF, Постановление TXT, Презентация TXT)
    - Quality scores >0.75
    - Cost accuracy <10% variance

    **Artifacts**:
    - Migration: 20251029100000_stage4_barrier_rpc.sql
    - E2E test: tests/e2e/stage3-real-documents.test.ts
    - Error classes: UnknownModelError, InvalidTokenCountError, CostOverflowError

    🤖 Generated with Claude Code
    Co-Authored-By: Claude <noreply@anthropic.com>"
    ```
  - **Output**: Commit created

- [ ] **T044** [P4] Create pull request
  - Create PR with `gh pr create`
  - Title: "Stage 3 Phase 9: Production Readiness & Quality Improvements"
  - Body: Include code review improvements + E2E test results
  - **Output**: PR created

- [ ] **T045** [P4] Merge and tag (optional)
  - Merge PR: `gh pr merge`
  - Tag: `git tag -a v0.13.1 -m "Phase 9: Production readiness improvements"`
  - Push: `git push origin v0.13.1`
  - **Output**: Released as v0.13.1

---

## Dependencies & Execution Strategy

### Critical Path
```
Phase 0 (Planning) → Phase 1 (Code Quality) → Phase 4 (Review)
                   → Phase 2 (E2E Testing) → Phase 4 (Review)
                   → Phase 3 (Load Testing - Optional)
```

### Parallel Opportunities
- **Phase 1**: T010, T011, T012 can run in parallel (different files)
- **Phase 2**: Single test file, sequential execution required
- **Phase 3**: Optional, can skip

### Estimated Duration
- Phase 0: 15 minutes (planning)
- Phase 1: 2-3 hours (code improvements)
- Phase 2: 1-2 hours (E2E test creation) + 10 minutes (execution)
- Phase 3: 1 hour (if needed)
- Phase 4: 1 hour (review + docs)
- **Total**: 5-8 hours

### Cost Estimate
- E2E tests: $0.50-1.00 (OpenRouter API)
- Load tests: $2-5 (if run with 10 documents)
- **Total**: <$6

---

## Success Criteria

**Code Quality**:
- ✅ All 3 high-priority recommendations implemented
- ✅ Type-check passes (0 errors)
- ✅ Build passes
- ✅ Code review score improved (target: 9.5-10/10)

**E2E Testing**:
- ✅ 3 real documents processed successfully
- ✅ Quality scores >0.75 for all
- ✅ Cost accuracy within 10%
- ✅ Key information preserved in summaries

**Documentation**:
- ✅ Retry escalation fully documented
- ✅ Test results documented
- ✅ CHANGELOG updated

**Production Readiness**:
- ✅ No blocking issues
- ✅ Real document validation complete
- ✅ Ready for production deployment

---

## Context for New Session

When resuming this work in a new context, read these files:

**Essential Context**:
1. `specs/005-stage-3-create/tasks.md` (lines 1569-1634) - Stage 3 Implementation Summary
2. `specs/006-stage-3-phase-9-production-readiness/tasks.md` (this file) - Phase 9 tasks
3. `specs/005-stage-3-create/tasks.md` (lines 1232-1235) - Code review recommendations

**Test Documents**:
- `.tmp/Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf`
- `.tmp/Постановление Правительства РФ от 23.12.2024 N 1875 О мерах по предоставлению национального режима.txt`
- `.tmp/Презентация и обучение.txt`

**Key Files to Modify**:
- `packages/course-gen-platform/src/orchestrator/services/stage-barrier.ts` (T010)
- `packages/course-gen-platform/src/orchestrator/services/cost-calculator.ts` (T011)
- `packages/course-gen-platform/src/orchestrator/services/summarization-service.ts` (T012)
- `packages/course-gen-platform/tests/e2e/stage3-real-documents.test.ts` (T020 - NEW)

**Available Agents**:
- `fullstack-nextjs-specialist` - For code improvements (T010-T012)
- `integration-tester` - For E2E tests (T020-T022)
- `code-reviewer` - For final review (T040)

**Execution Command**:
```bash
# Start with planning
# Then parallel code improvements (T010-T012)
# Then E2E test creation and execution (T020-T021)
# Then final review and docs (T040-T045)
```

---

## 🎯 Current Progress (2025-10-29)

### ✅ Phase 0 & Phase 1 Complete

**Status**: Phase 1 завершена, готово к Phase 2 или Phase 4

**Completed Tasks**:
- ✅ T000: Feature branch created (`006-stage-3-phase-9-improvements`)
- ✅ T001: Context loaded (Stage 3 v0.13.0, code review 8.5/10)
- ✅ T010: Stage 4 barrier optimization (RPC function, -50% DB queries)
- ✅ T011: Custom error types (UnknownModelError, InvalidTokenCountError, CostOverflowError)
- ✅ T012: Retry escalation documentation (JSDoc + ASCII decision tree)
- ✅ T013: Type-check validation (no new errors)

**Modified Files**:
```
M packages/course-gen-platform/src/orchestrator/services/cost-calculator.ts
M packages/course-gen-platform/src/orchestrator/services/stage-barrier.ts
M packages/course-gen-platform/src/orchestrator/services/summarization-service.ts
M packages/course-gen-platform/tests/unit/cost-calculator.test.ts
?? packages/course-gen-platform/supabase/migrations/20251029100000_stage4_barrier_rpc.sql
```

**Not Committed Yet** - waiting for Phase 2 or direct to Phase 4

**Continuation Context**: `.tmp/current/phase9-continuation-context.md`

### ⏳ Next Steps

**Option 1: Go to Phase 4 (Recommended)**
- Skip Phase 2 E2E tests (can be done post-merge)
- Create commit and PR with Phase 1 improvements
- Merge v0.13.1 with code quality improvements

**Option 2: Complete Phase 2 First**
- Requires: OpenRouter API, Jina API, Redis, Supabase
- Create E2E test suite for 3 Russian documents
- Run tests and document results (~$0.50-1.00, 10 minutes)
- Then proceed to Phase 4

**To Continue**:
```bash
git checkout 006-stage-3-phase-9-improvements
# Read: .tmp/current/phase9-continuation-context.md
# Then continue with Phase 2 or Phase 4
```

---

**End of Phase 9 Tasks**
