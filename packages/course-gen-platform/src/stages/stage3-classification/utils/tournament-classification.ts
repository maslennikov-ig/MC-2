/**
 * Tournament Classification Utility
 *
 * Implements two-stage tournament classification for large courses where
 * all document summaries don't fit within the classification LLM budget.
 *
 * The tournament approach:
 * 1. Divide documents into balanced groups (bin packing by token count)
 * 2. Classify each group independently, selecting top N finalists
 * 3. Run final classification on all finalists from all groups
 *
 * This ensures that documents are compared fairly even when the total
 * summary tokens exceed the available LLM context window.
 *
 * @module stages/stage2-document-processing/utils/tournament-classification
 */

import { logger } from '../../../shared/logger/index.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createOpenRouterModel } from '../../../shared/llm/langchain-models';
import { z } from 'zod';
import { DocumentPriorityLevelSchema } from '@megacampus/shared-types';
import { createModelConfigService } from '../../../shared/llm/model-config-service';

// ============================================================================
// Types
// ============================================================================

/**
 * Document ready for classification with token count
 */
export interface DocumentForClassification {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  summary: string;
  summaryTokens: number;
}

/**
 * Tournament group containing subset of documents
 */
export interface TournamentGroup {
  documents: DocumentForClassification[];
  totalTokens: number;
}

/**
 * Tournament classification plan
 */
export interface TournamentPlan {
  groups: TournamentGroup[];
  finalistsPerGroup: number;
  requiresTwoStage: boolean;
}

/**
 * Document classification result from group
 */
export interface GroupClassificationResult {
  id: string;
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  rationale: string;
  groupRank: number;
}

/**
 * Final tournament result
 */
export interface TournamentClassificationResult {
  classifications: Array<{
    id: string;
    priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
    rationale: string;
  }>;
}

// ============================================================================
// LLM Schemas
// ============================================================================

const GroupDocumentClassificationSchema = z.object({
  id: z.string().uuid(),
  priority: DocumentPriorityLevelSchema,
  rationale: z.string().min(10),
  rank: z.number().int().min(1),
});

const GroupClassificationResponseSchema = z.object({
  classifications: z.array(GroupDocumentClassificationSchema).min(1),
});

// ============================================================================
// Helper Functions - Model Configuration
// ============================================================================

/**
 * Get model configuration for classification from database
 * Falls back to hardcoded values if database unavailable
 */
