/**
 * CLEV Voter helper functions - prompt building and verdict aggregation
 * @module stages/stage6-lesson-content/judge/clev-voter-helpers
 *
 * Extracted from clev-voter.ts to comply with max-lines rule.
 */

import type {
  JudgeVerdict,
  VotingMethod,
  JudgeRecommendation,
  JudgeIssue,
} from '@megacampus/shared-types';
import { getContentLabels } from '@megacampus/shared-types';
import type { CriterionConfig, OSCQRRubric } from '@megacampus/shared-types';
import type { CLEVEvaluationInput, JudgeModelConfig } from './clev-voter';

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the evaluation prompt for a judge
 */
export function buildJudgePrompt(input: CLEVEvaluationInput, rubric: OSCQRRubric): string {
  const { lessonContent, lessonSpec, ragChunks } = input;
  const labels = getContentLabels(input.language || 'en');

  // Format learning objectives
  const objectives = lessonSpec.learning_objectives
    .map((lo, i) => `- (${i + 1}) ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  // Format RAG context for fact verification
  const ragContext =
    ragChunks.length > 0
      ? ragChunks
          .slice(0, 5)
          .map(chunk => `[${chunk.document_name}]: ${chunk.content.slice(0, 500)}...`)
          .join('\n\n')
      : 'No RAG context provided.';

  // Format content for evaluation - provide full content for accurate evaluation
  // Truncation caused low quality scores because judges couldn't assess complete content
  const contentSummary = `
## ${labels.introduction}
${lessonContent.intro}

## Sections (${lessonContent.sections.length} total)
${lessonContent.sections.map(s => `### ${s.title}\n${s.content}`).join('\n\n')}

## ${labels.examples} (${lessonContent.examples.length} total)
${lessonContent.examples.map(e => `- **${e.title}**: ${e.content.slice(0, 500)}${e.content.length > 500 ? '...' : ''}`).join('\n')}

## ${labels.exercises} (${lessonContent.exercises.length} total)
${lessonContent.exercises.map(e => `- ${e.question}`).join('\n')}
`;

  // Format rubric criteria
  const rubricCriteria = rubric.criteria
    .map(
      (c: CriterionConfig) =>
        `- **${c.criterion}** (${(c.weight * 100).toFixed(0)}% weight): ${c.description}`
    )
    .join('\n');

  return `You are an expert educational content evaluator. Evaluate the following lesson content against the OSCQR-based rubric.

## LESSON SPECIFICATION

**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}
**Content Archetype**: ${lessonSpec.metadata.content_archetype}

### Learning Objectives
${objectives}

## LESSON CONTENT TO EVALUATE
${contentSummary}

## REFERENCE MATERIALS (for fact verification)
${ragContext}

## EVALUATION RUBRIC

Evaluate against these 6 criteria (scores 0.0-1.0):
${rubricCriteria}

**Passing Threshold**: ${rubric.passingThreshold}

## OUTPUT FORMAT

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": <number 0-1>,
  "passed": <boolean>,
  "confidence": "<high|medium|low>",
  "criteriaScores": {
    "learning_objective_alignment": <number 0-1>,
    "pedagogical_structure": <number 0-1>,
    "factual_accuracy": <number 0-1>,
    "clarity_readability": <number 0-1>,
    "engagement_examples": <number 0-1>,
    "completeness": <number 0-1>
  },
  "issues": [
    {
      "criterion": "<criterion_name>",
      "severity": "<critical|major|minor>",
      "location": "<where in content, e.g. sec_1, sec_2, sec_introduction>",
      "description": "<what is wrong>",
      "quotedText": "<OPTIONAL: exact text from content that has the issue, 5-30 words>",
      "suggestedFix": "<how to fix>",
      "inlineReplacement": "<OPTIONAL: exact replacement for quotedText>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"]
}

## INLINE FIX INSTRUCTIONS

For LOCAL issues (typos, incorrect facts, unclear wording) that can be fixed by simple text replacement:

1. Set \`quotedText\` to the EXACT text from the content (5-30 words, unique enough to locate)
2. Set \`inlineReplacement\` to the corrected text

Example:
{
  "criterion": "clarity_readability",
  "severity": "minor",
  "location": "sec_2",
  "description": "Jargon may confuse beginners",
  "quotedText": "синергетический эффект коллаборации",
  "suggestedFix": "Replace jargon with simpler terms",
  "inlineReplacement": "эффект совместной работы"
}

DO NOT provide inlineReplacement for:
- Structural changes (moving paragraphs)
- Adding new examples or content
- Changes requiring creativity
- Issues spanning multiple locations

## LOCATION SPECIFICITY

AVOID using "sec_global" when possible. Instead:
- If the issue appears in specific sections, name them (e.g., "sec_1", "sec_3")
- If engagement is lacking, identify WHERE examples should be added
- Only use "sec_global" for truly document-wide issues (e.g., "inconsistent tone throughout")

Evaluate objectively, focusing on educational quality and alignment with objectives.`;
}

// ============================================================================
// VOTE AGGREGATION
// ============================================================================

