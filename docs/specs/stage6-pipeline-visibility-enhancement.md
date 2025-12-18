# Stage 6 Pipeline Visibility Enhancement

**Date:** 2025-12-09
**Status:** Specification
**Priority:** High
**Scope:** All Stage 6 pipeline nodes (Planner → Expander → Assembler → Smoother → Judge)

## Problem Statement

Currently, the Stage 6 "Glass Factory" UI shows minimal information about each pipeline stage. Users cannot see:
- What data was processed at each stage
- What decisions were made
- Why certain outcomes occurred
- Detailed metrics and quality indicators

This makes debugging, quality assurance, and understanding the generation process extremely difficult.

## Current State

### What Users See Now

For each pipeline node, users see only:
- Status badge (completed/error/in_progress)
- Duration (e.g., "30s")
- Basic "View Output" button with raw JSON

### What's Missing

1. **Input/Output summaries** - What went in, what came out
2. **Decision explanations** - Why certain choices were made
3. **Quality metrics** - Scores, token counts, model info
4. **Error details** - Specific failure reasons
5. **Retry information** - Attempt number, previous failures

## Pipeline Stages - Required Visibility

### 1. Planner Node

**Current trace data saved:**
```json
{
  "lessonLabel": "1.1"
}
```

**Required visibility:**

| Field | Description | UI Display |
|-------|-------------|------------|
| Input: lessonSpec | Lesson specification summary | Collapsible card with title, objectives count, sections count |
| Input: ragChunks | RAG context used | Badge showing "5 chunks, 12K tokens" |
| Output: outline | Generated outline | Expandable markdown preview |
| Output: sectionsPlanned | Number of sections planned | Metric card "7 sections" |
| Output: keyPointsPerSection | Key points distribution | Mini bar chart or list |
| Metrics: tokensUsed | Tokens consumed | "2,450 tokens" |
| Metrics: modelUsed | LLM model | "DeepSeek V3.1" |
| Metrics: temperature | Generation temperature | "0.65" |

### 2. Expander Node

**Current trace data saved:**
```json
{
  "lessonLabel": "1.1"
}
```

**Required visibility:**

| Field | Description | UI Display |
|-------|-------------|------------|
| Input: outline | Outline received from planner | Collapsible preview |
| Input: sectionsToExpand | Sections being expanded | List with titles |
| Output: expandedSections | Expanded content per section | Section cards with word counts |
| Output: totalWords | Total word count | Metric "1,661 words" |
| Output: ragChunksUsed | RAG chunks cited per section | "Section 1: 3 chunks, Section 2: 2 chunks" |
| Metrics: tokensUsed | Tokens consumed | "8,500 tokens" |
| Metrics: modelUsed | LLM model | "GPT-OSS-120B" |
| Progress: sectionsComplete | Progress indicator | "5/7 sections complete" |

### 3. Assembler Node

**Current trace data saved:**
```json
{
  "lessonLabel": "1.1"
}
```

**Required visibility:**

| Field | Description | UI Display |
|-------|-------------|------------|
| Input: expandedSections | Sections to assemble | Count and total length |
| Output: assembledContent | Combined content | Length in words/chars |
| Output: structureValidation | Structure check results | ✓ Intro present, ✓ Sections ordered, ✗ Missing conclusion |
| Output: transitionPoints | Where transitions were added | List of section boundaries |
| Metrics: tokensUsed | Tokens consumed | "1,200 tokens" |
| Quality: coherenceScore | Pre-judge coherence check | Progress bar 0.78 |

### 4. Smoother Node

**Current trace data saved:**
```json
{
  "smoothedLength": 12408,
  "wordCount": 1661,
  "sectionsCount": 1
}
```

**Required visibility:**

| Field | Description | UI Display |
|-------|-------------|------------|
| Input: assembledContent | Content to smooth | Word count, section count |
| Output: smoothedContent | Polished content | Word count delta "+45 words" |
| Output: lessonContent | Structured LessonContent | JSON structure preview |
| Changes: transitionsAdded | Transitions inserted | Count "12 transitions" |
| Changes: styleAdjustments | Tone/style fixes | List of adjustment types |
| Metrics: tokensUsed | Tokens consumed | "3,200 tokens" |
| Metrics: modelUsed | Model used | "DeepSeek V3.1" |
| Quality: readabilityScore | Flesch-Kincaid grade | "Grade 10.5" |

### 5. Judge Node (Most Critical)

**Current trace data saved:**
```json
{
  "cascadeStage": "heuristic",
  "qualityScore": 0,
  "needsHumanReview": false,
  "needsRegeneration": true,
  "finalRecommendation": "REGENERATE"
}
```

