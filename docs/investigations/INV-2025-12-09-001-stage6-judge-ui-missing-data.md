---
investigation_id: INV-2025-12-09-001
topic: Stage 6 Judge UI Missing Heuristic and Vote Data
status: completed
investigator: Claude Code
timestamp: 2025-12-09T00:00:00Z
related_files:
  - packages/web/components/generation-graph/hooks/useLessonInspectorData.ts
  - packages/web/components/generation-graph/components/JudgeVotingPanel.tsx
  - packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts
---

# Investigation Report: Stage 6 Judge UI Missing Data

## Executive Summary

**Problem**: Stage 6 judge is executing correctly (cascade evaluation, retries work), but the UI doesn't show critical information:
1. Which judges voted
2. Why the verdict was "REGENERATE"
3. Heuristic failure reasons (e.g., "Examples count (0) below minimum (1)")
4. Individual judge votes (if cascade went to single_judge or CLEV stage)
5. Retry count and regeneration status

**Root Cause**: The judge orchestrator saves minimal data to `generation_trace.output_data` (only `finalRecommendation`, `qualityScore`, `needsRegeneration`, `needsHumanReview`, `cascadeStage`), but the UI expects detailed cascade evaluation results including heuristic failures, individual votes, and consensus metadata.

**Recommended Solution**: Enrich the `judge_complete` trace output with full cascade evaluation details from `CascadeResult` and decision context.

**Key Findings**:
- Database currently stores only high-level judge decision (see database query results below)
- UI parsing code expects rich `JudgeVerdictDisplay` structure with votes, heuristics, highlighted sections
- Gap exists between what cascade evaluator produces and what gets saved to database
- Regeneration happens but user has no visibility into why

---

## Problem Statement

### Observed Behavior

The Stage 6 judge runs successfully:
- Heuristic filters execute and detect failures (e.g., missing examples)
- Cascade evaluation stops at heuristic stage when failures detected
- Judge recommendation is correctly set to "REGENERATE"
- Retry mechanism triggers regeneration

However, the UI shows no information about:
- **Why regeneration was recommended** (which heuristics failed)
- **Which judges voted** (if cascade proceeded to single_judge or CLEV)
- **Individual judge scores and reasoning**
- **Retry count** (how many regeneration attempts)
- **Highlighted sections** (specific content issues)

### Expected Behavior

The UI should display:
1. **Heuristic failure reasons** in an alert box (e.g., "Examples count (0) below minimum (1)")
2. **Individual judge cards** showing model, score, verdict, criteria breakdown (if judges ran)
3. **Consensus method** (unanimous, majority, tie-breaker) and final verdict badge
4. **Highlighted sections** with severity indicators for content issues
5. **Retry count** showing regeneration attempts
6. **Cascade stage** indicator (heuristic, single_judge, CLEV)

### Impact

- Users cannot understand why content was rejected
- No transparency into quality evaluation process
- Difficult to debug generation issues
- Lost educational value of showing judge reasoning

### Environment

- **Component**: Stage 6 Lesson Content Pipeline
- **Affected UI**: LessonInspector > JudgeVotingPanel
- **Backend**: Stage 6 Orchestrator > Judge Node
- **Database**: `generation_trace` table with `judge_complete` records

---

## Investigation Process

### Hypotheses Tested

1. **Hypothesis**: Database stores complete cascade data but UI parsing is broken
   - **Result**: ❌ FALSE - Database only stores minimal fields
   - **Evidence**: Query shows `output_data` contains only 5 fields

2. **Hypothesis**: Cascade evaluator doesn't produce detailed results
   - **Result**: ❌ FALSE - Cascade evaluator produces rich `CascadeResult` with all needed data
   - **Evidence**: `HeuristicResults` interface contains `failureReasons`, counts, coverage

3. **Hypothesis**: Judge orchestrator doesn't save full cascade results
   - **Result**: ✅ TRUE - This is the root cause
   - **Evidence**: Lines 476-485 in orchestrator.ts show minimal `outputData`

### Files Examined