async function getClassificationModelConfig() {
  const modelConfigService = createModelConfigService();
  const config = await modelConfigService.getModelForPhase('stage_3_classification');
  return {
    modelId: config.modelId,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

// ============================================================================
// Planning Functions
// ============================================================================

/**
 * Plan tournament classification strategy
 *
 * Determines if two-stage classification is needed and how to divide
 * documents into balanced groups.
 *
 * @param documents - Documents with token counts
 * @param availableBudget - Available token budget for classification input
 * @returns Tournament plan with groups and finalists count
 *
 * @example
 * ```typescript
 * const plan = planTournamentClassification(documents, 100_000);
 * if (plan.requiresTwoStage) {
 *   console.log(`Need ${plan.groups.length} groups`);
 *   console.log(`${plan.finalistsPerGroup} finalists per group`);
 * }
 * ```
 */
export function planTournamentClassification(
  documents: DocumentForClassification[],
  availableBudget: number
): TournamentPlan {
  const totalTokens = documents.reduce((sum, d) => sum + d.summaryTokens, 0);

  logger.debug({
    totalTokens,
    availableBudget,
    documentCount: documents.length,
  }, '[Tournament] Planning classification strategy');

  // If all summaries fit in budget, use single-stage classification
  if (totalTokens <= availableBudget) {
    logger.info(
      { totalTokens, availableBudget },
      '[Tournament] Single-stage classification (all summaries fit in budget)'
    );
    return {
      groups: [{ documents, totalTokens }],
      finalistsPerGroup: documents.length,
      requiresTwoStage: false,
    };
  }

  // Calculate number of groups needed
  const numGroups = Math.ceil(totalTokens / availableBudget);

  logger.info({
    totalTokens,
    availableBudget,
    numGroups,
  }, '[Tournament] Two-stage classification required');

  // Sort by tokens DESC for bin packing (largest first)
  const sorted = [...documents].sort((a, b) => b.summaryTokens - a.summaryTokens);

  // Greedy bin packing for balanced groups
  const groups: TournamentGroup[] = Array.from({ length: numGroups }, () => ({
    documents: [],
    totalTokens: 0,
  }));

  for (const doc of sorted) {
    // Find group with minimum tokens
    const minGroup = groups.reduce((min, g) =>
      g.totalTokens < min.totalTokens ? g : min
    );
    minGroup.documents.push(doc);
    minGroup.totalTokens += doc.summaryTokens;
  }

  // Calculate finalists per group
  // Goal: final classification should fit in budget
  // Each group sends its top N finalists to the final round
  const avgTokensPerDoc = totalTokens / documents.length;
  const maxFinalists = Math.floor(availableBudget / avgTokensPerDoc);
  const finalistsPerGroup = Math.max(2, Math.floor(maxFinalists / numGroups));

  logger.info({
    numGroups,
    finalistsPerGroup,
    avgTokensPerDoc,
    groupSizes: groups.map(g => g.documents.length),
  }, '[Tournament] Classification plan created');

  return {
    groups,
    finalistsPerGroup,
    requiresTwoStage: true,
  };
}

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Execute tournament classification
 *
 * Runs two-stage classification:
 * 1. Group stage: Classify each group independently
 * 2. Final stage: Classify all finalists together
 *
 * @param plan - Tournament plan from planTournamentClassification
 * @param courseContext - Course title and description for context
 * @returns Final classification results for all documents
 *
 * @example
 * ```typescript
 * const plan = planTournamentClassification(documents, 100_000);
 * const results = await executeTournamentClassification(plan, {
 *   title: 'Machine Learning',
 *   description: 'Introduction to ML'
 * });
 * ```
 */
export async function executeTournamentClassification(
  plan: TournamentPlan,
  courseContext: { title: string; description: string }
): Promise<TournamentClassificationResult> {
  logger.info({
    requiresTwoStage: plan.requiresTwoStage,
    groupCount: plan.groups.length,
  }, '[Tournament] Starting classification execution');

  // Single-stage classification (all documents fit)
  if (!plan.requiresTwoStage) {
    logger.debug('[Tournament] Executing single-stage classification');
    return await executeSingleStageClassification(
      plan.groups[0].documents,
      courseContext
    );
  }

  // Two-stage classification
  logger.info({
    groupCount: plan.groups.length,
    finalistsPerGroup: plan.finalistsPerGroup,
  }, '[Tournament] Starting group stage classification');

  // Stage 1: Classify each group
  const allGroupResults: GroupClassificationResult[] = [];

  for (let i = 0; i < plan.groups.length; i++) {
    const group = plan.groups[i];
    logger.info({
      groupIndex: i,
      documentCount: group.documents.length,
      totalTokens: group.totalTokens,
    }, `[Tournament] Classifying group ${i + 1}/${plan.groups.length}`);

    const groupResults = await classifyDocumentGroup(
      group.documents,
      courseContext,
      i
    );

    allGroupResults.push(...groupResults);
  }

  // Stage 2: Select finalists from each group
  const finalists = selectFinalists(allGroupResults, plan.finalistsPerGroup);

  logger.info({
    finalistCount: finalists.length,
    expectedCount: plan.groups.length * plan.finalistsPerGroup,
  }, '[Tournament] Starting final classification');

  // Stage 3: Final classification of all finalists
  const finalistDocuments = finalists.map(f =>
    plan.groups
      .flatMap(g => g.documents)
      .find(d => d.id === f.id)!
  );

  const finalResults = await executeSingleStageClassification(
    finalistDocuments,
    courseContext
  );

  // Merge final results with non-finalists
  const finalClassifications = mergeResults(
    finalResults,
    allGroupResults,
    finalists.map(f => f.id)
  );

  logger.info({
    totalDocuments: finalClassifications.classifications.length,
  }, '[Tournament] Classification complete');

  return finalClassifications;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Execute single-stage classification (no tournament)
 */
async function executeSingleStageClassification(
  documents: DocumentForClassification[],
  courseContext: { title: string; description: string }
): Promise<TournamentClassificationResult> {
  const modelConfig = await getClassificationModelConfig();
  const model = createOpenRouterModel(
    modelConfig.modelId,
    modelConfig.temperature,
    modelConfig.maxTokens
  );

  const structuredModel = model.withStructuredOutput(
    GroupClassificationResponseSchema
  );

  const [systemMsg, humanMsg] = buildClassificationPrompt(
    documents,
    courseContext,
    documents.length // All documents
  );

  const response = await structuredModel.invoke([systemMsg, humanMsg]);

  return {
    classifications: response.classifications.map(c => ({
      id: c.id,
      priority: c.priority,
      rationale: c.rationale,
    })),
  };
}

/**
 * Classify documents within a single group
 */
async function classifyDocumentGroup(
  documents: DocumentForClassification[],
  courseContext: { title: string; description: string },
  groupIndex: number
): Promise<GroupClassificationResult[]> {
  const modelConfig = await getClassificationModelConfig();
  const model = createOpenRouterModel(
    modelConfig.modelId,
    modelConfig.temperature,
    modelConfig.maxTokens
  );

  const structuredModel = model.withStructuredOutput(
    GroupClassificationResponseSchema
  );

  const [systemMsg, humanMsg] = buildClassificationPrompt(
    documents,
    courseContext,
    documents.length // Classify all in group
  );

  const response = await structuredModel.invoke([systemMsg, humanMsg]);

  return response.classifications.map(c => ({
    id: c.id,
    priority: c.priority,
    rationale: `[Group ${groupIndex + 1}] ${c.rationale}`,
    groupRank: c.rank,
  }));
}

/**
 * Build classification prompt for LLM
 */
function buildClassificationPrompt(
  documents: DocumentForClassification[],
  courseContext: { title: string; description: string },
  _selectTopN: number
): [SystemMessage, HumanMessage] {
  const systemMessage = new SystemMessage(`You are a document classification expert for educational content.

TASK: Classify documents by importance for course generation using COMPARATIVE ranking.

PRIORITY LEVELS:
- CORE: The single most important document (exactly 1). This is THE primary course material.
- IMPORTANT: Key supporting documents (~30% of total). Critical references that significantly enhance course quality.
- SUPPLEMENTARY: Additional materials (remaining). Nice-to-have content that provides extra context but isn't essential.

REQUIREMENTS:
- Exactly 1 document must be CORE
- Approximately 30% should be IMPORTANT
- Remaining documents are SUPPLEMENTARY
- Rank each document (1 = most important)
- You must classify ALL ${documents.length} documents provided

OUTPUT FORMAT:
Return JSON with "classifications" array containing ALL documents.
Each classification: id (UUID), priority (CORE/IMPORTANT/SUPPLEMENTARY), rationale (brief), rank (1-${documents.length}).

Be decisive and comparative. Don't mark everything as important - truly distinguish essential versus supplementary.`);

  const documentDescriptions = documents
    .map(
      (doc, index) => `
[Document ${index + 1}]
ID: ${doc.id}
Filename: ${doc.filename}
File Type: ${doc.mime_type}
Summary (${doc.summaryTokens} tokens):
${doc.summary.substring(0, 2000)}${doc.summary.length > 2000 ? '...[truncated]' : ''}
---`
    )
    .join('\n');

  const humanMessage = new HumanMessage(`COURSE CONTEXT:
Title: ${courseContext.title || 'Not specified'}
Description: ${courseContext.description || 'Not specified'}

DOCUMENTS TO CLASSIFY (${documents.length} total):
${documentDescriptions}

Classify ALL ${documents.length} documents comparatively with rankings.`);

  return [systemMessage, humanMessage];
}

/**
 * Select top N finalists from each group based on rank
 */
function selectFinalists(
  allResults: GroupClassificationResult[],
  finalistsPerGroup: number
): GroupClassificationResult[] {
  // Group by group index (extracted from rationale)
  const resultsByGroup = new Map<number, GroupClassificationResult[]>();

  for (const result of allResults) {
    const groupMatch = result.rationale.match(/\[Group (\d+)\]/);
    const groupIndex = groupMatch ? parseInt(groupMatch[1]) - 1 : 0;

    if (!resultsByGroup.has(groupIndex)) {
      resultsByGroup.set(groupIndex, []);
    }
    resultsByGroup.get(groupIndex)!.push(result);
  }

  // Select top N from each group by rank
  const finalists: GroupClassificationResult[] = [];

  for (const [groupIndex, results] of resultsByGroup) {
    const sortedByRank = results.sort((a, b) => a.groupRank - b.groupRank);
    const topN = sortedByRank.slice(0, finalistsPerGroup);

    logger.debug({
      groupIndex,
      selectedCount: topN.length,
      topDocuments: topN.map(f => ({ id: f.id, rank: f.groupRank })),
    }, '[Tournament] Selected finalists from group');

    finalists.push(...topN);
  }

  return finalists;
}

/**
 * Merge final classification results with non-finalists
 */
function mergeResults(
  finalResults: TournamentClassificationResult,
  allGroupResults: GroupClassificationResult[],
  finalistIds: string[]
): TournamentClassificationResult {
  const classifications = [];

  // Add final results for finalists
  classifications.push(...finalResults.classifications);

  // Add SUPPLEMENTARY results for non-finalists
  for (const groupResult of allGroupResults) {
    if (!finalistIds.includes(groupResult.id)) {
      classifications.push({
        id: groupResult.id,
        priority: 'SUPPLEMENTARY' as const,
        rationale: `[Non-finalist] ${groupResult.rationale}`,
      });
    }
  }

  return { classifications };
}
