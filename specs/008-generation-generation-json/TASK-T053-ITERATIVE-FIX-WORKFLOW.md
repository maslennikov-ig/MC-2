# T053 E2E Test Fix Workflow

**Created**: 2025-11-17
**Source**: [T053 E2E Test Report](../../docs/investigations/T053-E2E-TEST-REPORT-2025-11-17.md)
**Priority**: CRITICAL
**Execution Model**: Phased (sequential phases with parallel tasks within phases)

---

## Executive Summary

**Main Issue**: Stage 5 section generation fails after exhausting all 5 regeneration layers (auto-repair + critique-revise). Quality validation fails → no sections → no lessons → test FAILED.

**Root Causes**:
1. Qwen3-235b model produces invalid JSON that cannot be repaired
2. Missing Zod schema in system messages across all generators
3. Status transition logic errors create log noise
4. System metrics schema mismatch causes logging failures

**Fix Strategy**:
- Phase 1: Investigation & Direct Testing (parallel)
- Phase 2: Prompt Engineering Improvements (parallel)
- Phase 3: Architecture Fixes (sequential)
- Phase 4: Validation & Integration

---

## Phase 1: Investigation & Root Cause Analysis

**Execution**: All tasks in parallel
**Duration Estimate**: 30-45 min

### Task 1.1: Qwen3-235b Direct Testing - Section Generation

**Executor**: `test-writer` agent
**Priority**: P0 (CRITICAL)
**Depends On**: None
**Can Run In Parallel**: Yes

**Objective**: Isolate section generation failure by testing Qwen3-235b directly without full E2E pipeline.

**Pre-Task Investigation**:
- Search codebase for existing model testing patterns: `**/*.test.ts` with "direct" or "isolated"
- Check `docs/investigations/` for previous model quality issues
- Review `packages/course-gen-platform/src/services/stage5/` for section-batch-generator implementation

**Implementation Steps**:
1. Create unit test: `tests/unit/stage5/qwen3-section-generation.test.ts`
2. Extract exact prompt from failed T053 run (course ID: `6841dba7-cd01-4f1d-ad2e-f48ae4fdae7a`)
3. Test scenarios:
   - Baseline: Generate 1 section with current prompt
   - Control: Same prompt with `gpt-oss-120b` model
   - Variation: Simplified Russian prompt
   - Variation: Prompt with explicit Zod schema in system message
4. Capture outputs: raw JSON, parse errors, quality scores
5. Create comparison report: `docs/investigations/INV-2025-11-17-007-qwen3-section-quality.md`

**Success Criteria**:
- Identify if issue is model-specific or prompt-specific
- Document quality score differences between models
- Provide actionable recommendations for prompt improvements

**Artifacts**:
- Test file: `tests/unit/stage5/qwen3-section-generation.test.ts`
- Investigation report with A/B comparison tables

---

### Task 1.2: Status Transition Investigation

**Executor**: `problem-investigator` agent
**Priority**: P1 (HIGH)
**Depends On**: None
**Can Run In Parallel**: Yes

**Objective**: Understand current state machine implementation and identify why invalid transitions occur.

**Pre-Task Investigation**:
- Search for existing FSM/state machine implementations: `packages/course-gen-platform/src/**/*state*.ts`
- Check ADRs for status transition design decisions
- Review `job_status` table schema in Supabase migrations
- Search previous investigations for "status" or "transition"

**Implementation Steps**:
1. Map current state machine:
   - Document all states in `generation_status` enum
   - Create state transition diagram (Mermaid format)
   - Identify allowed transitions
2. Analyze error logs from T053:
   - Extract all "Invalid generation status transition" errors
   - Identify which transitions are being rejected
   - Determine if rejections are correct or false positives
3. Review test implementation:
   - Check if E2E test properly handles async state changes
   - Verify test doesn't race with state updates
4. Create investigation report: `docs/investigations/INV-2025-11-17-008-status-transitions.md`

**Success Criteria**:
- Complete state transition diagram
- Clear documentation of which transitions are invalid and why
- Recommendations for refactoring state machine
- Identification of test-specific vs production issues

**Artifacts**:
- State diagram: include in investigation report
- Investigation report with transition matrix
- List of required code changes

---

### Task 1.3: System Metrics Schema Investigation

**Executor**: `problem-investigator` agent
**Priority**: P2 (MEDIUM)
**Depends On**: None
**Can Run In Parallel**: Yes

**Objective**: Fix schema mismatch between code and database for system_metrics table.

