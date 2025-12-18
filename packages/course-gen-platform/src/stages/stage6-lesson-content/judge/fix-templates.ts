/**
 * Fix Prompt Templates for Targeted Content Refinement
 * @module stages/stage6-lesson-content/judge/fix-templates
 *
 * Provides prompt templates for fixing lesson content based on judge feedback.
 * Three template types based on score range and iteration count:
 *
 * 1. Structured Refinement (scores 0.60-0.75): Full content revision with all feedback
 * 2. Targeted Section Fix (scores 0.75-0.90): Focused fixes on specific sections only
 * 3. Coherence Preserving (iteration > 1): Multi-iteration with history tracking
 *
 * Context preservation techniques:
 * - Context windowing (include surrounding paragraphs)
 * - Explicit preservation lists
 * - Terminology consistency enforcement
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (refinement templates research)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type { JudgeIssue } from '@megacampus/shared-types';
import type { JudgeCriterion } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Fix prompt template types
 *
 * - structured_refinement: For scores 0.60-0.75, significant issues requiring full revision
 * - targeted_section: For scores 0.75-0.90, localized issues in specific sections
 * - coherence_preserving: For iteration > 1, includes history and fixed issues tracking
 */
export type FixPromptType = 'structured_refinement' | 'targeted_section' | 'coherence_preserving';

/**
 * Iteration history entry for tracking refinement progress
 */
export interface IterationHistoryEntry {
  /** Feedback given in this iteration */
  feedback: string;
  /** Score achieved after this iteration */
  score: number;
}

/**
 * Context for building fix prompts
 *
 * Contains all necessary information to generate targeted fix prompts
 * while preserving context and maintaining consistency.
 */
export interface FixPromptContext {
  /** Original lesson content to be fixed */
  originalContent: string;
  /** Current evaluation score (0-1) */
  score: number;
  /** Issues identified by the judge */
  issues: JudgeIssue[];
  /** Strengths to preserve during refinement */
  strengths: string[];
  /** Lesson specification for context */
  lessonSpec: LessonSpecificationV2;
  /** History of previous iterations (for coherence preserving template) */
  iterationHistory?: IterationHistoryEntry[];
  /** Sections that should NOT be modified (preserve quality) */
  sectionsToPreserve?: string[];
  /** Sections requiring modification */
  sectionsToModify?: string[];
  /** Domain terminology to maintain consistency */
  terminology?: string[];
}

/**
 * Result from building a fix prompt
 */
export interface FixPromptResult {
  /** The generated prompt */
  prompt: string;
  /** Template type used */
  templateType: FixPromptType;
  /** Count of issues addressed */
  issuesAddressed: number;
  /** Count of sections targeted for modification */
  sectionsTargeted: number;
}

// ============================================================================
// SCORE THRESHOLDS
// ============================================================================

/**
 * Score thresholds for template selection
 */