/**
 * Check if two scores agree within threshold
 */
export function scoresAgree(score1: number, score2: number, threshold: number): boolean {
  return Math.abs(score1 - score2) <= threshold;
}

/**
 * Aggregate verdicts using weighted mean
 *
 * Uses model weights based on historical accuracy:
 * - Formula: w_i = 1 / (1 + exp(-accuracy_i))
 * - Higher accuracy models have more influence on final score
 * - Weights are loaded from database via ModelConfigService
 *
 * @param verdicts - Array of judge verdicts
 * @param judgeModels - Optional judge model configs with weights (from selectJudgeModels)
 */
export function aggregateVerdicts(
  verdicts: JudgeVerdict[],
  judgeModels?: Record<'primary' | 'secondary' | 'tiebreaker', JudgeModelConfig>
): {
  aggregatedScore: number;
  finalRecommendation: JudgeRecommendation;
  consensusReached: boolean;
  votingMethod: VotingMethod;
} {
  if (verdicts.length === 0) {
    throw new Error('Cannot aggregate empty verdicts array');
  }

  // Get weight for a model - use provided judgeModels config or fallback to pattern matching
  const getModelWeight = (modelId: string): number => {
    // Try to find weight from provided judgeModels config
    if (judgeModels) {
      for (const config of Object.values(judgeModels)) {
        if (config.modelId === modelId) {
          return config.weight;
        }
      }
    }

    // Fallback weights for known model families (used when judgeModels not provided)
    // Ordered from most specific to generic family match
    if (modelId.includes('minimax-m2.5')) return 0.76;
    if (modelId.includes('qwen3.5') || modelId.includes('qwen/qwen3.5')) return 0.75;
    if (modelId.includes('qwen3') || modelId.includes('qwen/qwen3')) return 0.75;
    if (modelId.includes('glm-5') || modelId.includes('z-ai/glm-5')) return 0.74;
    if (modelId.includes('deepseek')) return 0.74;
    if (modelId.includes('kimi')) return 0.73;
    if (modelId.includes('minimax')) return 0.72;
    if (modelId.includes('glm')) return 0.71;
    if (modelId.includes('gemini')) return 0.68;
    return 0.7; // Default fallback weight
  };

  // Calculate weighted mean score
  let totalWeight = 0;
  let weightedSum = 0;

  for (const verdict of verdicts) {
    const weight = getModelWeight(verdict.judgeModel);
    weightedSum += verdict.overallScore * weight;
    totalWeight += weight;
  }

  const aggregatedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Majority vote for recommendation
  const recommendationCounts = new Map<JudgeRecommendation, number>();
  for (const verdict of verdicts) {
    const count = recommendationCounts.get(verdict.recommendation) || 0;
    recommendationCounts.set(verdict.recommendation, count + 1);
  }

  let finalRecommendation: JudgeRecommendation = verdicts[0].recommendation;
  let maxCount = 0;
  for (const [rec, count] of recommendationCounts) {
    if (count > maxCount) {
      maxCount = count;
      finalRecommendation = rec;
    }
  }

  // Determine voting method
  let votingMethod: VotingMethod;
  const allAgree = verdicts.every(v => v.recommendation === finalRecommendation);

  if (verdicts.length === 2 && allAgree) {
    votingMethod = 'unanimous';
  } else if (verdicts.length === 3 && allAgree) {
    votingMethod = 'unanimous';
  } else if (verdicts.length === 3) {
    votingMethod = 'tiebreaker';
  } else {
    votingMethod = 'majority';
  }

  const consensusReached = allAgree || maxCount >= Math.ceil(verdicts.length / 2);

  return {
    aggregatedScore,
    finalRecommendation,
    consensusReached,
    votingMethod,
  };
}

/**
 * Combine and deduplicate issues from multiple verdicts
 */
export function combineIssues(verdicts: JudgeVerdict[]): JudgeIssue[] {
  const seenIssues = new Set<string>();
  const combinedIssues: JudgeIssue[] = [];

  for (const verdict of verdicts) {
    for (const issue of verdict.issues) {
      // Create a key for deduplication based on criterion and description
      const issueKey = `${issue.criterion}:${issue.description.slice(0, 50)}`;
      if (!seenIssues.has(issueKey)) {
        seenIssues.add(issueKey);
        combinedIssues.push(issue);
      }
    }
  }

  // Sort by severity: critical > major > minor
  const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
  return combinedIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Combine and deduplicate strengths from multiple verdicts
 */
export function combineStrengths(verdicts: JudgeVerdict[]): string[] {
  const seenStrengths = new Set<string>();
  const combinedStrengths: string[] = [];

  for (const verdict of verdicts) {
    for (const strength of verdict.strengths) {
      // Normalize and deduplicate
      const normalizedStrength = strength.toLowerCase().trim();
      if (!seenStrengths.has(normalizedStrength)) {
        seenStrengths.add(normalizedStrength);
        combinedStrengths.push(strength);
      }
    }
  }

  return combinedStrengths;
}