1. **useLessonInspectorData.ts** (lines 383-475)
   - Parses judge data from `generation_trace.output_data`
   - Expects `votes`, `consensus_method`, `heuristics_issues` fields
   - Currently receives none of these fields

2. **JudgeVotingPanel.tsx** (lines 1-393)
   - Displays individual judge cards with scores, verdicts, criteria
   - Shows heuristics warning box (lines 294-310)
   - Shows highlighted sections (lines 313-357)
   - All features inactive due to missing data

3. **orchestrator.ts** (lines 467-485)
   - Judge node completion trace logging
   - Currently saves only:
     ```typescript
     outputData: {
       finalRecommendation,
       qualityScore: finalScore,
       needsRegeneration,
       needsHumanReview,
       cascadeStage: cascadeResult.stage,
     }
     ```

4. **cascade-evaluator.ts** (lines 100-550)
   - Produces `HeuristicResults` with:
     - `failureReasons: string[]` ← **MISSING from trace**
     - `wordCount`, `fleschKincaid`, `keywordCoverage`
     - `examplesCount`, `exercisesCount` ← **Counts missing from trace**
     - `sectionsPresent`, `missingSections`
   - Produces `CascadeResult` with:
     - `heuristicResults?: HeuristicResults` ← **MISSING from trace**
     - `singleJudgeVerdict?: JudgeVerdict` ← **MISSING from trace**
     - `clevResult?: JudgeAggregatedResult` ← **MISSING from trace**

### Commands Executed

**Database query to inspect judge_complete traces**:
```sql
SELECT
  id, lesson_id, step_name, phase,
  output_data, error_data, retry_attempt, created_at
FROM generation_trace
WHERE
  phase = 'judge'
  AND step_name LIKE '%judge%'
  AND stage = 'stage_6'
ORDER BY created_at DESC
LIMIT 5;
```

**Result** (truncated):
```json
{
  "id": "120f071b-72ae-4776-af81-eb5b3ca88bd9",
  "step_name": "judge_complete",
  "phase": "judge",
  "output_data": {
    "cascadeStage": "heuristic",
    "qualityScore": 0,
    "needsHumanReview": false,
    "needsRegeneration": true,
    "finalRecommendation": "REGENERATE"
  },
  "retry_attempt": 0
}
```

**Missing from output_data**:
- `heuristicResults.failureReasons` (e.g., "Examples count (0) below minimum (1)")
- `votes` array (individual judge verdicts)
- `consensus_method` (unanimous, majority, tie_breaker)
- `heuristics_passed` boolean
- `highlighted_sections` array

---

## Root Cause Analysis

### Primary Root Cause

**Location**: `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts` (lines 467-485)

**Mechanism of Failure**:

The judge node receives complete `CascadeResult` from `executeCascadeEvaluation()`, which contains:
- `heuristicResults.failureReasons` (array of human-readable failure messages)
- `singleJudgeVerdict` (if cascade reached single judge stage)
- `clevResult.verdicts` (array of individual judge votes if CLEV ran)
- `clevResult.consensusMethod` (voting method used)

However, when logging the completion trace (lines 467-485), the orchestrator only extracts 5 top-level fields:

```typescript
await logTrace({
  // ... other fields
  outputData: {
    finalRecommendation,           // ✅ Saved
    qualityScore: finalScore,      // ✅ Saved
    needsRegeneration,             // ✅ Saved
    needsHumanReview,              // ✅ Saved
    cascadeStage: cascadeResult.stage,  // ✅ Saved (but not enough detail)
    // ❌ MISSING: cascadeResult.heuristicResults
    // ❌ MISSING: cascadeResult.singleJudgeVerdict
    // ❌ MISSING: cascadeResult.clevResult
    // ❌ MISSING: decision context (issues, affected percentage)
  },
});
```

**Why This Causes the Problem**:

The UI hook `useLessonInspectorData.ts` (function `parseJudgeResult`, lines 383-427) expects the following structure in `output_data`:

```typescript
interface ExpectedOutputData {
  votes?: Array<{
    judge_id: string;
    model_id: string;
    verdict: JudgeVerdictType;
    score: number;
    coherence: number;
    accuracy: number;
    // ... other criteria
  }>;
  consensus_method?: ConsensusMethod;
  final_verdict?: JudgeVerdictType;
  heuristics_passed?: boolean;
  heuristics_issues?: string[];  // ← UI expects this!
  highlighted_sections?: Array<{
    section_index: number;
    section_title: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}
```

Currently, **none of these fields are saved**, so the UI cannot display:
1. Heuristic failure reasons (no `heuristics_issues` array)
2. Individual judge votes (no `votes` array)
3. Consensus method (no `consensus_method` field)
4. Content issues (no `highlighted_sections` array)

### Contributing Factors

1. **Data transformation gap**: The `CascadeResult` type is internal to the backend, but needs to be transformed to match UI expectations
2. **Incomplete trace schema**: The `generation_trace.output_data` JSONB column has no enforced schema
3. **No validation**: No tests verify that saved trace data matches UI expectations

### Evidence Supporting Root Cause

**Evidence 1**: Cascade evaluator produces `failureReasons`
```typescript
// cascade-evaluator.ts, lines 457-524
const failureReasons: string[] = [];

if (wordCount < thresholds.minWordCount) {
  failureReasons.push(
    `Word count (${wordCount}) below minimum (${thresholds.minWordCount})`
  );
}

if (examplesCount < thresholds.minExamples) {
  failureReasons.push(
    `Examples count (${examplesCount}) below minimum (${thresholds.minExamples})`
  );
}

// ... more checks

return {
  passed,
  wordCount,
  fleschKincaid,
  // ...
  failureReasons,  // ← This array is created but never saved to trace
};
```

**Evidence 2**: UI expects `heuristics_issues`
```typescript
// useLessonInspectorData.ts, lines 408-411
const heuristicsPassed = (judgeOutput.heuristics_passed as boolean) ?? true;
const heuristicsIssues = (judgeOutput.heuristics_issues as string[]) ?? [];

return {
  // ...
  heuristicsPassed,
  heuristicsIssues: heuristicsIssues.length > 0 ? heuristicsIssues : undefined,
};
```

**Evidence 3**: JudgeVotingPanel renders heuristics warning
```typescript
// JudgeVotingPanel.tsx, lines 294-310
{!heuristicsPassed && result.heuristicsIssues && result.heuristicsIssues.length > 0 && (
  <div className="p-3 rounded-lg bg-amber-50">
    <p className="text-sm font-medium">Обнаружены проблемы:</p>
    <ul className="text-xs space-y-0.5 list-disc list-inside">
      {result.heuristicsIssues.map((issue, idx) => (
        <li key={idx}>{issue}</li>  // ← Never renders because data missing
      ))}
    </ul>
  </div>
)}
```

**Evidence 4**: Database query confirms minimal data
```json
{
  "output_data": {
    "cascadeStage": "heuristic",  // ← Only tells us it stopped at heuristics
    "qualityScore": 0,
    "needsHumanReview": false,
    "needsRegeneration": true,
    "finalRecommendation": "REGENERATE"
    // ❌ No failureReasons, no votes, no heuristics details
  }
}
```

---

## Proposed Solutions

### Solution 1: Enrich judge_complete Trace Output (Recommended)

**Approach**: Transform `CascadeResult` into UI-compatible structure and save to `output_data`

**Implementation Steps**:

1. **Create transformation function** in `orchestrator.ts`:
   ```typescript
   function transformCascadeResultForUI(
     cascadeResult: CascadeResult,
     verdict: JudgeVerdict | null
   ): Record<string, unknown> {
     const output: Record<string, unknown> = {
       cascadeStage: cascadeResult.stage,
       finalRecommendation: cascadeResult.finalRecommendation,
       qualityScore: cascadeResult.finalScore,
     };

     // Add heuristic data if heuristics ran
     if (cascadeResult.heuristicResults) {
       output.heuristics_passed = cascadeResult.heuristicResults.passed;
       output.heuristics_issues = cascadeResult.heuristicResults.failureReasons;
       output.word_count = cascadeResult.heuristicResults.wordCount;
       output.flesch_kincaid = cascadeResult.heuristicResults.fleschKincaid;
       output.examples_count = cascadeResult.heuristicResults.examplesCount;
       output.exercises_count = cascadeResult.heuristicResults.exercisesCount;
       output.keyword_coverage = cascadeResult.heuristicResults.keywordCoverage;
     }

     // Add single judge verdict if ran
     if (cascadeResult.singleJudgeVerdict) {
       output.votes = [{
         judge_id: 'single_judge',
         model_id: cascadeResult.singleJudgeVerdict.judgeModel,
         model_display_name: cascadeResult.singleJudgeVerdict.judgeModel,
         verdict: cascadeResult.singleJudgeVerdict.recommendation,
         score: cascadeResult.singleJudgeVerdict.overallScore,
         coherence: cascadeResult.singleJudgeVerdict.criteriaScores.learning_objective_alignment,
         accuracy: cascadeResult.singleJudgeVerdict.criteriaScores.factual_accuracy,
         completeness: cascadeResult.singleJudgeVerdict.criteriaScores.completeness,
         readability: cascadeResult.singleJudgeVerdict.criteriaScores.clarity_readability,
         reasoning: cascadeResult.singleJudgeVerdict.strengths.join('; '),
         evaluated_at: new Date().toISOString(),
       }];
       output.consensus_method = 'single_judge';
     }

     // Add CLEV voting results if ran
     if (cascadeResult.clevResult) {
       output.votes = cascadeResult.clevResult.verdicts.map((v, idx) => ({
         judge_id: `judge-${idx + 1}`,
         model_id: v.judgeModel,
         model_display_name: v.judgeModel,
         verdict: v.recommendation,
         score: v.overallScore,
         coherence: v.criteriaScores.learning_objective_alignment,
         accuracy: v.criteriaScores.factual_accuracy,
         completeness: v.criteriaScores.completeness,
         readability: v.criteriaScores.clarity_readability,
         reasoning: v.strengths.join('; '),
         evaluated_at: new Date().toISOString(),
       }));
       output.consensus_method = cascadeResult.clevResult.consensusMethod;
       output.is_third_judge_invoked = cascadeResult.clevResult.thirdJudgeUsed ?? false;
     }

     // Add highlighted sections from verdict issues
     if (verdict?.issues && verdict.issues.length > 0) {
       output.highlighted_sections = verdict.issues.map((issue, idx) => ({
         section_index: idx,
         section_title: issue.location,
         issue: issue.description,
         severity: issue.severity === 'critical' ? 'high' :
                   issue.severity === 'major' ? 'medium' : 'low',
       }));
     }

     return output;
   }
   ```

2. **Update trace logging** in judge node (line 467):
   ```typescript
   const uiCompatibleOutput = transformCascadeResultForUI(cascadeResult, verdict);

   await logTrace({
     courseId: state.courseId,
     lessonId: state.lessonUuid || undefined,
     stage: 'stage_6',
     phase: 'judge',
     stepName: 'judge_complete',
     inputData: {
       lessonLabel: state.lessonSpec.lesson_id,
     },
     outputData: {
       ...uiCompatibleOutput,  // ← Use enriched output
       needsRegeneration,
       needsHumanReview,
       hasLessonContent: finalContent !== null,
     },
     tokensUsed: totalTokensUsed,
     durationMs,
   });
   ```

3. **Update retry count tracking**:
   - Add `retry_attempt` to trace log (already exists in DB schema)
   - Pass `state.retryCount` to `logTrace` call