**Required visibility:**

| Field | Description | UI Display |
|-------|-------------|------------|
| **Cascade Stage Info** | | |
| cascadeStage | Which stage was reached | Badge "Heuristic" / "Single Judge" / "CLEV Voting" |
| stageReason | Why stopped at this stage | "Failed heuristic checks" |
| **Heuristic Results** | | |
| heuristicsPassed | Pass/fail | ✓/✗ indicator |
| wordCount | Actual vs required | "1,186 words (min: 500 ✓)" |
| fleschKincaid | Readability grade | "1.0 (target: 8-12 ✗)" |
| examplesCount | Examples found | "0 examples (min: 1 ✗)" |
| exercisesCount | Exercises found | "0 exercises (min: 1 ✗)" |
| failureReasons | All failure reasons | Bulleted list with severity colors |
| **Single Judge Results** (if reached) | | |
| judgeModel | Model used | "DeepSeek V3.1 Terminus" |
| overallScore | Judge score | Progress bar 0.72 |
| confidence | Confidence level | Badge "Medium" |
| criteriaScores | Per-criterion scores | Table: coherence 0.8, accuracy 0.9, etc. |
| issues | Found issues | List with severity, location, description |
| strengths | Positive aspects | Bulleted list |
| **CLEV Voting Results** (if reached) | | |
| votingMethod | Consensus method | Badge "Majority" / "Unanimous" / "Tie-Breaker" |
| judgesUsed | Number of judges | "2 judges" or "3 judges (tie-breaker)" |
| votes | Individual votes | Cards per judge with model, score, recommendation |
| aggregatedScore | Final score | Large metric 0.75 |
| consensusReached | Agreement status | ✓/✗ |
| **Decision Info** | | |
| finalRecommendation | Decision | Large badge ACCEPT/REGENERATE/etc. |
| recommendationReason | Why this decision | Explanation text |
| **Retry Info** | | |
| retryCount | Current attempt | "Attempt 2 of 2" |
| previousAttempts | History | Collapsible list of previous scores/reasons |
| **Metrics** | | |
| tokensUsed | Total judge tokens | "4,500 tokens" |
| durationMs | Evaluation time | "12.3s" |
| costSavingsRatio | Cascade efficiency | "67% saved (skipped CLEV)" |

## Data Flow Architecture

### Current Flow
```
Orchestrator Node → logTrace() → generation_trace table → UI fetches → Minimal display
```

### Required Flow
```
Orchestrator Node → transformForUI() → logTrace(enrichedData) → generation_trace → UI fetches → Rich display
```

## Implementation Approach

### Phase 1: Enrich Trace Data (Backend)

For each node in `orchestrator.ts`, update the `logTrace()` calls to include all relevant data:

```typescript
// Example for judge_complete
await logTrace({
  courseId: state.courseId,
  lessonId: state.lessonUuid,
  stage: 'stage_6',
  phase: 'judge',
  stepName: 'judge_complete',
  inputData: {
    lessonLabel: state.lessonSpec.lesson_id,
    contentWordCount: contentBody ? countWords(contentBody) : 0,
    sectionsCount: contentBody?.sections?.length ?? 0,
  },
  outputData: {
    // Cascade info
    cascadeStage: cascadeResult.stage,
    stageReason: cascadeResult.stage === 'heuristic' ? 'Failed heuristic pre-filters' :
                 cascadeResult.stage === 'single_judge' ? 'High confidence single judge' : 'CLEV voting required',

    // Heuristic results (always present)
    heuristics: cascadeResult.heuristicResults ? {
      passed: cascadeResult.heuristicResults.passed,
      wordCount: cascadeResult.heuristicResults.wordCount,
      fleschKincaid: cascadeResult.heuristicResults.fleschKincaidGrade,
      examplesCount: cascadeResult.heuristicResults.examplesCount,
      exercisesCount: cascadeResult.heuristicResults.exercisesCount,
      failureReasons: cascadeResult.heuristicResults.failureReasons,
    } : null,

    // Single judge results (if reached)
    singleJudge: cascadeResult.singleJudgeVerdict ? {
      model: cascadeResult.singleJudgeVerdict.modelId,
      score: cascadeResult.singleJudgeVerdict.overallScore,
      confidence: cascadeResult.singleJudgeVerdict.confidence,
      criteriaScores: cascadeResult.singleJudgeVerdict.criteriaScores,
      issues: cascadeResult.singleJudgeVerdict.issues,
      strengths: cascadeResult.singleJudgeVerdict.strengths,
      recommendation: cascadeResult.singleJudgeVerdict.recommendation,
    } : null,

    // CLEV results (if reached)
    clevVoting: cascadeResult.clevResult ? {
      votingMethod: cascadeResult.clevResult.votingMethod,
      consensusReached: cascadeResult.clevResult.consensusReached,
      aggregatedScore: cascadeResult.clevResult.aggregatedScore,
      votes: cascadeResult.clevResult.verdicts.map(v => ({
        model: v.modelId,
        score: v.overallScore,
        confidence: v.confidence,
        recommendation: v.recommendation,
      })),
    } : null,

    // Decision
    finalRecommendation: cascadeResult.finalRecommendation,
    qualityScore: cascadeResult.finalScore,
    needsRegeneration,
    needsHumanReview,

    // Retry info
    retryCount: state.retryCount,

    // Metrics
    costSavingsRatio: cascadeResult.costSavingsRatio,
  },
  tokensUsed: cascadeResult.totalTokensUsed,
  durationMs,
});
```

