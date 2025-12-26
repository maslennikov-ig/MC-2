# ADR-002: Targeted Refinement System for Stage 6 Lesson Content

**Status**: ACCEPTED
**Date**: 2025-12-25
**Deciders**: Development Team
**Technical Story**: Stage 6 - Lesson Content Quality Improvement (Surgical Fix Architecture)

---

## Context and Problem Statement

Stage 6 of the MegaCampus2 platform generates lesson content using LLMs. When content has quality issues (low scores, missing sections, alignment problems), the original approach was **full regeneration** - discarding all content and generating from scratch.

**Problems with Full Regeneration**:
1. **Expensive**: 100% token cost on every retry (3-5K tokens per lesson)
2. **Quality Loss**: Good sections are discarded along with bad ones
3. **Inconsistent**: Fresh generation may introduce new issues
4. **Time-consuming**: Full generation takes 30-60 seconds per lesson
5. **No Learning**: Same prompts often produce same issues

**Real-world Example**:
- Lesson scores 0.72 (below 0.75 threshold)
- Only 1 section has issues (incorrect technical example)
- Full regeneration costs ~$0.30 and may score worse
- We need surgical fix for 1 section, preserving 90% of quality content

---

## Decision Drivers

### Primary Drivers (High Weight)
1. **Cost Efficiency** (30%): Reduce token costs on quality improvement passes
2. **Quality Preservation** (25%): Keep good content, fix only what's broken
3. **Convergence Guarantee** (20%): Prevent infinite loops, ensure eventual success

### Secondary Drivers (Medium Weight)
4. **Verification Accuracy** (15%): Confirm fixes actually work before accepting
5. **Observability** (10%): Track what was changed and why

---

## Considered Options

### Option 1: Full Regeneration (Status Quo)

**Approach**: Discard and regenerate entire lesson when quality < 0.75.

**Pros**:
- Simple implementation
- No complex state management
- Fresh context on each attempt

**Cons**:
- 100% token cost per retry
- Loses quality content
- No targeted improvement
- May oscillate between different issues

**Score**: 4/10

---

### Option 2: Targeted Refinement System (SELECTED)

**Approach**: Surgical fixes for specific sections while preserving good content.

**Architecture**:
```
Issue Detection → Severity Routing → Task Execution → Delta Verification → Section Lock
```

**Pros**:
- 60-70% token cost reduction (patch ~300 tokens vs full ~3000 tokens)
- Preserves quality sections
- Focused improvements converge faster
- Verification ensures fixes work
- Section locking prevents infinite loops

**Cons**:
- More complex implementation
- Need sophisticated routing logic
- Delta Judge adds verification cost (~150-250 tokens per task)

**Score**: 9/10

---

### Option 3: Hierarchical Refinement (Considered)

**Approach**: Multi-level refinement - word, sentence, paragraph, section.

**Pros**:
- Maximum precision
- Optimal token efficiency

**Cons**:
- Extremely complex to implement
- Difficult to verify at each level
- Overkill for educational content
- High development cost

**Score**: 5/10

---

## Decision Outcome

**Chosen option**: **Targeted Refinement System** with CLEV voting consensus and section locking.

### Key Components

#### 1. Severity-Based Routing

Issues are classified and routed to appropriate handlers:

```typescript
type IssueSeverity = 'critical' | 'major' | 'minor';
type RefinementAction = 'REGENERATE' | 'FLAG_TO_JUDGE' | 'SURGICAL_EDIT';

const SEVERITY_ROUTING: Record<IssueSeverity, RefinementAction> = {
  critical: 'REGENERATE',    // Mermaid syntax, empty content, language issues
  major: 'FLAG_TO_JUDGE',    // Complex semantic issues requiring Judge review
  minor: 'SURGICAL_EDIT',    // Fixable issues like missing keywords, length
};
```

**Rationale**:
- **CRITICAL -> REGENERATE**: Fundamental issues (Mermaid broken, content truncated) require fresh start
- **MAJOR -> FLAG_TO_JUDGE**: Complex issues need human-level judgment (semantic alignment)
- **MINOR -> SURGICAL_EDIT**: Targeted fixes are efficient for well-defined issues

#### 2. Iteration Control with Section Locking

Maximum 3 iterations with section locking after 2 edits:

```typescript
const ITERATION_CONFIG = {
  maxIterations: 3,
  maxEditsPerSection: 2,   // Lock after 2 attempts
  scoreThreshold: 0.75,    // Target quality score
};

interface SectionEditTracker {
  sectionId: string;
  editsCount: number;
  locked: boolean;        // Locked after maxEditsPerSection
  lastScore: number;
}
```

**Why Section Locking?**
- Prevents infinite refinement of stubborn sections
- After 2 failed edits, the section is "good enough" - accept and move on
- Ensures convergence within predictable time/cost bounds

#### 3. Best-Effort Fallback Strategy

When max iterations reached without passing threshold:

```typescript
function selectBestEffortResult(iterationHistory: IterationResult[]): string {
  // Return content from iteration with HIGHEST score (not original)
  // This preserves any improvement made across iterations
  return iterationHistory
    .sort((a, b) => b.score - a.score)
    [0].content;
}
```

**Critical Design Choice**: Return highest-scoring iteration, NOT original content.

**Rationale**:
- Even failed iterations often improve the content
- Iteration 2 at 0.73 is better than original at 0.68
- Users get the best available quality, even if below threshold
- Prevents quality regression on best-effort fallback

#### 4. CLEV Voting Consensus