**Pre-Task Investigation**:
- Find system_metrics table definition: `packages/course-gen-platform/supabase/migrations/**/*.sql`
- Search for system_metrics usage in code: `packages/course-gen-platform/src/**/*.ts`
- Check if similar schema issues exist in other tables
- Review previous migrations for metrics-related changes

**Implementation Steps**:
1. Document current schema:
   - Read latest migration with system_metrics
   - Document expected columns in code
   - Identify mismatches
2. Determine fix approach:
   - Option A: Update code to match database schema
   - Option B: Create migration to update database schema
   - Option C: Both (if schema was wrong from start)
3. Check impact:
   - Grep all usages of system_metrics inserts
   - Verify if metrics are critical or nice-to-have
4. Create investigation report: `docs/investigations/INV-2025-11-17-009-system-metrics-schema.md`

**Success Criteria**:
- Clear identification of schema mismatch
- Decision on fix approach with justification
- No breaking changes to existing metrics data

**Artifacts**:
- Investigation report
- Proposed migration SQL (if needed)

---

### Task 1.4: Historical Problem Search

**Executor**: `general-purpose` agent (Explore subagent)
**Priority**: P2 (MEDIUM)
**Depends On**: None
**Can Run In Parallel**: Yes

**Objective**: Search for previous similar issues across codebase and documentation.

**Pre-Task Investigation**:
- Not applicable (this IS the investigation task)

**Implementation Steps**:
1. Search investigations directory:
   - Pattern: "generation fail", "JSON repair", "quality validation"
   - Focus: Last 6 months of investigation reports
2. Search git history:
   - Pattern: commits with "fix generation", "repair JSON", "qwen"
   - Check if similar issues were fixed before and regressed
3. Search ADRs and design docs:
   - Pattern: decisions about model selection, quality gates
   - Check if current behavior matches intended design
4. Compile findings: `docs/investigations/INV-2025-11-17-010-historical-context.md`

**Success Criteria**:
- Comprehensive list of related past issues
- Identification of regression patterns
- Lessons learned from previous fixes

**Artifacts**:
- Historical context report

---

## Phase 2: Prompt Engineering & Schema Improvements

**Execution**: All tasks in parallel (after Phase 1 completes)
**Duration Estimate**: 45-60 min
**Depends On**: Phase 1 completion (need investigation results)

### Task 2.1: Add Zod Schema to All Generator Prompts

**Executor**: `llm-service-specialist` agent
**Priority**: P0 (CRITICAL)
**Depends On**: Task 1.1 (need to understand current prompt structure)
**Can Run In Parallel**: Yes (with other Phase 2 tasks)

**Objective**: Systematically add Zod schema descriptions to system messages across all JSON generators.

**Pre-Task Investigation**:
- Review findings from Task 1.1 (qwen3 direct testing)
- Search for existing schema-in-prompt patterns: grep "Zod" in prompts
- Check if any generators already use schema in system message
- Review OpenRouter model capabilities for schema following

**Implementation Steps**:
1. Create utility function: `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`
   - Input: Zod schema object
   - Output: Human-readable schema description for LLM
   - Format: JSON Schema-like but optimized for token efficiency
2. Update Stage 4 generators (5 phases):
   - `src/orchestrator/services/analysis/phase-1-init.ts`
   - `src/orchestrator/services/analysis/phase-2-classification.ts`
   - `src/orchestrator/services/analysis/phase-3-scope.ts`
   - `src/orchestrator/services/analysis/phase-4-expert.ts`
   - `src/orchestrator/services/analysis/phase-5-assembly.ts`
3. Update Stage 5 generators (3 components):
   - `src/services/stage5/metadata-generator.ts`
   - `src/services/stage5/section-batch-generator.ts`
   - `src/services/stage5/lesson-generator.ts`
4. Add schema to system message template:
   ```
   You must respond with valid JSON matching this exact schema:
   {schema_description}

   Critical requirements:
   - All required fields must be present
   - Types must match exactly
   - Arrays must contain valid items
   - No additional properties unless specified
   ```

**Success Criteria**:
- All 8 generators include Zod schema in system message
- Schema descriptions are accurate and token-efficient
- No increase in prompt size beyond 10%
- Schemas match actual Zod validators

**Artifacts**:
- Utility: `zod-to-prompt-schema.ts`
- Updated generator files (8 files)

---

### Task 2.2: Optimize Section Generation Prompt