### Phase 2: Update UI Components

1. **PipelinePanel.tsx** - Show expanded node cards with input/output summaries
2. **MetricsGrid.tsx** - Display all metrics in organized grid
3. **JudgeVotingPanel.tsx** - Show cascade results, heuristic failures, votes
4. **ContentPreviewPanel.tsx** - Show content diff between stages

### Phase 3: Add Detailed Views

1. **NodeDetailModal** - Full-screen view of any node's data
2. **DiffViewer** - Compare content between stages
3. **RetryHistory** - Show all attempts with outcomes

## Files to Modify

### Backend (course-gen-platform)
- `src/stages/stage6-lesson-content/orchestrator.ts` - Enrich all logTrace calls
- `src/stages/stage6-lesson-content/nodes/planner.ts` - Add detailed output
- `src/stages/stage6-lesson-content/nodes/expander.ts` - Add detailed output
- `src/stages/stage6-lesson-content/nodes/assembler.ts` - Add detailed output
- `src/stages/stage6-lesson-content/nodes/smoother.ts` - Add detailed output

### Frontend (web)
- `components/generation-graph/hooks/useLessonInspectorData.ts` - Parse enriched data
- `components/generation-graph/panels/lesson/PipelinePanel.tsx` - Rich node display
- `components/generation-graph/components/JudgeVotingPanel.tsx` - Full judge info
- `components/generation-graph/panels/shared/MetricsGrid.tsx` - More metrics
- `components/generation-graph/components/VerticalPipelineStepper.tsx` - Node summaries

### New Components Needed
- `components/generation-graph/components/HeuristicResultsCard.tsx` - Heuristic check display
- `components/generation-graph/components/JudgeVoteCard.tsx` - Individual judge vote
- `components/generation-graph/components/NodeInputOutput.tsx` - Input/output summary
- `components/generation-graph/components/RetryHistoryPanel.tsx` - Retry attempts

## Type Definitions

### Enriched Trace Output Types

```typescript
// In shared-types package

interface PipelineNodeTraceOutput {
  // Common fields
  lessonLabel: string;
  tokensUsed: number;
  durationMs: number;
  modelUsed?: string;
}

interface PlannerTraceOutput extends PipelineNodeTraceOutput {
  outline: string;
  sectionsPlanned: number;
  keyPointsPerSection: Record<string, number>;
  ragChunksUsed: number;
}

interface ExpanderTraceOutput extends PipelineNodeTraceOutput {
  sectionsExpanded: number;
  totalWords: number;
  expandedSections: Array<{
    title: string;
    wordCount: number;
    ragChunksUsed: number;
  }>;
}

interface AssemblerTraceOutput extends PipelineNodeTraceOutput {
  assembledWordCount: number;
  structureValidation: {
    hasIntro: boolean;
    hasSections: boolean;
    hasExercises: boolean;
    issues: string[];
  };
}

interface SmootherTraceOutput extends PipelineNodeTraceOutput {
  inputWordCount: number;
  outputWordCount: number;
  transitionsAdded: number;
  readabilityScore: number;
}

interface JudgeTraceOutput extends PipelineNodeTraceOutput {
  cascadeStage: 'heuristic' | 'single_judge' | 'clev_voting';
  stageReason: string;

  heuristics: {
    passed: boolean;
    wordCount: number;
    fleschKincaid: number;
    examplesCount: number;
    exercisesCount: number;
    failureReasons: string[];
  } | null;

  singleJudge: {
    model: string;
    score: number;
    confidence: 'high' | 'medium' | 'low';
    criteriaScores: Record<string, number>;
    issues: Array<{
      criterion: string;
      severity: string;
      description: string;
    }>;
    strengths: string[];
    recommendation: string;
  } | null;

  clevVoting: {
    votingMethod: 'unanimous' | 'majority' | 'tie_breaker';
    consensusReached: boolean;
    aggregatedScore: number;
    votes: Array<{
      model: string;
      score: number;
      confidence: string;
      recommendation: string;
    }>;
  } | null;

  finalRecommendation: string;
  qualityScore: number;
  needsRegeneration: boolean;
  needsHumanReview: boolean;
  retryCount: number;
  costSavingsRatio: number;
}
```

