# Feature Specification: Stage 6 Targeted Refinement System

**Feature Branch**: `018-judge-targeted-refinement`
**Created**: 2025-12-11
**Status**: Draft
**Input**: Technical specification from `/home/me/code/megacampus2/docs/specs/features/stage6-targeted-refinement-spec.md`

## Problem Statement

The current Judge system in Stage 6 (lesson content generation) triggers **full regeneration** when refinement is needed. This leads to:

1. **High token costs** (~6000 tokens per refinement iteration)
2. **Loss of quality content** - sections that passed evaluation get discarded during full regeneration
3. **Ignored judge feedback** - specific recommendations from judges aren't applied surgically

The goal is to implement a **Targeted Refinement** system that:
- Applies **surgical fixes** to specific sections instead of full regeneration
- **Preserves quality sections** that already passed evaluation
- **Reduces token costs** by 60-70%
- Supports **two operation modes**: Semi-Auto (with human escalation) and Full-Auto (best-effort results)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Full-Auto Content Generation (Priority: P1)

A content creator initiates lesson generation and expects to receive the best possible content automatically, without manual intervention. The system generates content, evaluates it through judges, and if issues are found, applies targeted fixes to specific sections rather than regenerating everything.

**Why this priority**: This is the primary use case - most users want hands-off generation with quality content delivered automatically. Full-auto mode must work reliably before semi-auto adds value.

**Independent Test**: Can be tested by triggering a lesson generation with known issues and verifying that:
1. Only problematic sections are modified
2. Good sections are preserved
3. Best available content is returned even if not perfect

**Acceptance Scenarios**:

1. **Given** a lesson with 5 sections where section 2 has a factual error, **When** the judge identifies the error and triggers refinement, **Then** only section 2 is regenerated while sections 1, 3, 4, 5 remain unchanged.

2. **Given** a lesson scoring 0.78 after 3 refinement iterations with no further improvement possible, **When** max iterations are reached, **Then** the system returns the best-scoring version (0.78) with a "below_standard" quality flag and improvement hints.

3. **Given** a lesson with grammar issues in sections 2 and 4 (non-adjacent), **When** refinement executes, **Then** both sections are patched in parallel, reducing total processing time.

---

### User Story 2 - Semi-Auto with Human Escalation (Priority: P2)

An administrator monitors the content generation pipeline and wants to intervene when content quality cannot meet acceptable thresholds automatically. The system shows detailed progress and allows escalation to human review when needed.

**Why this priority**: Semi-auto mode adds control for quality-critical scenarios but requires the full-auto foundation to be in place first.

**Independent Test**: Can be tested by triggering generation with deliberately problematic content that cannot be auto-fixed, verifying escalation UI appears and human can take action.

**Acceptance Scenarios**:

1. **Given** a lesson that cannot reach 0.85 score after 3 iterations in semi-auto mode, **When** max iterations are reached, **Then** the system escalates to human review with the current best content and list of unresolved issues.

2. **Given** ongoing refinement in semi-auto mode, **When** an admin views the lesson inspector, **Then** they see the refinement plan, current iteration progress, score history chart, and locked sections.

3. **Given** an escalated lesson, **When** the admin clicks "Mark as Reviewed", **Then** the lesson is accepted with human approval and escalation is recorded in the audit log.

4. **Given** ongoing refinement in semi-auto mode, **When** an admin clicks "Intervene" button, **Then** the system pauses refinement and allows manual content editing before resuming or accepting.

5. **Given** paused refinement after "Intervene", **When** admin edits section 3 content and clicks "Resume", **Then** the system re-evaluates section 3 via Delta Judge and continues refinement from paused state with updated content.

6. **Given** paused refinement after "Intervene", **When** admin clicks "Accept Current", **Then** the system accepts content as-is with status "accepted_manual" and logs human intervention in audit trail.

---

### User Story 3 - Judge Consensus and Conflict Resolution (Priority: P2)

Multiple judges may disagree on what needs fixing. The system must consolidate their feedback, calculate inter-rater agreement, and resolve conflicts using a priority hierarchy (factual accuracy > learning objectives > structure > clarity > engagement > completeness).