**Executor**: `llm-service-specialist` agent
**Priority**: P0 (CRITICAL)
**Depends On**: Task 1.1 (need A/B test results)
**Can Run In Parallel**: Yes (with other Phase 2 tasks)

**Objective**: Improve section-batch-generator prompt based on direct testing insights.

**Pre-Task Investigation**:
- Review Task 1.1 results (model comparison)
- Check current prompt structure in `src/services/stage5/section-batch-generator.ts`
- Search for Russian language prompt optimization techniques
- Review OpenRouter docs for qwen3-235b best practices

**Implementation Steps**:
1. Analyze Task 1.1 findings:
   - Identify what worked with gpt-oss-120b but failed with qwen3-235b
   - Extract successful prompt patterns
2. Apply prompt improvements:
   - Add explicit JSON formatting instructions
   - Include minimal valid example (only structure, not content)
   - Emphasize critical fields (title, description, objectives)
   - Add Russian-specific clarifications if needed
3. Test variations:
   - Run direct tests with improved prompts
   - Compare quality scores
   - Measure JSON repair success rates
4. Select best-performing prompt variant

**Success Criteria**:
- Section generation success rate > 90% in direct tests
- Quality score average > 0.80
- Reduced need for critique-revise layer

**Artifacts**:
- Updated `section-batch-generator.ts`
- Test results comparison table

---

### Task 2.3: Add Minimal JSON Example to Critical Prompts

**Executor**: `llm-service-specialist` agent
**Priority**: P1 (HIGH)
**Depends On**: Task 2.1 (schema addition)
**Can Run In Parallel**: Yes (with other Phase 2 tasks)

**Objective**: Add ultra-minimal JSON structure examples to reduce parsing failures.

**Pre-Task Investigation**:
- Review current prompt token usage
- Calculate token budget remaining per generator
- Search for existing examples in prompts
- Review best practices for few-shot prompting with JSON

**Implementation Steps**:
1. Design minimal examples (structure only):
   ```json
   Example structure (replace with your content):
   {
     "title": "string",
     "items": [{"field": "value"}]
   }
   ```
2. Add to high-failure generators only:
   - `section-batch-generator.ts` (P0)
   - `phase-2-classification.ts` (P1 - had issues in T053)
3. Keep examples < 100 tokens each
4. Place after schema, before instructions

**Success Criteria**:
- Examples are syntactically minimal
- Total token increase < 5% per prompt
- Examples don't bias content generation

**Artifacts**:
- Updated generator prompts (2 files)

---

## Phase 3: Architecture & State Management Fixes

**Execution**: Sequential (each task depends on previous)
**Duration Estimate**: 60-90 min
**Depends On**: Phase 1 and Phase 2 completion

### Task 3.1: Design State Machine Refactoring

**Executor**: `database-architect` agent
**Priority**: P1 (HIGH)
**Depends On**: Task 1.2 (status investigation results)
**Can Run In Parallel**: No (blocks Task 3.2)

**Objective**: Design comprehensive state machine refactoring based on investigation findings.

**Pre-Task Investigation**:
- Review Task 1.2 investigation report
- Study BullMQ state management best practices
- Check Supabase RLS policies for job_status table
- Review event-driven architecture patterns for job orchestration

**Implementation Steps**:
1. Design state machine:
   - Define all valid states (enum)
   - Define all valid transitions (adjacency matrix)
   - Define transition triggers (events)
   - Define transition validators (pre-conditions)
2. Design implementation:
   - Create FSM utility: `src/utils/state-machine.ts`
   - Create state validators per stage
   - Design transition logging
   - Design rollback strategy for failed transitions
3. Plan migration:
   - Database changes needed (if any)
   - Code migration strategy
   - Backwards compatibility approach
4. Document design: `specs/008-generation-generation-json/STATE-MACHINE-REFACTOR.md`

**Success Criteria**:
- Complete state transition diagram
- Implementation plan with file structure
- Migration strategy with rollback plan
- No breaking changes to existing jobs

**Artifacts**:
- Design document
- State machine diagram (Mermaid)

---

### Task 3.2: Implement State Machine Refactoring

**Executor**: `fullstack-nextjs-specialist` agent
**Priority**: P1 (HIGH)
**Depends On**: Task 3.1 (design)
**Can Run In Parallel**: No (blocks Task 3.3)

**Objective**: Implement state machine refactoring according to design.

**Pre-Task Investigation**:
- Review Task 3.1 design document
- Check for existing state machine libraries in dependencies
- Review similar FSM implementations in codebase