## Success Criteria

1. **Planner Node** - User can see outline preview, sections count, RAG usage
2. **Expander Node** - User can see per-section expansion stats, word counts
3. **Assembler Node** - User can see structure validation, assembled length
4. **Smoother Node** - User can see before/after word counts, readability
5. **Judge Node** - User can see:
   - Which cascade stage was reached and why
   - All heuristic check results with pass/fail indicators
   - Individual judge votes (if applicable)
   - Detailed failure reasons
   - Retry count and history
6. **All Nodes** - User can see tokens used, model, duration

## Related Files

- Bug report: `docs/reports/bugs/2025-12/stage6-judge-not-executing.md`
- Investigation: `docs/investigations/INV-2025-12-09-001-stage6-judge-ui-missing-data.md`
- Current UI: `packages/web/components/generation-graph/`
- Orchestrator: `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`
- Cascade evaluator: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts`

## Notes

- This is a comprehensive enhancement affecting both backend trace logging and frontend display
- Backend changes should be backward compatible (additive only)
- UI should gracefully handle missing fields (for old traces)
- Consider adding a "raw JSON" toggle for debugging
- Performance: enriched traces will be larger, monitor database size

---

## Technical Appendix (for New Context Window)

This section provides essential code references and structures needed to implement the visibility enhancement.

### A. CascadeResult Structure (from cascade-evaluator.ts)

The `CascadeResult` is the main output from judge evaluation:

```typescript
// File: packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts

export interface CascadeResult {
  /** Which stage produced the final result: 'heuristic' | 'single_judge' | 'clev_voting' */
  stage: CascadeStage;
  /** Whether content passed evaluation */
  passed: boolean;
  /** Results from heuristic stage (if run) */
  heuristicResults?: HeuristicResults;
  /** Single judge verdict (if run) */
  singleJudgeVerdict?: JudgeVerdict;
  /** CLEV voting result (if run) */
  clevResult?: JudgeAggregatedResult;
  /** Final overall score (0-1) */
  finalScore: number;
  /** Final recommendation: 'ACCEPT' | 'REGENERATE' | etc. */
  finalRecommendation: JudgeRecommendation;
  /** Total tokens used across all stages */
  totalTokensUsed: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Cost savings achieved by cascade (0-1): 1.0 = 100% saved (heuristic fail), 0.67 = single judge, 0 = full CLEV */
  costSavingsRatio: number;
}

export interface HeuristicResults {
  passed: boolean;
  wordCount: number;
  fleschKincaid: number;          // Flesch-Kincaid grade level (target: 8-12)
  sectionsPresent: boolean;
  missingSections: string[];
  keywordCoverage: number;        // 0-1 ratio
  examplesCount: number;
  exercisesCount: number;
  failureReasons: string[];       // Human-readable failure descriptions
}
```

### B. How UI Parses Trace Data (from useLessonInspectorData.ts)

The hook fetches from `generation_trace` table and transforms data:

```typescript
// File: packages/web/components/generation-graph/hooks/useLessonInspectorData.ts

// 1. Fetch traces by lesson UUID and stage='stage_6'
const { data: tracesData } = await supabase
  .from('generation_trace')
  .select('*')
  .eq('lesson_id', lessonUuid)
  .eq('stage', 'stage_6')
  .order('created_at', { ascending: true });

// 2. Build pipeline state from traces
// Key function: buildPipelineState(traces) transforms raw traces into:
interface PipelineNodeState {
  node: Stage6NodeName;           // 'planner' | 'expander' | 'assembler' | 'smoother' | 'judge'
  status: Stage6NodeStatus;       // 'pending' | 'active' | 'completed' | 'error'
  progress?: number;              // For expander: 0-100%
  startedAt?: Date;
  completedAt?: Date;
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
  errorMessage?: string;
  retryAttempt?: number;
  output?: Record<string, unknown>;  // <-- This is where enriched data goes
}