**Why this priority**: Essential for targeted refinement to work correctly - without proper consolidation, fixes could conflict or cancel each other out.

**Independent Test**: Can be tested with mock judge outputs containing conflicting recommendations, verifying the Arbiter produces a coherent, prioritized fix plan.

**Acceptance Scenarios**:

1. **Given** Judge A says "add more details about funnel stages" (completeness) and Judge B says "simplify the language" (clarity), **When** Arbiter consolidates, **Then** the synthesized instruction is "Add more details about funnel stages using concise bullet points to maintain clarity" (clarity wins as higher priority, completeness becomes a constraint).

2. **Given** 3 judges with agreement score of 0.72 (moderate agreement), **When** filtering issues, **Then** only issues with 2+ judge agreement are included in the refinement plan.

3. **Given** 3 judges with agreement score below 0.67 (low agreement), **When** filtering issues, **Then** only CRITICAL severity issues are included and the plan is flagged for review.

---

### User Story 4 - Quality Regression Prevention (Priority: P3)

When fixing one issue, the system must not degrade sections that already passed evaluation. Quality locks prevent regression on criteria that met thresholds.

**Why this priority**: Important for maintaining overall quality but secondary to core fix functionality.

**Independent Test**: Can be tested by applying a fix that could potentially degrade clarity score, verifying the quality lock catches and prevents the regression.

**Acceptance Scenarios**:

1. **Given** section 3 scored 0.92 on clarity before refinement, **When** a fix is applied and clarity drops to 0.85, **Then** the quality lock triggers (regression > 0.05 tolerance) and the fix is rejected.

2. **Given** a section that has been edited twice, **When** a third edit is attempted, **Then** the section is locked to prevent oscillation and skipped in further refinement iterations.

---

### User Story 5 - Streaming Progress Updates (Priority: P3)

Users see real-time progress of the refinement process, including which sections are being fixed, iteration progress, and score changes.

**Why this priority**: Improves user experience but core functionality works without it.

**Independent Test**: Can be tested by observing UI updates during refinement, verifying events stream correctly.

**Acceptance Scenarios**:

1. **Given** refinement in progress, **When** a patch is applied to section 3, **Then** the UI receives a `patch_applied` event with the new content and diff summary.

2. **Given** full-auto mode, **When** refinement completes with best-effort result, **Then** the UI shows a warning banner indicating quality status and improvement hints.

---

### Edge Cases

- What happens when all sections require regeneration (>40% critical issues)? System falls back to full regeneration.
- How does system handle timeout (>5 minutes)? Returns best available result with quality flag.
- What if token budget (15000) is exhausted mid-iteration? Completes current task, returns best result.
- What if a section has no context anchors (first or last section)? Uses available context only.
- What if judge output lacks targetSectionId? Falls back to full section analysis.

## Requirements *(mandatory)*

### Functional Requirements

#### Arbiter (Consolidation)

- **FR-001**: System MUST consolidate issues from up to 3 judge verdicts into a unified refinement plan.
- **FR-002**: System MUST calculate inter-rater agreement using Krippendorff's Alpha for criteria scores.
- **FR-003**: System MUST filter issues based on agreement level: high agreement (>=0.80) accepts all; moderate agreement (0.67-0.80) requires 2+ judge agreement; low agreement (<0.67) accepts only CRITICAL issues.
- **FR-004**: System MUST resolve conflicting recommendations using priority hierarchy (factual_accuracy > learning_objective_alignment > pedagogical_structure > clarity_readability > engagement_examples > completeness).
- **FR-005**: System MUST synthesize actionable instructions from consolidated issues.
- **FR-006**: System MUST group tasks into execution batches where non-adjacent sections can run in parallel.
- **FR-050**: System MUST limit concurrent Patcher executions to maximum 3 parallel tasks.
- **FR-051**: System MUST execute Section-Expander tasks sequentially (not in parallel) due to context dependencies.

#### Router (Decision Logic)