**Implementation Steps**:
1. Implement core FSM utility:
   - `src/utils/state-machine.ts` (generic FSM)
   - `src/types/job-state-machine.ts` (job-specific FSM)
2. Update job orchestration:
   - `src/orchestrator/handlers/stage4-analysis.ts`
   - `src/orchestrator/handlers/stage5-generation.ts`
   - All transition calls use FSM validator
3. Add transition logging:
   - Log all state changes with timestamps
   - Log rejected transitions with reason
4. Create database migration (if needed):
   - `supabase/migrations/YYYYMMDDHHMMSS_refactor_job_status_fsm.sql`
5. Run type-check and build

**Success Criteria**:
- All status transitions go through FSM validator
- Invalid transitions are rejected with clear errors
- All existing tests pass
- Type-check passes

**Artifacts**:
- FSM utility files (2 files)
- Updated orchestration handlers (2+ files)
- Migration file (if needed)

---

### Task 3.3: Update E2E Test for Proper State Handling

**Executor**: `test-writer` agent
**Priority**: P1 (HIGH)
**Depends On**: Task 3.2 (implementation)
**Can Run In Parallel**: No (needs FSM implementation)

**Objective**: Update T053 E2E test to properly handle async state transitions.

**Pre-Task Investigation**:
- Review current test implementation: `tests/e2e/t053-synergy-sales-course.test.ts`
- Review BullMQ event polling patterns
- Check other E2E tests for state handling patterns

**Implementation Steps**:
1. Add state polling utility:
   - Poll `job_status` table instead of assuming immediate state
   - Add timeout and retry logic
   - Add state history validation
2. Update test assertions:
   - Wait for state transitions before proceeding
   - Validate state transition sequence
   - Add error state detection
3. Add transition logging in test:
   - Log all observed state changes
   - Log timing between transitions
4. Run test multiple times to verify stability

**Success Criteria**:
- No "Invalid generation status transition" errors in logs
- Test properly waits for async state changes
- Test fails fast on unexpected states
- Test logs provide clear state transition timeline

**Artifacts**:
- Updated test file
- State polling utility (reusable)

---

### Task 3.4: Fix System Metrics Schema

**Executor**: `database-architect` agent
**Priority**: P2 (MEDIUM)
**Depends On**: Task 1.3 (investigation)
**Can Run In Parallel**: Yes (independent of state machine work)

**Objective**: Resolve system_metrics table schema mismatch.

**Pre-Task Investigation**:
- Review Task 1.3 investigation report
- Check system_metrics table current schema
- Review all code insertions to system_metrics

**Implementation Steps**:
1. Create fix based on Task 1.3 recommendation:
   - Option A: Update code (if database is correct)
   - Option B: Create migration (if database is wrong)
2. If migration needed:
   - Create: `supabase/migrations/YYYYMMDDHHMMSS_fix_system_metrics_schema.sql`
   - Test migration rollback
3. Update all insert statements:
   - Search: `INSERT INTO system_metrics`
   - Update column names/types to match schema
4. Run type-check

**Success Criteria**:
- No more system_metrics schema errors in logs
- All metrics inserts succeed
- Migration is backwards compatible (if applicable)

**Artifacts**:
- Migration file (if needed)
- Updated code files with corrected inserts

---

## Phase 4: Validation & Integration

**Execution**: Sequential
**Duration Estimate**: 30-45 min
**Depends On**: Phase 3 completion

### Task 4.1: Run Full E2E Test with All Fixes

**Executor**: MAIN (direct execution)
**Priority**: P0 (CRITICAL)
**Depends On**: All Phase 2 and Phase 3 tasks
**Can Run In Parallel**: No

**Objective**: Validate all fixes together in full E2E test.

**Pre-Task Investigation**:
- Review all changes from Phase 2 and Phase 3
- Clean test environment (Redis + Supabase)

**Implementation Steps**:
1. Clean test environment:
   - Clear Redis BullMQ keys
   - Delete test courses from Supabase
2. Run T053 E2E test:
   - Monitor all stages
   - Capture full logs
   - Monitor state transitions
3. Verify results:
   - Stage 2: Document processing SUCCESS
   - Stage 4: Analysis SUCCESS (all 5 phases)
   - Stage 5: Generation SUCCESS (metadata + sections + lessons)
4. Check for regressions:
   - No invalid state transition errors
   - No system_metrics errors
   - Quality scores within acceptable range

**Success Criteria**:
- E2E test PASSES (all stages succeed)
- No errors in logs
- Generated course structure is valid
- Total test time < 15 minutes

