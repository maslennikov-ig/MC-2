/**
 * Main Arbiter consolidation logic
 * @module stages/stage6-lesson-content/judge/arbiter/consolidate-verdicts
 *
 * Consolidates verdicts from multiple judges (CLEV voting) into a unified RefinementPlan.
 *
 * Process:
 * 1. Extract all JudgeIssues from all verdicts
 * 2. Calculate Krippendorff's Alpha agreement score
 * 3. Filter issues based on agreement level
 * 4. Resolve conflicts using PRIORITY_HIERARCHY
 * 5. Convert to TargetedIssues with section targeting
 * 6. Group into SectionRefinementTasks
 * 7. Create execution batches for parallel processing
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/data-model.md
 * - specs/018-judge-targeted-refinement/research.md
 */

import type {
  ArbiterInput,
  ArbiterOutput,
  JudgeIssue,
  TargetedIssue,
  SectionRefinementTask,
  RefinementPlan,
  TaskPriority,
  FixAction,
  ContextScope,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';
import { calculateAgreementScore } from './krippendorff';
import { resolveConflicts } from './conflict-resolver';
import { parseSectionIndex, extractSectionIdFromLocation } from './section-utils';
import { randomUUID } from 'node:crypto';

/**
 * Consolidate verdicts from multiple judges into a unified RefinementPlan
 *
 * @param input - ArbiterInput with clevResult, lessonContent, operationMode
 * @returns ArbiterOutput with plan, agreement info, accepted/rejected issues
 */
export async function consolidateVerdicts(input: ArbiterInput): Promise<ArbiterOutput> {
  const startTime = Date.now();

  // Extract all issues from all verdicts
  const allIssues = input.clevResult.verdicts.flatMap((v) => v.issues);

  // Calculate Krippendorff's Alpha agreement score
  const agreement = calculateAgreementScore(input.clevResult.verdicts);

  // Filter and resolve conflicts
  const { accepted, rejected, log } = resolveConflicts(allIssues, agreement.score);

  // Convert to TargetedIssues with targeting info
  const targetedIssues = convertToTargetedIssues(accepted, input.lessonContent);

  // Group by section into SectionRefinementTasks
  const tasks = groupIntoTasks(targetedIssues);

  // Create execution batches (non-adjacent sections can run in parallel)
  const batches = createExecutionBatches(tasks);

  // Identify sections to preserve (no issues) and modify (have issues)
  const sectionsToModify = [...new Set(targetedIssues.map((i) => i.targetSectionId))];
  const allSectionIds = extractAllSectionIds(input.lessonContent);
  const sectionsToPreserve = allSectionIds.filter((id) => !sectionsToModify.includes(id));

  // Build RefinementPlan
  const plan: RefinementPlan = {
    status: 'PENDING',
    issues: accepted,
    sectionsToPreserve,
    sectionsToModify,
    preserveTerminology: [],
    iterationHistory: [],
    tasks,
    estimatedCost: estimateTokenCost(tasks),
    agreementScore: agreement.score,
    conflictResolutions: log,
    executionBatches: batches,
  };

  // Convert rejected issues to TargetedIssues for output
  const rejectedTargeted = convertToTargetedIssues(rejected, input.lessonContent);

  return {
    plan,
    agreementScore: agreement.score,
    agreementLevel: agreement.level,
    acceptedIssues: targetedIssues,
    rejectedIssues: rejectedTargeted,
    tokensUsed: 0, // No LLM call in Arbiter
    durationMs: Date.now() - startTime,
  };
}

/**
 * Convert JudgeIssues to TargetedIssues with targeting information
 *
 * Adds:
 * - Unique issue ID
 * - Target section ID (extracted from location)
 * - Recommended fix action (SURGICAL_EDIT or REGENERATE_SECTION)
 * - Context anchors for surgical edits
 * - Specific fix instructions
 */
function convertToTargetedIssues(
  issues: JudgeIssue[],
  lessonContent: ArbiterInput['lessonContent']
): TargetedIssue[] {
  return issues.map((issue) => {
    // Extract target section ID from location
    const targetSectionId = extractSectionId(issue.location, lessonContent);

    // Determine fix action based on severity and criterion
    const fixAction = determineFixAction(issue);

    // Determine context scope
    const contextScope = determineContextScope(issue);

    // Extract context window anchors
    const contextWindow = extractContextWindow(issue, contextScope);

    // Build fix instructions
    const fixInstructions = buildFixInstructions(issue);

    const targeted: TargetedIssue = {
      ...issue,
      id: randomUUID(),
      targetSectionId,
      fixAction,
      contextWindow,
      fixInstructions,
    };

    return targeted;
  });
}

/**
 * Interface for lesson content sections
 */
interface LessonSection {
  title?: string;
  content?: string;
}

/**
 * Interface for lesson content structure
 */
interface LessonContentStructure {
  sections?: LessonSection[];
}

/**
 * Extract section ID from location string
 *
 * Examples:
 * - "section 2" → "sec_2"
 * - "Introduction" → "sec_introduction"
 * - "Section 3, paragraph 2" → "sec_3"
 */
function extractSectionId(location: string, lessonContent: ArbiterInput['lessonContent']): string {
  // Extract section titles for matching
  const contentStructure = lessonContent as LessonContentStructure;
  const sections = contentStructure.sections || [];
  const sectionTitles = sections.map((s) => s.title || '');

  // Use shared utility
  return extractSectionIdFromLocation(location, sectionTitles);
}

/**
 * Extract all section IDs from lesson content
 */
function extractAllSectionIds(lessonContent: ArbiterInput['lessonContent']): string[] {
  const contentStructure = lessonContent as LessonContentStructure;
  const sections = contentStructure.sections || [];
  return sections.map((_, i) => `sec_${i + 1}`);
}

/**
 * Determine fix action based on issue severity and criterion
 *
 * Decision matrix:
 * - Minor severity + tone/clarity issue → SURGICAL_EDIT
 * - Major severity + factual error → REGENERATE_SECTION
 * - Critical severity + structural issue → REGENERATE_SECTION (may escalate to FULL_REGENERATE in Router)
 */
function determineFixAction(issue: JudgeIssue): FixAction {
  // Factual errors always require regeneration
  if (issue.criterion === 'factual_accuracy') {
    return 'REGENERATE_SECTION';
  }

  // Structural issues require regeneration
  if (issue.criterion === 'pedagogical_structure' || issue.criterion === 'learning_objective_alignment') {
    if (issue.severity === 'critical') {
      return 'REGENERATE_SECTION';
    }
  }

  // Minor clarity/engagement issues can be surgically edited
  if (
    issue.severity === 'minor' &&
    (issue.criterion === 'clarity_readability' || issue.criterion === 'engagement_examples')
  ) {
    return 'SURGICAL_EDIT';
  }

  // Completeness issues usually require regeneration
  if (issue.criterion === 'completeness') {
    return 'REGENERATE_SECTION';
  }

  // Default: surgical edit for other cases
  return 'SURGICAL_EDIT';
}

/**
 * Determine context scope for surgical edits
 */
function determineContextScope(issue: JudgeIssue): ContextScope {
  // If quoted text provided, scope to paragraph
  if (issue.quotedText && issue.quotedText.length > 10) {
    return 'paragraph';
  }

  // Structural/alignment issues need section context
  if (
    issue.criterion === 'pedagogical_structure' ||
    issue.criterion === 'learning_objective_alignment' ||
    issue.criterion === 'completeness'
  ) {
    return 'section';
  }

  // Default to paragraph scope
  return 'paragraph';
}

/**
 * Extract context window anchors for surgical edits
 */
function extractContextWindow(issue: JudgeIssue, scope: ContextScope) {
  return {
    startQuote: issue.quotedText ? issue.quotedText.slice(0, 100) : undefined,
    endQuote: issue.quotedText ? issue.quotedText.slice(-100) : undefined,
    scope,
  };
}

/**
 * Build fix instructions from issue
 */
function buildFixInstructions(issue: JudgeIssue): string {
  return `[${issue.criterion}] ${issue.severity.toUpperCase()}: ${issue.description}\n\nSuggested fix: ${issue.suggestedFix}`;
}

/**
 * Group TargetedIssues into SectionRefinementTasks
 *
 * Consolidates multiple issues for the same section into a single task
 * with synthesized instructions.
 */
function groupIntoTasks(issues: TargetedIssue[]): SectionRefinementTask[] {
  // Group by section
  const sectionGroups = new Map<string, TargetedIssue[]>();

  for (const issue of issues) {
    const existing = sectionGroups.get(issue.targetSectionId) || [];
    existing.push(issue);
    sectionGroups.set(issue.targetSectionId, existing);
  }

  // Create tasks
  const tasks: SectionRefinementTask[] = [];

  for (const [sectionId, sectionIssues] of sectionGroups) {
    // Determine action type (REGENERATE if any issue requires it)
    const actionType = sectionIssues.some((i) => i.fixAction === 'REGENERATE_SECTION')
      ? 'REGENERATE_SECTION'
      : 'SURGICAL_EDIT';

    // Determine priority (highest severity wins)
    const priority = determineTaskPriority(sectionIssues);

    // Synthesize instructions
    const synthesizedInstructions = synthesizeInstructions(sectionIssues);

    // Extract section title (would come from lessonContent in real implementation)
    const sectionTitle = `Section ${sectionId.replace('sec_', '')}`;

    // Create task
    const task: SectionRefinementTask = {
      sectionId,
      sectionTitle,
      actionType: actionType as 'SURGICAL_EDIT' | 'REGENERATE_SECTION',
      synthesizedInstructions,
      contextAnchors: {
        prevSectionEnd: undefined, // Filled by executor
        nextSectionStart: undefined, // Filled by executor
      },
      priority,
      sourceIssues: sectionIssues,
    };

    tasks.push(task);
  }

  // Sort by priority
  return tasks.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
}

/**
 * Determine task priority from issues
 */
function determineTaskPriority(issues: TargetedIssue[]): TaskPriority {
  if (issues.some((i) => i.severity === 'critical')) {
    return 'critical';
  }
  if (issues.some((i) => i.severity === 'major')) {
    return 'major';
  }
  return 'minor';
}

/**
 * Get priority rank (higher = more important)
 */
function priorityRank(priority: TaskPriority): number {
  const ranks: Record<TaskPriority, number> = {
    critical: 3,
    major: 2,
    minor: 1,
  };
  return ranks[priority];
}

/**
 * Synthesize instructions from multiple issues
 */
function synthesizeInstructions(issues: TargetedIssue[]): string {
  const lines: string[] = [];

  lines.push('Address the following issues in this section:');
  lines.push('');

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    lines.push(`${i + 1}. [${issue.criterion}] ${issue.severity.toUpperCase()}`);
    lines.push(`   Description: ${issue.description}`);
    lines.push(`   Suggested fix: ${issue.suggestedFix}`);
    if (issue.quotedText) {
      lines.push(`   Quoted text: "${issue.quotedText.slice(0, 100)}..."`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create execution batches for parallel processing
 *
 * Constraint: Non-adjacent sections can run in parallel (sections i and i±1 cannot run together)
 * Uses greedy coloring algorithm to maximize parallelism.
 *
 * @param tasks - SectionRefinementTasks sorted by priority
 * @returns Array of batches, where each batch contains tasks that can run in parallel
 */
function createExecutionBatches(tasks: SectionRefinementTask[]): SectionRefinementTask[][] {
  if (tasks.length === 0) {
    return [];
  }

  const batches: SectionRefinementTask[][] = [];
  const maxConcurrent = REFINEMENT_CONFIG.parallel.maxConcurrentPatchers;

  for (const task of tasks) {
    const sectionIdx = parseSectionIndex(task.sectionId);

    // Try to add to existing batch
    let addedToExisting = false;
    for (const batch of batches) {
      if (batch.length >= maxConcurrent) {
        continue; // Batch full
      }

      // Check if task can be added (non-adjacent constraint)
      const canAdd = batch.every((t) => {
        const tIdx = parseSectionIndex(t.sectionId);
        return Math.abs(tIdx - sectionIdx) > 1; // Adjacent gap = 1
      });

      if (canAdd) {
        batch.push(task);
        addedToExisting = true;
        break;
      }
    }

    // Create new batch if couldn't add to existing
    if (!addedToExisting) {
      batches.push([task]);
    }
  }

  return batches;
}


/**
 * Estimate token cost for refinement tasks
 *
 * Uses token cost estimates from REFINEMENT_CONFIG.tokenCosts
 */
function estimateTokenCost(tasks: SectionRefinementTask[]): number {
  let totalCost = 0;

  for (const task of tasks) {
    if (task.actionType === 'SURGICAL_EDIT') {
      // Patcher: ~800 tokens avg
      totalCost += (REFINEMENT_CONFIG.tokenCosts.patcher.min + REFINEMENT_CONFIG.tokenCosts.patcher.max) / 2;
    } else {
      // Section-Expander: ~1500 tokens avg
      totalCost +=
        (REFINEMENT_CONFIG.tokenCosts.sectionExpander.min + REFINEMENT_CONFIG.tokenCosts.sectionExpander.max) / 2;
    }

    // Add Delta Judge verification cost
    totalCost += (REFINEMENT_CONFIG.tokenCosts.deltaJudge.min + REFINEMENT_CONFIG.tokenCosts.deltaJudge.max) / 2;
  }

  return Math.round(totalCost);
}