- **FR-007**: System MUST route each task to SURGICAL_EDIT (Patcher) or REGENERATE_SECTION (Section-Expander) based on issue type and severity.
- **FR-008**: System MUST trigger FULL_REGENERATE when pedagogical_structure score < 0.6 OR >40% sections have CRITICAL issues.
- **FR-009**: System MUST route factual_accuracy and completeness issues with critical/major severity to REGENERATE_SECTION.
- **FR-010**: System MUST route clarity, engagement, tone issues and minor severity issues to SURGICAL_EDIT.
- **FR-049**: Router MUST flag adjacent sections (N+1) for consistency check when section N is marked for REGENERATE.

#### Patcher (Surgical Edits)

- **FR-011**: Patcher MUST receive section content, context anchors (prev/next sections), and specific fix instructions.
- **FR-012**: Patcher MUST preserve all content not explicitly targeted for fixing.
- **FR-013**: Patcher MUST maintain coherent transitions between sections using context anchors.
- **FR-014**: Patcher MUST output only the corrected section content.

#### Section-Expander (Major Regeneration)

- **FR-015**: Section-Expander MUST regenerate a single section completely based on lesson specification and fix instructions.
- **FR-016**: Section-Expander MUST use context anchors to maintain coherence with adjacent sections.
- **FR-017**: Section-Expander MUST address all issues listed in the task instructions.

#### Delta Judge (Verification)

- **FR-018**: System MUST verify each fix using heuristic validation (length check, language detection, structure).
- **FR-019**: System MUST verify each fix using Delta Judge verification ("Was issue X fixed? YES/NO").
- **FR-020**: System MUST detect quality regressions by comparing new scores against locked quality thresholds.

#### Readability Validation (Universal)

- **FR-035**: System MUST validate content readability using language-agnostic metrics: average sentence length (target 15-20 words, max 25), paragraph break ratio (min 0.08).
- **FR-036**: System MUST flag content with sentences exceeding maximum length threshold.
- **FR-037**: System MUST flag content that is too dense (insufficient paragraph breaks).

#### Iteration Control

- **FR-021**: System MUST track iteration state including score history, content snapshots, locked sections, and edit counts.
- **FR-022**: System MUST detect convergence when score improvement < 2% for 2 consecutive iterations.
- **FR-023**: System MUST lock sections after 2 edits to prevent oscillation.
- **FR-024**: System MUST enforce hard limits: max 3 iterations, max 15000 tokens, max 5 minute timeout.

#### Operation Modes

- **FR-025**: Full-Auto mode MUST accept content at score >=0.85 or >=0.75 with no critical issues (with warning).
- **FR-026**: Full-Auto mode MUST return best-effort result (highest-scoring iteration) when max iterations reached.
- **FR-052**: Best-effort result MUST generate `improvementHints` by extracting `fixInstructions` from `unresolvedIssues`.
- **FR-027**: Semi-Auto mode MUST accept content at score >=0.90 or >=0.85 with no critical issues.
- **FR-028**: Semi-Auto mode MUST escalate to human review when max iterations reached without meeting threshold.
- **FR-048**: Semi-Auto mode MUST allow user intervention to pause refinement and edit content manually.
- **FR-048a**: When user clicks "Intervene", system MUST pause after completing current task (not mid-execution).
- **FR-048b**: Paused state MUST preserve: current iteration, score history, locked sections, and pending tasks.
- **FR-048c**: After manual edit, user can either "Resume" (continue from paused state) or "Accept" (finalize with current content).
- **FR-048d**: System MUST re-evaluate edited sections via Delta Judge before resuming iteration.

#### Streaming & UI

- **FR-029**: System MUST emit streaming events for refinement progress: refinement_start, batch_started, task_started, patch_applied, verification_result, batch_complete, section_locked, iteration_complete, convergence_detected, best_effort_selected, escalation_triggered, refinement_complete.
- **FR-030**: System MUST provide refinement plan visibility including tasks, batches, estimated cost, and agreement score.
- **FR-031**: System MUST indicate best-effort results with quality status (good/acceptable/below_standard) and improvement hints.

#### Types & Integration