**Pros**:
- ✅ Single source of truth (trace log)
- ✅ No UI changes needed (parsing already expects this format)
- ✅ Backward compatible (adds new fields, doesn't break existing)
- ✅ Complete transparency into judge decision process

**Cons**:
- Increases `output_data` JSONB size (~2-5KB per trace)
- Requires transformation logic maintenance

**Complexity**: Medium

**Risk**: Low (additive change, doesn't modify existing behavior)

**Estimated Effort**: 2-3 hours

---

### Solution 2: Fetch Full Cascade Result from State (Alternative)

**Approach**: Store `cascadeResult` in `lesson_contents.metadata` and fetch separately in UI

**Implementation Steps**:

1. Save full `cascadeResult` to `lesson_contents.metadata.judge_cascade_result`
2. Modify UI to fetch from `lesson_contents` instead of `generation_trace`
3. Parse cascade result directly without transformation

**Pros**:
- ✅ Keeps trace logs lean
- ✅ Full cascade data available for analysis

**Cons**:
- ❌ Two sources of truth (trace + lesson metadata)
- ❌ UI must fetch two resources
- ❌ Breaks existing trace-based inspection pattern

**Complexity**: Medium-High

**Risk**: Medium (changes data flow architecture)

**Estimated Effort**: 4-5 hours

---

### Solution 3: Create Dedicated Judge Results Table (Future Enhancement)

**Approach**: New `judge_evaluations` table with foreign key to `lesson_contents`

**Schema**:
```sql
CREATE TABLE judge_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id),
  cascade_stage TEXT NOT NULL,  -- 'heuristic', 'single_judge', 'clev'
  heuristic_results JSONB,      -- Full HeuristicResults
  single_judge_verdict JSONB,   -- Full JudgeVerdict if ran
  clev_result JSONB,             -- Full JudgeAggregatedResult if ran
  final_recommendation TEXT NOT NULL,
  quality_score DECIMAL(3,2) NOT NULL,
  retry_attempt INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Pros**:
- ✅ Proper relational structure
- ✅ Easy to query judge history
- ✅ Supports analytics

**Cons**:
- ❌ Requires migration
- ❌ Changes architecture
- ❌ More complex implementation

**Complexity**: High

**Risk**: Medium-High (schema migration, data consistency)

**Estimated Effort**: 1-2 days

---

## Implementation Guidance

### Recommended Priority: HIGH

**Justification**:
- Critical UI feature non-functional
- Blocks user understanding of quality evaluation
- Required for Stage 6 production readiness

### Recommended Solution: **Solution 1** (Enrich Trace Output)

**Rationale**:
1. Fastest to implement (2-3 hours)
2. Lowest risk (additive, backward compatible)
3. Uses existing architecture (trace logging)
4. No UI changes needed (already expects this format)
5. Provides complete judge transparency

### Files to Modify

1. **packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts**
   - Add `transformCascadeResultForUI()` function (lines 100-200)
   - Update `judge_complete` trace log (line 467)
   - Add retry count to trace (line 470)

2. **No UI changes needed** (parsing already expects enriched format)

### Validation Criteria

**Before considering this fixed, verify**:

1. ✅ Heuristic failures visible in UI
   - Test: Generate lesson with missing examples
   - Expected: UI shows "Examples count (0) below minimum (1)" in amber warning box

2. ✅ Individual judge votes visible (if cascade ran to single_judge)
   - Test: Generate lesson that passes heuristics but scores 0.6-0.8
   - Expected: UI shows judge card with model name, score, verdict, criteria

3. ✅ CLEV voting visible (if cascade ran to CLEV)
   - Test: Generate lesson with score 0.4-0.6 (triggers CLEV)
   - Expected: UI shows 2-3 judge cards, consensus method badge, final verdict

4. ✅ Retry count visible
   - Test: Regenerate lesson twice
   - Expected: UI shows "Retry 2" or similar indicator

5. ✅ Highlighted sections visible
   - Test: Generate lesson with specific section issues
   - Expected: UI shows section badges with severity colors

### Testing Requirements

**Unit Tests**:
```typescript
describe('transformCascadeResultForUI', () => {
  it('should include heuristic failures when heuristics fail', () => {
    const cascadeResult: CascadeResult = {
      stage: 'heuristic',
      passed: false,
      heuristicResults: {
        passed: false,
        failureReasons: ['Examples count (0) below minimum (1)'],
        // ... other fields
      },
      // ...
    };

    const output = transformCascadeResultForUI(cascadeResult, null);

    expect(output.heuristics_passed).toBe(false);
    expect(output.heuristics_issues).toEqual(['Examples count (0) below minimum (1)']);
  });

  it('should include single judge vote when single judge runs', () => {
    // Test that votes array is populated from singleJudgeVerdict
  });

  it('should include CLEV votes when CLEV runs', () => {
    // Test that votes array is populated from clevResult.verdicts
  });
});
```

**Integration Tests**:
1. Run full Stage 6 pipeline with failing heuristics
2. Query `generation_trace` for `judge_complete`
3. Verify `output_data` contains `heuristics_issues` array

**UI Tests** (manual or E2E):
1. Open LessonInspector for lesson with failed heuristics
2. Verify JudgeVotingPanel shows amber warning box
3. Verify heuristic failure reasons listed as bullet points

---

## Risks and Considerations

### Implementation Risks

**Risk 1: JSONB Size Increase**
- **Impact**: Medium
- **Mitigation**: Monitor `generation_trace` table size, add index on `phase = 'judge'`
- **Threshold**: If `output_data` exceeds 10KB consistently, revisit Solution 3 (dedicated table)

**Risk 2: Transformation Logic Drift**
- **Impact**: Low-Medium
- **Mitigation**: Add TypeScript types for UI-expected structure, validate in tests
- **Prevention**: Create shared type definition between backend and frontend

**Risk 3: Backward Compatibility**
- **Impact**: Low
- **Mitigation**: Additive changes only (new fields, no deletions)
- **Verification**: Existing lessons without new fields should still render (UI has fallbacks)

### Performance Impact

**Database**:
- Minimal impact (JSONB writes are fast in Postgres)
- Trace table already has JSONB column with GIN index

**UI**:
- No additional network requests (data already fetched)
- Slightly larger JSON payload (~2-5KB per lesson)

### Breaking Changes

**None expected** - This is an additive change:
- New fields added to `output_data`
- UI already has defensive parsing (uses `?? []` and `?? true` fallbacks)
- Old traces without new fields will continue to work (UI shows empty state)

### Side Effects

**Positive**:
- Enables future judge analytics (query by heuristic failure type)
- Improves debugging (full judge context in one place)
- Supports audit trails (complete evaluation history)

**Negative**:
- Slightly larger database footprint
- More data to maintain consistency across versions

---

## Documentation References

### Tier 0: Project Internal Documentation

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts`
- Lines 100-119: `HeuristicResults` interface definition
- Lines 138-157: `CascadeResult` interface definition
- Lines 457-550: `runHeuristicFilters()` implementation showing `failureReasons` construction

**File**: `packages/web/components/generation-graph/hooks/useLessonInspectorData.ts`
- Lines 383-427: `parseJudgeResult()` function showing expected data structure
- Lines 408-411: Parsing of `heuristics_passed` and `heuristics_issues`
- Lines 432-464: Parsing of `votes`, `consensus_method`, `final_verdict`

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`
- Lines 224-500: Judge node implementation
- Lines 467-485: Current trace logging (missing cascade details)
- Lines 280-334: Cascade result handling (data available but not saved)

**Previous Investigation**: None found for this specific issue

**Git History**:
```bash
git log --all --grep="judge.*trace" --oneline
git log -p -- packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts | head -100
```

### Tier 1: Context7 MCP (Not Applicable)

This is a project-specific data flow issue, not a library/framework integration problem. No external documentation needed.

### Tier 2/3: Official Documentation (Not Applicable)

No external dependencies involved - this is internal data transformation.

---

## MCP Server Usage

**Tools Used**:
1. **Project Internal Search** (Tier 0 - MANDATORY FIRST):
   - ✅ Read orchestrator.ts (judge node implementation)
   - ✅ Read useLessonInspectorData.ts (UI parsing logic)
   - ✅ Read JudgeVotingPanel.tsx (UI rendering)
   - ✅ Read cascade-evaluator.ts (backend data production)
   - ✅ Grep for `heuristicFailureReasons`, `failureReasons`, `heuristics_issues`

2. **Supabase MCP**:
   - ✅ `execute_sql` - Queried `generation_trace` for judge_complete records
   - ✅ Confirmed minimal `output_data` structure in production database

3. **Context7 MCP**: Not used (not applicable)

4. **Sequential Thinking MCP**: Not used (straightforward data flow issue)

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report** - Validate findings and solution approach
2. **Approve Solution 1** (or request alternative if concerns exist)
3. **Invoke implementation agent** with:
   - Report reference: `docs/investigations/INV-2025-12-09-001-stage6-judge-ui-missing-data.md`
   - Selected solution: Solution 1 (Enrich Trace Output)
   - Priority: HIGH

### For Implementation Agent

**Task**: Implement Solution 1 - Enrich judge_complete trace output

**Deliverables**:
1. Add `transformCascadeResultForUI()` function to orchestrator.ts
2. Update `judge_complete` trace logging to use enriched output
3. Add unit tests for transformation function
4. Add integration test verifying trace data structure
5. Manual UI verification (checklist provided in Validation Criteria)

**Acceptance Criteria**:
- [ ] Heuristic failures visible in UI amber warning box
- [ ] Individual judge votes render when cascade reaches single_judge
- [ ] CLEV voting panel shows 2-3 judges when cascade reaches CLEV
- [ ] Retry count displayed in UI
- [ ] Highlighted sections render with severity colors
- [ ] All unit tests pass
- [ ] Integration test confirms trace structure

**Estimated Effort**: 2-3 hours

---

## Follow-Up Recommendations

### Short-Term (Within 1 Week)

1. **Add retry count indicator** to LessonInspector header
   - Show "Regeneration Attempt 2/3" badge
   - Link to previous attempts in trace log

2. **Add cascade stage indicator** to judge panel
   - Badge showing "Heuristic Filter" or "Single Judge" or "CLEV Voting"
   - Tooltip explaining what each stage means

### Medium-Term (Within 1 Month)

1. **Create shared type definitions** for trace output structure
   - Define `JudgeTraceOutput` interface in shared-types package
   - Use in both orchestrator (producer) and UI (consumer)
   - Add Zod schema for runtime validation

2. **Add judge analytics dashboard**
   - Query `generation_trace` to show:
     - Heuristic failure distribution (which checks fail most often)
     - Average quality scores by cascade stage
     - Regeneration success rates
   - Use for model selection and threshold tuning

### Long-Term (Future Consideration)

1. **Implement Solution 3** (dedicated judge_evaluations table)
   - When judge data grows beyond 10KB per trace
   - When analytics require complex queries
   - When historical judge data needs retention policies

2. **Add judge explanation UI**
   - Interactive tooltips explaining each criterion
   - Links to documentation on quality standards
   - Example-based learning (show high-quality vs low-quality content)

---

## Investigation Log

**Timeline**:

1. **00:00 - Problem Analysis** (10 minutes)
   - Read task specification
   - Identified 4 missing UI features (votes, heuristics, retries, sections)
   - Formed 3 initial hypotheses

2. **00:10 - UI Code Inspection** (15 minutes)
   - Read `useLessonInspectorData.ts` (894 lines)
   - Read `JudgeVotingPanel.tsx` (393 lines)
   - Documented expected data structure

3. **00:25 - Database Investigation** (5 minutes)
   - Queried `generation_trace` for judge_complete records
   - Confirmed minimal output_data (only 5 fields)
   - Eliminated Hypothesis 1 (database stores complete data)

4. **00:30 - Backend Code Inspection** (20 minutes)
   - Read `orchestrator.ts` judge node (lines 224-500)
   - Read `cascade-evaluator.ts` interfaces and implementation
   - Found root cause: orchestrator saves minimal output

5. **00:50 - Solution Design** (25 minutes)
   - Designed Solution 1 (enrich trace output)
   - Designed Solution 2 (fetch from lesson metadata)
   - Designed Solution 3 (dedicated table)
   - Compared pros/cons, selected Solution 1

6. **01:15 - Report Writing** (45 minutes)
   - Documented findings with evidence
   - Created transformation function pseudocode
   - Wrote validation criteria and testing requirements
   - Compiled follow-up recommendations

**Total Duration**: ~2 hours

**Findings Confidence**: High (95%)
- Clear data flow gap identified
- Root cause confirmed with code evidence
- Solution validated against UI expectations

**MCP Calls Made**: 15
- 10x Read (code files, types, implementations)
- 3x Grep (search for field names, patterns)
- 1x execute_sql (database verification)
- 1x Bash (create investigations directory)

---

## Appendix: Data Structure Comparison

### Current: What Orchestrator Saves

```typescript
outputData: {
  cascadeStage: "heuristic",
  qualityScore: 0,
  needsHumanReview: false,
  needsRegeneration: true,
  finalRecommendation: "REGENERATE"
}
```

### Expected: What UI Needs

```typescript
outputData: {
  // Existing fields (keep these)
  cascadeStage: "heuristic",
  qualityScore: 0,
  needsHumanReview: false,
  needsRegeneration: true,
  finalRecommendation: "REGENERATE",

  // NEW: Heuristic data
  heuristics_passed: false,
  heuristics_issues: [
    "Examples count (0) below minimum (1)",
    "Exercises count (0) below minimum (1)"
  ],
  word_count: 1234,
  flesch_kincaid: 8.5,
  examples_count: 0,
  exercises_count: 0,
  keyword_coverage: 0.65,

  // NEW: Judge votes (if cascade ran to single_judge or CLEV)
  votes: [
    {
      judge_id: "judge-1",
      model_id: "deepseek/deepseek-v3.1-terminus",
      model_display_name: "DeepSeek V3.1 Terminus",
      verdict: "TARGETED_FIX",
      score: 0.78,
      coherence: 0.80,
      accuracy: 0.85,
      completeness: 0.75,
      readability: 0.72,
      reasoning: "Clear structure but needs more examples",
      evaluated_at: "2025-12-09T17:47:40.011Z"
    }
  ],
  consensus_method: "single_judge",
  is_third_judge_invoked: false,

  // NEW: Highlighted sections (from verdict.issues)
  highlighted_sections: [
    {
      section_index: 1,
      section_title: "Introduction to Concepts",
      issue: "Missing code examples",
      severity: "medium"
    }
  ]
}
```

### Available: What Cascade Evaluator Produces

```typescript
cascadeResult: CascadeResult = {
  stage: "heuristic",
  passed: false,
  finalScore: 0,
  finalRecommendation: "REGENERATE",
  totalTokensUsed: 0,
  totalDurationMs: 50,

  heuristicResults: {
    passed: false,
    wordCount: 1234,
    fleschKincaid: 8.5,
    sectionsPresent: true,
    missingSections: [],
    keywordCoverage: 0.65,
    examplesCount: 0,
    exercisesCount: 0,
    failureReasons: [  // ← THIS EXISTS BUT NOT SAVED
      "Examples count (0) below minimum (1)",
      "Exercises count (0) below minimum (1)"
    ]
  },

  // These fields populated if cascade proceeds beyond heuristics
  singleJudgeVerdict?: {
    overallScore: 0.78,
    recommendation: "TARGETED_FIX",
    criteriaScores: {
      learning_objective_alignment: 0.80,
      factual_accuracy: 0.85,
      completeness: 0.75,
      clarity_readability: 0.72,
      // ...
    },
    issues: [...],
    strengths: [...],
    judgeModel: "deepseek/deepseek-v3.1-terminus",
    // ...
  },

  clevResult?: {
    verdicts: [...],  // Array of JudgeVerdict
    consensusMethod: "majority",
    thirdJudgeUsed: false,
    // ...
  }
}
```

**Gap**: The orchestrator has access to all this data but only saves the top 5 fields. The transformation function bridges this gap.

---

**Status**: ✅ Investigation Complete
**Next Action**: Review → Approve Solution → Invoke Implementation Agent
**Estimated Implementation Time**: 2-3 hours
**Priority**: HIGH