Two judges + conditional third for verification:

```typescript
const CLEV_CONFIG = {
  minJudges: 2,
  consensusThreshold: 0.5,    // 2/2 or 2/3 agreement required
  tiebreaker: 'conditional',  // 3rd judge only if 1-1 split
};

async function clevVote(patch: string, issue: Issue): Promise<boolean> {
  const votes = await Promise.all([
    deltaJudge1.verify(patch, issue),
    deltaJudge2.verify(patch, issue),
  ]);

  // Check for consensus
  const passVotes = votes.filter(v => v.passed).length;
  if (passVotes === 2) return true;   // 2/2 pass
  if (passVotes === 0) return false;  // 2/2 fail

  // Split decision: invoke 3rd judge
  const tiebreaker = await deltaJudge3.verify(patch, issue);
  return tiebreaker.passed;
}
```

**Why 2+1 not 3?**
- 2 judges agree 85% of the time (based on testing)
- 3rd judge only invoked on 15% edge cases
- Reduces verification cost by ~30% vs always-3

#### 5. Patcher Uses FREE Model

Cost optimization via model selection:

```typescript
const MODEL_CONFIG = {
  stage_6_patcher: {
    modelId: 'xiaomi/mimo-v2-flash:free',  // FREE model for patches
    maxTokens: 800,
    temperature: 0.1,
  },
};
```

**Rationale**:
- Patcher instructions are highly specific (300-500 tokens)
- FREE model sufficient for targeted edits
- Delta Judge uses paid model (accuracy critical)
- Net cost: ~$0.02-0.05 per refinement cycle vs ~$0.30 for regeneration

---

## Implementation Details

### Task Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ INPUT: Lesson with score < 0.75                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. HEURISTIC FILTER (FREE)                                  │
│    - Language consistency check                             │
│    - Content truncation check                               │
│    - Mermaid syntax check                                   │
│    Output: Issues with severity                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. SEVERITY ROUTING                                         │
│    CRITICAL → REGENERATE (full regeneration)                │
│    MAJOR    → FLAG_TO_JUDGE (semantic review)               │
│    MINOR    → SURGICAL_EDIT (patcher)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PATCHER EXECUTION (if SURGICAL_EDIT)                     │
│    - Extract section content                                │
│    - Build patcher prompt with context anchors              │
│    - Call FREE model (mimo-v2-flash:free)                   │
│    - Receive patched content                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. DELTA JUDGE VERIFICATION (CLEV voting)                   │
│    - Compare original vs patched                            │
│    - Check if specific issue was addressed                  │
│    - Detect any new issues introduced                       │
│    - 2 judges + conditional 3rd for consensus               │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
┌───────────────────┐    ┌───────────────────────────────────┐
│ PASSED            │    │ FAILED                            │
│ - Apply patch     │    │ - Increment section edit count    │
│ - Update content  │    │ - If count >= 2: lock section     │
│ - Re-score        │    │ - If iteration < 3: retry         │
└───────────────────┘    │ - Else: best-effort fallback      │
                         └───────────────────────────────────┘
```

### Files Involved

**Core Implementation**:
- `stages/stage6-lesson-content/judge/targeted-refinement/task-executor.ts` - Task execution
- `stages/stage6-lesson-content/judge/patcher/index.ts` - Patcher agent
- `stages/stage6-lesson-content/judge/patcher/patcher-prompt.ts` - Prompt templates
- `stages/stage6-lesson-content/judge/verifier/delta-judge.ts` - CLEV voting

**Supporting**:
- `stages/stage6-lesson-content/judge/heuristic-filter.ts` - Issue detection
- `stages/stage6-lesson-content/judge/fix-templates/index.ts` - Template selection
- `stages/stage6-lesson-content/nodes/self-reviewer-node.ts` - Pre-Judge validation

---

## Positive Consequences

1. **60-70% Token Cost Reduction**: Patches average 300 tokens vs 3000 for regeneration
2. **Quality Preservation**: Good sections never discarded
3. **Faster Convergence**: Targeted fixes address specific issues
4. **Predictable Bounds**: Max 3 iterations, max 2 edits per section
5. **Best-Effort Quality**: Highest-scoring iteration returned on fallback
6. **Verification Safety**: Delta Judge catches regressions

---

## Negative Consequences

1. **Increased Complexity**: More code paths to test and maintain
2. **State Management**: Track edit counts, locked sections, iteration history
3. **Edge Cases**: Some issues may not fit clean severity categories
4. **Verification Cost**: Delta Judge adds ~150-250 tokens per task

---

## Validation & Success Metrics

### Success Criteria
- Token cost per lesson refinement < $0.10 (vs $0.30 baseline)
- 90%+ of refinement cycles complete within 3 iterations
- Best-effort fallback quality >= 0.70 (acceptable threshold)
- No quality regressions (patched score >= original score)

### Monitoring
- Track tokens used per refinement cycle
- Monitor section lock frequency (should be <10%)
- Log best-effort fallback frequency and scores
- Alert on high regeneration rates (indicates routing issues)

---

## References

- **Research**: `docs/research/010-stage6-generation-strategy/` (cascade evaluation)
- **Implementation**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/`
- **Tests**: `tests/stages/stage6-lesson-content/targeted-refinement-cycle.e2e.test.ts`
- **Architecture**: `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md`

---

**Decision Log**:
- 2025-12-25: ADR created and ACCEPTED
- 2025-12-25: Implementation complete with 23 E2E tests passing