**Artifacts**:
- Test execution logs
- Generated course JSON (saved for validation)

---

### Task 4.2: Create Validation Report

**Executor**: MAIN (direct execution)
**Priority**: P1 (HIGH)
**Depends On**: Task 4.1
**Can Run In Parallel**: No

**Objective**: Document validation results and create final report.

**Implementation Steps**:
1. Compile test results:
   - All stage timings
   - All quality scores
   - All errors (should be zero)
   - Model performance comparison
2. Compare with baseline (original T053 failure):
   - Improvement metrics
   - Regression checks
3. Create report: `docs/investigations/T053-FIX-VALIDATION-2025-11-17.md`
4. Update tasks.md:
   - Mark T053 fix tasks as completed
   - Add artifacts links

**Success Criteria**:
- Comprehensive validation report
- Clear before/after comparison
- All improvements documented

**Artifacts**:
- Validation report

---

### Task 4.3: Type Check & Build Validation

**Executor**: MAIN (direct execution)
**Priority**: P0 (CRITICAL)
**Depends On**: Task 4.1
**Can Run In Parallel**: Yes (with Task 4.2)

**Objective**: Ensure all code changes pass type-check and build.

**Implementation Steps**:
1. Run type-check:
   ```bash
   pnpm type-check:course-gen-platform
   pnpm type-check:shared-types
   ```
2. Run build:
   ```bash
   pnpm --filter course-gen-platform build
   ```
3. Fix any errors if found

**Success Criteria**:
- Zero TypeScript errors
- Build succeeds
- No new warnings introduced

**Artifacts**:
- Clean type-check output
- Successful build output

---

## Execution Summary

### Parallelization Strategy

**Phase 1 (ALL PARALLEL)**:
- Launch all 4 investigation tasks in single message
- Total duration: ~45 min (longest task)

**Phase 2 (ALL PARALLEL after Phase 1)**:
- Launch all 3 prompt improvement tasks in single message
- Total duration: ~60 min (longest task)

**Phase 3 (SEQUENTIAL)**:
- Task 3.1 (Design) → Task 3.2 (Implement) → Task 3.3 (Test update)
- Task 3.4 runs in parallel with 3.1-3.3 (independent)
- Total duration: ~90 min

**Phase 4 (SEQUENTIAL)**:
- Task 4.1 → Task 4.2 (sequential)
- Task 4.3 parallel with 4.2
- Total duration: ~30 min

**Total Estimated Duration**: ~3.5 hours (with parallelization)

### Agent Assignment Summary

| Agent Type | Tasks | Parallel |
|------------|-------|----------|
| `test-writer` | 1.1, 3.3 | No (sequential phases) |
| `problem-investigator` | 1.2, 1.3 | Yes (Phase 1) |
| `general-purpose` | 1.4 | Yes (Phase 1) |
| `llm-service-specialist` | 2.1, 2.2, 2.3 | Yes (Phase 2) |
| `database-architect` | 3.1, 3.4 | 3.4 parallel with Phase 3 |
| `fullstack-nextjs-specialist` | 3.2 | No (sequential in Phase 3) |
| MAIN | 4.1, 4.2, 4.3 | 4.3 parallel with 4.2 |

### Pre-Task Investigation Checklist

Before EACH task, assigned agent must:
1. ✅ Search `docs/investigations/` for similar past issues
2. ✅ Grep codebase for related patterns
3. ✅ Review relevant documentation (ADRs, specs, design docs)
4. ✅ Check git history for related commits
5. ✅ Document findings in task execution notes

---

## Success Metrics

**Primary Goal**: T053 E2E test PASSES with no errors

**Secondary Goals**:
- Section generation success rate > 95%
- No invalid state transition errors
- No system_metrics schema errors
- Quality scores consistently > 0.80
- Total test execution time < 15 min

**Quality Gates**:
- Type-check MUST pass before any commit
- Build MUST pass before any commit
- All modified files must have corresponding tests

---

## Rollback Strategy

If any phase fails critically:

1. **Phase 1 Failure**: Continue with partial investigation results
2. **Phase 2 Failure**: Rollback prompt changes, investigate model compatibility
3. **Phase 3 Failure**: Rollback state machine changes via git, use migration rollback
4. **Phase 4 Failure**: Full rollback of all changes, create incident report

---

## Notes

- All investigation reports go to `docs/investigations/`
- All code changes must include inline comments referencing this workflow
- Commit after each phase completion using `/push patch`
- Update this file with actual results as phases complete