// 3. Parse judge result for voting panel
// Key function: parseJudgeResult() expects these fields in trace.output_data:
interface ExpectedJudgeOutput {
  votes?: Array<{
    judge_id: string;
    model_id: string;
    model_display_name: string;
    verdict: JudgeVerdictType;
    score: number;
    coherence: number;
    accuracy: number;
    completeness: number;
    readability: number;
    reasoning?: string;
    evaluated_at: string;
  }>;
  consensus_method?: 'unanimous' | 'majority' | 'tie_breaker';
  final_verdict?: JudgeVerdictType;
  is_third_judge_invoked?: boolean;
  tie_breaker_id?: string;
  heuristics_passed?: boolean;
  heuristics_issues?: string[];
  highlighted_sections?: Array<{
    section_index: number;
    section_title: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}
```

### C. Current logTrace Calls in Orchestrator

The orchestrator currently saves minimal data at these points:

```typescript
// File: packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts

// 1. judge_start (lines 235-247):
await logTrace({
  inputData: {
    lessonLabel: state.lessonSpec.lesson_id,
    hasSmoothedContent: Boolean(state.smoothedContent),
    refinementIterationCount: state.refinementIterationCount,
  },
  // No cascadeResult yet
});

// 2. judge_complete - synthetic decision (lines 300-319):
outputData: {
  finalRecommendation: recommendation,
  qualityScore: cascadeResult.finalScore,
  needsRegeneration,
  needsHumanReview,
  cascadeStage: cascadeResult.stage,
  // MISSING: heuristicResults, singleJudgeVerdict, clevResult details
}

// 3. judge_complete - normal path (lines 467-485):
outputData: {
  finalRecommendation,
  qualityScore: finalScore,
  needsRegeneration,
  needsHumanReview,
  hasLessonContent: finalContent !== null,
  // MISSING: all cascade details
}
```

### D. Key Changes Required

**Backend (orchestrator.ts):**
1. After `executeCascadeEvaluation()`, save full `cascadeResult` structure
2. Transform to UI-friendly format with `votes[]`, `heuristics_passed`, etc.
3. Include `costSavingsRatio`, `stageReason`, all heuristic details

**Frontend (useLessonInspectorData.ts):**
1. Update `parseJudgeResult()` to handle new field names
2. Add fallbacks for backward compatibility
3. Create new parsing for heuristic display

### E. Database Schema Reference

```sql
-- generation_trace table (relevant columns)
CREATE TABLE generation_trace (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL,
  lesson_id UUID,
  stage TEXT NOT NULL,        -- 'stage_6'
  phase TEXT,                 -- 'planner', 'expander', 'assembler', 'smoother', 'judge', 'init', 'complete'
  step_name TEXT NOT NULL,    -- 'planner_start', 'planner_complete', 'judge_complete', etc.
  input_data JSONB,           -- Input to the node
  output_data JSONB,          -- Output from the node (this is what we're enriching)
  error_data JSONB,           -- Error details if failed
  tokens_used INTEGER,
  cost_usd NUMERIC(10,6),
  duration_ms INTEGER,
  retry_attempt INTEGER,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### F. No Deep Research Needed

This task does NOT require deep research or external documentation. All needed information is in local codebase:

1. **cascade-evaluator.ts** - Full CascadeResult structure, HeuristicResults, all thresholds
2. **clev-voter.ts** - JudgeAggregatedResult, voting methods, JudgeVerdict structure
3. **useLessonInspectorData.ts** - How UI expects data, field names, transformations
4. **orchestrator.ts** - Where to add enriched logTrace calls

### G. Implementation Order (Recommended)

1. **Phase 1: Backend** - Enrich `judge_complete` trace first (highest value)
   - Add all cascadeResult fields to outputData
   - Test with debug script

2. **Phase 2: Frontend parsing** - Update useLessonInspectorData.ts
   - Parse new fields, handle backward compatibility
   - Verify data flows to UI components

3. **Phase 3: UI components** - Create/update display components
   - HeuristicResultsCard
   - JudgeVoteCard (individual votes)
   - Update JudgeVotingPanel

4. **Phase 4: Other nodes** - Enrich planner, expander, assembler, smoother traces

### H. Testing Approach

```bash
# Run Stage 6 for a single lesson to generate traces
cd packages/course-gen-platform
pnpm tsx scripts/debug-stage6-generation.ts

# Check traces in database
SELECT step_name, phase, output_data
FROM generation_trace
WHERE stage = 'stage_6'
ORDER BY created_at DESC
LIMIT 10;
```