const SCORE_THRESHOLDS = {
  /** Below this score: use structured refinement */
  STRUCTURED_REFINEMENT_MAX: 0.75,
  /** Above this score: use targeted section fix */
  TARGETED_SECTION_MIN: 0.75,
  /** Maximum score for targeted fixes (above this should accept) */
  TARGETED_SECTION_MAX: 0.90,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format issues into a structured list for prompts
 *
 * @param issues - Array of judge issues
 * @returns Formatted string of issues
 */
function formatIssues(issues: JudgeIssue[]): string {
  if (issues.length === 0) {
    return 'No specific issues identified.';
  }

  return issues
    .map((issue, index) => {
      const quotedTextSection = issue.quotedText
        ? `   Problematic text: "${issue.quotedText}"`
        : '';

      return `${index + 1}. **[${issue.criterion.toUpperCase()}]** (${issue.severity})
   Location: ${issue.location}
   Issue: ${issue.description}${quotedTextSection}
   Suggested fix: ${issue.suggestedFix}`;
    })
    .join('\n\n');
}

/**
 * Format learning objectives for prompt context
 *
 * @param lessonSpec - Lesson specification
 * @returns Formatted string of learning objectives
 */
function formatLearningObjectives(lessonSpec: LessonSpecificationV2): string {
  return lessonSpec.learning_objectives
    .map((lo) => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');
}

/**
 * Format strengths for preservation instructions
 *
 * @param strengths - Array of strength descriptions
 * @returns Formatted string for preservation
 */
function formatStrengths(strengths: string[]): string {
  if (strengths.length === 0) {
    return 'No specific strengths identified to preserve.';
  }

  return strengths.map((s) => `- ${s}`).join('\n');
}

/**
 * Format terminology list for consistency enforcement
 *
 * @param terminology - Array of domain terms
 * @returns Formatted string of terminology
 */
function formatTerminology(terminology?: string[]): string {
  if (!terminology || terminology.length === 0) {
    return 'No specific terminology requirements.';
  }

  return terminology.map((term) => `- "${term}"`).join('\n');
}

/**
 * Format iteration history for coherence tracking
 *
 * @param history - Array of iteration history entries
 * @returns Formatted string of history
 */
function formatIterationHistory(history?: IterationHistoryEntry[]): string {
  if (!history || history.length === 0) {
    return 'This is the first refinement iteration.';
  }

  return history
    .map(
      (entry, index) =>
        `**Iteration ${index + 1}** (Score: ${(entry.score * 100).toFixed(0)}%)\n${entry.feedback}`
    )
    .join('\n\n');
}

/**
 * Group issues by criterion for focused fixes
 *
 * @param issues - Array of judge issues
 * @returns Map of criterion to issues
 */
function groupIssuesByCriterion(issues: JudgeIssue[]): Map<JudgeCriterion, JudgeIssue[]> {
  const grouped = new Map<JudgeCriterion, JudgeIssue[]>();

  for (const issue of issues) {
    const existing = grouped.get(issue.criterion) || [];
    existing.push(issue);
    grouped.set(issue.criterion, existing);
  }

  return grouped;
}

/**
 * Extract critical and major issues (filtering out minor ones for targeted fixes)
 *
 * @param issues - Array of judge issues
 * @returns Filtered array of significant issues
 */
function getSignificantIssues(issues: JudgeIssue[]): JudgeIssue[] {
  return issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'major');
}

// ============================================================================
// TEMPLATE 1: STRUCTURED REFINEMENT (0.60-0.75)
// ============================================================================

/**
 * Build structured refinement prompt for scores 0.60-0.75
 *
 * This template is for content with significant issues requiring comprehensive revision.
 * It includes:
 * - Full original content
 * - All judge feedback
 * - Explicit list of strengths to preserve
 * - Detailed issues with locations and suggested fixes
 *
 * @param context - Fix prompt context
 * @returns Formatted prompt string
 */
export function buildStructuredRefinementPrompt(context: FixPromptContext): string {
  const {
    originalContent,
    score,
    issues,
    strengths,
    lessonSpec,
    terminology,
  } = context;

  const formattedIssues = formatIssues(issues);
  const formattedStrengths = formatStrengths(strengths);
  const formattedObjectives = formatLearningObjectives(lessonSpec);
  const formattedTerminology = formatTerminology(terminology);

  return `You are an expert educational content editor. Your task is to revise educational lesson content that scored ${(score * 100).toFixed(0)}%/100% on our quality rubric.

## TASK: COMPREHENSIVE CONTENT REVISION

The content requires significant improvements to meet quality standards. Address ALL identified issues while preserving successful elements.

---

## LESSON CONTEXT

**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}
**Content Archetype**: ${lessonSpec.metadata.content_archetype}
**Estimated Duration**: ${lessonSpec.estimated_duration_minutes} minutes

### Learning Objectives
${formattedObjectives}

---

## ORIGINAL CONTENT

\`\`\`markdown
${originalContent}
\`\`\`

---

## JUDGE FEEDBACK

### Issues to Address (${issues.length} total)
${formattedIssues}

### Strengths to Preserve
${formattedStrengths}

---

## REVISION REQUIREMENTS

### PRESERVE EXACTLY
The following elements are working well and MUST be retained in the revision:
${formattedStrengths}

### TERMINOLOGY CONSISTENCY
Maintain consistent usage of these domain terms:
${formattedTerminology}

### SPECIFIC REVISIONS NEEDED
Address each issue listed above with targeted improvements:
1. Fix all critical issues first (highest priority)
2. Address major issues second
3. Fix minor issues if time/space permits

### CONSTRAINTS
- Maintain the overall structure and flow
- Keep content within the target duration (${lessonSpec.estimated_duration_minutes} min)
- Preserve the ${lessonSpec.metadata.tone} tone
- Ensure all learning objectives are still covered
- Do NOT introduce new information not in the original

---

## OUTPUT FORMAT

Provide the complete revised content in markdown format. Include:
1. All sections from the original (revised as needed)
2. Brief comment at the end noting which issues were addressed

Begin your revised content:`;
}

// ============================================================================
// TEMPLATE 2: TARGETED SECTION FIX (0.75-0.90)
// ============================================================================

/**
 * Build targeted section fix prompt for scores 0.75-0.90
 *
 * This template is for content with localized issues requiring focused fixes.
 * It includes:
 * - Only affected sections (not full content)
 * - Explicit boundary context (lead-in/lead-out sentences)
 * - Terminology lock instructions
 *
 * @param context - Fix prompt context
 * @returns Formatted prompt string
 */
export function buildTargetedSectionPrompt(context: FixPromptContext): string {
  const {
    originalContent,
    score,
    issues,
    // Note: strengths available in context but not used in targeted fixes
    // as we focus only on specific sections with issues
    lessonSpec,
    sectionsToPreserve,
    sectionsToModify,
    terminology,
  } = context;

  // Get only significant issues for targeted fixes
  const significantIssues = getSignificantIssues(issues);
  const formattedIssues = formatIssues(significantIssues);
  const formattedTerminology = formatTerminology(terminology);

  // Format sections to preserve
  const preserveSections =
    sectionsToPreserve && sectionsToPreserve.length > 0
      ? sectionsToPreserve.map((s) => `- ${s}`).join('\n')
      : '- All sections not listed for modification';

  // Format sections to modify
  const modifySections =
    sectionsToModify && sectionsToModify.length > 0
      ? sectionsToModify.map((s) => `- ${s}`).join('\n')
      : '- Sections mentioned in the issues below';

  return `You are an expert educational content editor. Your task is to make TARGETED fixes to lesson content that scored ${(score * 100).toFixed(0)}%/100%.

## TASK: TARGETED SECTION FIXES

The content is mostly good but has localized issues. Make MINIMAL, FOCUSED changes to address specific problems.

---

## LESSON CONTEXT

**Title**: ${lessonSpec.title}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}

---

## SCOPE OF CHANGES

### DO NOT MODIFY (these sections are working well)
${preserveSections}

### SECTIONS TO FIX
${modifySections}

---

## CURRENT CONTENT

\`\`\`markdown
${originalContent}
\`\`\`

---

## ISSUES TO FIX (${significantIssues.length} targeted issues)

${formattedIssues}

---

## REVISION RULES

### TERMINOLOGY LOCK
These terms MUST be used exactly as specified (do not substitute synonyms):
${formattedTerminology}

### BOUNDARY PRESERVATION
When fixing a section:
1. Keep the FIRST sentence of the section as a lead-in anchor
2. Keep the LAST sentence of the section as a lead-out anchor
3. Only modify the content BETWEEN these boundaries

### MINIMAL CHANGES
- Fix ONLY the specific issues listed above
- Do NOT rewrite sections that are working well
- Do NOT add new content beyond what's needed to fix issues
- Preserve the author's voice and style

### INTEGRATION CHECK
After each fix, verify:
- Transitions flow smoothly with surrounding content
- No contradictions introduced with other sections
- Terminology remains consistent

---

## OUTPUT FORMAT

Provide ONLY the sections that need changes, in this format:

### [SECTION NAME]
[Revised section content]

### Changes Made
- [Brief note on what was fixed and why]

Begin your targeted fixes:`;
}

// ============================================================================
// TEMPLATE 3: COHERENCE PRESERVING (Iteration > 1)
// ============================================================================

/**
 * Build coherence preserving prompt for iterative refinement
 *
 * This template is for multi-iteration refinement, including:
 * - Full history: original -> feedback1 -> revision1 -> feedback2
 * - List of previously fixed issues (don't reintroduce)
 * - New issues to address this iteration
 *
 * @param context - Fix prompt context
 * @returns Formatted prompt string
 */
export function buildCoherencePreservingPrompt(context: FixPromptContext): string {
  const {
    originalContent,
    score,
    issues,
    strengths,
    lessonSpec,
    iterationHistory,
    terminology,
  } = context;

  const formattedIssues = formatIssues(issues);
  const formattedStrengths = formatStrengths(strengths);
  const formattedHistory = formatIterationHistory(iterationHistory);
  const formattedTerminology = formatTerminology(terminology);
  const formattedObjectives = formatLearningObjectives(lessonSpec);

  // Extract previously fixed issues from history
  const previouslyFixed =
    iterationHistory && iterationHistory.length > 0
      ? iterationHistory.map((h) => `- ${h.feedback.slice(0, 200)}...`).join('\n')
      : 'No previous fixes recorded.';

  const currentIteration = (iterationHistory?.length || 0) + 1;

  return `You are an expert educational content editor performing ITERATION ${currentIteration} of content refinement.

## TASK: COHERENCE-PRESERVING REFINEMENT

This is refinement iteration #${currentIteration}. The content has been revised before. Your task is to:
1. Address NEW issues identified in this evaluation
2. AVOID reintroducing previously fixed problems
3. Maintain coherence with improvements already made

---

## LESSON CONTEXT

**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}

### Learning Objectives
${formattedObjectives}

---

## REFINEMENT HISTORY

### Previous Iterations
${formattedHistory}

### Issues ALREADY FIXED (DO NOT REINTRODUCE)
${previouslyFixed}

---

## CURRENT CONTENT (from iteration ${currentIteration - 1})

\`\`\`markdown
${originalContent}
\`\`\`

Current Score: ${(score * 100).toFixed(0)}%/100%

---

## NEW ISSUES TO ADDRESS (Iteration ${currentIteration})

${formattedIssues}

---

## PRESERVATION REQUIREMENTS

### Strengths to Maintain
${formattedStrengths}

### Terminology Consistency
${formattedTerminology}

### CRITICAL: Coherence Rules
1. **No Regression**: Do NOT reintroduce any issues that were fixed in previous iterations
2. **Maintain Improvements**: Keep all positive changes from previous revisions
3. **Incremental Progress**: Each iteration should improve the score, not create new problems
4. **Context Awareness**: Consider how changes affect surrounding content

### Quality Checkpoints
Before finalizing, verify:
- [ ] All new issues are addressed
- [ ] No previously fixed issues are reintroduced
- [ ] Transitions between sections remain smooth
- [ ] Learning objectives are still fully covered
- [ ] Content tone is consistent throughout

---

## OUTPUT FORMAT

Provide the complete revised content with:
1. All improvements from previous iterations preserved
2. New fixes for current iteration issues
3. Summary of changes made in this iteration

Begin your refined content:`;
}

// ============================================================================
// TEMPLATE SELECTION
// ============================================================================

/**
 * Select appropriate fix prompt template based on score and iteration count
 *
 * Selection logic:
 * - iteration > 1: always use coherence_preserving (track history)
 * - score 0.60-0.75: use structured_refinement (comprehensive revision)
 * - score 0.75-0.90: use targeted_section (focused fixes)
 * - Issues with >3 critical/major: use structured_refinement (significant problems)
 *
 * @param score - Current evaluation score (0-1)
 * @param iterationCount - Current iteration number (1-based)
 * @param issues - Array of judge issues
 * @returns Appropriate template type
 */
export function selectFixPromptTemplate(
  score: number,
  iterationCount: number,
  issues: JudgeIssue[]
): FixPromptType {
  // Always use coherence preserving for subsequent iterations
  if (iterationCount > 1) {
    return 'coherence_preserving';
  }

  // Count significant issues (critical + major)
  const significantIssueCount = getSignificantIssues(issues).length;

  // Many significant issues -> comprehensive revision needed
  if (significantIssueCount > 3) {
    return 'structured_refinement';
  }

  // Score-based selection for first iteration
  if (score < SCORE_THRESHOLDS.STRUCTURED_REFINEMENT_MAX) {
    return 'structured_refinement';
  }

  if (score >= SCORE_THRESHOLDS.TARGETED_SECTION_MIN && score < SCORE_THRESHOLDS.TARGETED_SECTION_MAX) {
    return 'targeted_section';
  }

  // Default to structured refinement for edge cases
  return 'structured_refinement';
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Build fix prompt for content refinement
 *
 * Main entry point for generating fix prompts. Auto-selects template type
 * if not provided, based on score and iteration count.
 *
 * @param context - Fix prompt context with all necessary information
 * @param type - Optional template type override (auto-selected if not provided)
 * @returns Fix prompt result with generated prompt and metadata
 *
 * @example
 * ```typescript
 * const result = buildFixPrompt({
 *   originalContent: lessonMarkdown,
 *   score: 0.72,
 *   issues: judgeVerdict.issues,
 *   strengths: judgeVerdict.strengths,
 *   lessonSpec: lessonSpecificationV2,
 * });
 *
 * console.log(result.templateType); // 'structured_refinement'
 * console.log(result.prompt); // Generated prompt
 * ```
 */
export function buildFixPrompt(
  context: FixPromptContext,
  type?: FixPromptType
): FixPromptResult {
  // Determine iteration count from history
  const iterationCount = (context.iterationHistory?.length || 0) + 1;

  // Auto-select template type if not provided
  const templateType = type ?? selectFixPromptTemplate(
    context.score,
    iterationCount,
    context.issues
  );

  // Build prompt based on selected template
  let prompt: string;

  switch (templateType) {
    case 'structured_refinement':
      prompt = buildStructuredRefinementPrompt(context);
      break;
    case 'targeted_section':
      prompt = buildTargetedSectionPrompt(context);
      break;
    case 'coherence_preserving':
      prompt = buildCoherencePreservingPrompt(context);
      break;
    default:
      // Type safety fallback
      prompt = buildStructuredRefinementPrompt(context);
  }

  // Count sections targeted (from sectionsToModify or issues locations)
  const sectionsTargeted = context.sectionsToModify?.length ??
    new Set(context.issues.map((i) => i.location.split(',')[0])).size;

  return {
    prompt,
    templateType,
    issuesAddressed: context.issues.length,
    sectionsTargeted,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SCORE_THRESHOLDS,
  formatIssues,
  formatStrengths,
  formatIterationHistory,
  groupIssuesByCriterion,
  getSignificantIssues,
};