- **FR-032**: System MUST extend JudgeIssue with targetSectionId, fixAction, contextWindow, and fixInstructions fields.
- **FR-033**: System MUST add refinement-specific phase names (stage_6_arbiter, stage_6_patcher, stage_6_section_expander, stage_6_delta_judge) for model configuration.
- **FR-034**: System MUST maintain backward compatibility - existing clients work without refinement fields present.

#### Admin UI Integration

- **FR-038**: System MUST provide UI types for refinement task display (sectionId, actionType, priority, status, synthesizedInstructions, isLocked, editCount).
- **FR-039**: System MUST provide UI types for iteration progress display (iteration, maxIterations, scoreHistory, tasksTotal/Completed/Failed, lockedSections, qualityStatus, isConverged, tokensUsed/Limit).
- **FR-040**: System MUST provide UI types for refinement plan display (tasks, executionBatches, estimatedCost, agreementScore, agreementLevel, conflictResolutions).
- **FR-041**: System MUST provide UI types for best-effort result display (bestScore, bestIteration, qualityStatus, unresolvedIssuesCount, unresolvedCategories, improvementHints).
- **FR-042**: Admin UI MUST display refinement plan panel showing tasks grouped by execution batch.
- **FR-043**: Admin UI MUST display iteration progress chart (sparkline) showing score history.
- **FR-044**: Admin UI MUST display section lock indicators for oscillation prevention.
- **FR-045**: Admin UI MUST display best-effort warning banner for full-auto results below threshold.
- **FR-046**: Admin UI MUST provide escalation button for semi-auto mode when human review is needed.
- **FR-047**: System MUST extend log entry types to include refinement agent names (arbiter, router, patcher, section_expander, delta_judge, verifier) and refinement-specific event types.

### Key Entities

- **TargetedIssue**: Extension of JudgeIssue with targeting information (sectionId, fixAction, contextWindow, fixInstructions)
- **SectionRefinementTask**: Per-section task with synthesized instructions, context anchors, and priority
- **RefinementPlan**: Full plan with tasks, execution batches, cost estimate, and agreement score
- **RefinementIterationState**: State for convergence detection, quality locks, and section locking
- **BestEffortResult**: Result container for full-auto mode with quality status and improvement hints
- **RefinementTaskDisplay**: UI representation of a single refinement task for Admin UI
- **RefinementIterationDisplay**: UI representation of iteration progress for Admin UI
- **RefinementPlanDisplay**: UI representation of full refinement plan for Admin UI
- **BestEffortDisplay**: UI representation of best-effort result info for Admin UI
- **UniversalReadabilityMetrics**: Language-agnostic readability metrics (avgSentenceLength, avgWordLength, paragraphBreakRatio)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Token usage per refinement iteration reduced from ~6000 to ~2600 (at least 50% reduction)
- **SC-002**: Quality preservation rate >95% (sections not targeted for fixes maintain their scores)
- **SC-003**: Refinement success rate in full-auto mode >90% (including best-effort results)
- **SC-004**: Refinement success rate in semi-auto mode >85% (before escalation)
- **SC-005**: Average iterations to acceptance <2.5
- **SC-006**: Human escalation rate in semi-auto mode <10%
- **SC-007**: Non-adjacent sections processed in parallel (parallel batch execution working)
- **SC-008**: Zero regressions allowed on locked quality criteria (within 5% tolerance)

## Assumptions

1. Existing CLEV (3-judge voting) system produces structured JudgeVerdict output with issues array
2. Lessons have identifiable section structure with section IDs
3. Krippendorff's Alpha calculation can be implemented or sourced from existing package
4. BullMQ infrastructure supports parallel task execution
5. Existing streaming event infrastructure can be extended for refinement events
6. Admin UI components can be extended to show refinement-specific panels

## Out of Scope

- NLI entailment verification (Delta Judge sufficient for v1)
- Language-specific readability metrics (universal metrics used)
- Semantic caching for repeated fixes (deferred to Phase 2)
- Quality ceiling estimation (hard limits simpler)
- Autocorrelation-based oscillation detection (simple edit count sufficient)

## Clarifications

### Session 2025-12-11

- Q: Откуда генерируются `improvementHints` для best-effort результата? → A: Из `unresolvedIssues` - автоматически извлекаем `fixInstructions`
