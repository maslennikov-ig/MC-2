import { extractJSON, safeJSONParse } from '@/shared/workspace-utils';
import { logger } from '@/shared/logger';
import {
  CareerPlaybookRoleProfileSpecSchema,
  type CareerPlaybookNodeCost,
  type CareerPlaybookQAData,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS,
  findCanonicalBlocksForTopic,
  normalizeTopicKey,
  topicMatchesBlock,
} from '@/shared/prompts/career-playbook-block-topics';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';
import {
  buildCareerPlaybookResearchQueries,
  runCareerPlaybookWebResearch,
  type RunCareerPlaybookWebResearchOptions,
} from '../rag/web-research';
import {
  formatCareerPlaybookBusinessContextDigest,
  formatCareerPlaybookBusinessContextMissingSignals,
  getCareerPlaybookBusinessContext,
  loadCareerPlaybookBusinessContextSourceExcerpts,
} from './business-context';
import { createCareerPlaybookRuntime, type CareerPlaybookRuntime } from './runtime';

export { buildCareerPlaybookResearchQueries, runCareerPlaybookWebResearch };

const SPEC_BUILDER_PROMPT_KEY = 'career_playbook_spec_builder';
const SPEC_BUILDER_PHASE = 'stage_career_playbook_spec';

function joinInsights(values: string[]): string {
  return values.length > 0 ? values.map(value => `- ${value}`).join('\n') : '- none';
}

function buildNodeCost(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs?: number;
  attemptCount?: number;
}): CareerPlaybookNodeCost {
  return {
    node: 'specBuilder',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
    duration_ms: result.durationMs,
    attempts: result.attemptCount,
  };
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildRoleProfileSpecRepairPrompt(basePrompt: string, validationError: unknown): string {
  return `${basePrompt}

Previous RoleProfileSpec response failed validation:
${errorMessageFrom(validationError)}

Return ONLY valid JSON. It must be an object with this shape; replace placeholder strings with real values:
{
  "position": { "title": "...", "slug": "...", "department": "...", "level": "middle", "specialization": "..." },
  "context": { "company_stage": "growth", "team_size": "51-200", "reports_to": "...", "has_subordinates": false, "subordinates_description": "...", "industry": "...", "region": "..." },
  "focus_areas": { "primary_kpis": ["..."], "key_tools": ["..."], "critical_competencies": ["..."], "anti_goals": ["..."], "failure_patterns": ["..."] },
  "research": { "kpis_insights": ["..."], "trends_insights": ["..."], "onboarding_insights": ["..."], "sources": ["..."] },
  "block_boundaries": { "block_1": { "primary_topics": ["..."], "do_not_repeat": ["..."] } },
  "content_language": "ru"
}

Allowed level values: junior, middle, senior, lead, director, c-level.
Allowed company_stage values: pre-pmf, growth, scale, mature.
Allowed team_size values: 1-10, 11-50, 51-200, 201-1000, 1000+.
Do not use arrays for block_boundaries. Do not use strings where an object is required.`;
}

export function parseRoleProfileSpecFromLLM(rawContent: string): CareerPlaybookRoleProfileSpec {
  const extractedJson = extractJSON(rawContent);
  const parsed = safeJSONParse(extractedJson);
  return CareerPlaybookRoleProfileSpecSchema.parse(normalizeRoleProfileSpecCandidate(parsed));
}

function dropEmptyOptionalString(record: Record<string, unknown>, key: string): void {
  const value = record[key];
  if (value === null || (typeof value === 'string' && value.trim().length === 0)) {
    delete record[key];
  }
}

function normalizeRoleProfileSpecCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;

  const normalized = candidate as Record<string, unknown>;
  if (
    normalized.position &&
    typeof normalized.position === 'object' &&
    !Array.isArray(normalized.position)
  ) {
    dropEmptyOptionalString(normalized.position as Record<string, unknown>, 'specialization');
  }
  if (
    normalized.context &&
    typeof normalized.context === 'object' &&
    !Array.isArray(normalized.context)
  ) {
    const context = normalized.context as Record<string, unknown>;
    dropEmptyOptionalString(context, 'subordinates_description');
    dropEmptyOptionalString(context, 'industry');
    dropEmptyOptionalString(context, 'region');
  }

  return normalized;
}

type CareerPlaybookBlockBoundary = CareerPlaybookRoleProfileSpec['block_boundaries'][string];

export type CareerPlaybookBlockTopicDeviationKind =
  | 'missing'
  | 'missing_anchor'
  | 'cross_assignment';

export interface CareerPlaybookBlockTopicDeviation {
  blockId: string;
  kind: CareerPlaybookBlockTopicDeviationKind;
  expectedTopic: string;
  actualTopics: string[];
  /** For cross_assignment: block ids whose canonical topic the spec borrowed. */
  conflictingBlockIds?: string[];
}

/**
 * Detect where RoleProfileSpec.block_boundaries drifts from the canonical
 * 26-block layout: a block missing entirely, a block that lost its own topic,
 * or a block that borrowed another block id's canonical topic.
 */
export function findCanonicalBlockTopicDeviations(
  spec: CareerPlaybookRoleProfileSpec
): CareerPlaybookBlockTopicDeviation[] {
  const boundaries = spec.block_boundaries ?? {};
  const deviations: CareerPlaybookBlockTopicDeviation[] = [];

  for (const entry of CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS) {
    const boundary = boundaries[entry.blockId];
    if (!boundary) {
      deviations.push({
        blockId: entry.blockId,
        kind: 'missing',
        expectedTopic: entry.primaryTopic,
        actualTopics: [],
      });
      continue;
    }

    const primaryTopics = boundary.primary_topics ?? [];
    const hasAnchor = primaryTopics.some(topic => topicMatchesBlock(topic, entry));
    if (!hasAnchor) {
      deviations.push({
        blockId: entry.blockId,
        kind: 'missing_anchor',
        expectedTopic: entry.primaryTopic,
        actualTopics: primaryTopics,
      });
    }

    const conflicting = new Set<string>();
    for (const topic of primaryTopics) {
      if (topicMatchesBlock(topic, entry)) continue;
      for (const other of findCanonicalBlocksForTopic(topic, entry.blockId)) {
        conflicting.add(other.blockId);
      }
    }
    if (conflicting.size > 0) {
      deviations.push({
        blockId: entry.blockId,
        kind: 'cross_assignment',
        expectedTopic: entry.primaryTopic,
        actualTopics: primaryTopics,
        conflictingBlockIds: [...conflicting],
      });
    }
  }

  return deviations;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function dedupeByTopicKey(topics: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const topic of topics) {
    const key = normalizeTopicKey(topic);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(topic);
  }
  return result;
}

export interface NormalizeCanonicalBlockTopicsResult {
  spec: CareerPlaybookRoleProfileSpec;
  changedBlockIds: string[];
}

/**
 * Rebuild block_boundaries onto the canonical 26-block layout. Every content
 * block gets its canonical topic as the anchor primary topic; role-specific
 * wording that still belongs to the block is preserved, topics that belong to
 * another block id are dropped, and do_not_repeat keeps only cross-block guards.
 * The result is canonical by construction and re-validated against the schema;
 * on any unexpected failure the original (already valid) spec is returned so
 * normalization can never produce an invalid spec.
 */
export function normalizeRoleProfileSpecToCanonicalBlockTopics(
  spec: CareerPlaybookRoleProfileSpec
): NormalizeCanonicalBlockTopicsResult {
  const previousBoundaries = spec.block_boundaries ?? {};
  const nextBoundaries: Record<string, CareerPlaybookBlockBoundary> = {};
  const changedBlockIds: string[] = [];

  for (const entry of CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS) {
    const previous = previousBoundaries[entry.blockId];
    const previousPrimary = previous?.primary_topics ?? [];
    const previousDoNotRepeat = previous?.do_not_repeat ?? [];

    const anchorKey = normalizeTopicKey(entry.primaryTopic);
    const keptRefinements = previousPrimary.filter(
      topic => topicMatchesBlock(topic, entry) && normalizeTopicKey(topic) !== anchorKey
    );
    const primary_topics = dedupeByTopicKey([entry.primaryTopic, ...keptRefinements]);
    const do_not_repeat = dedupeByTopicKey(
      previousDoNotRepeat.filter(topic => !topicMatchesBlock(topic, entry))
    );

    nextBoundaries[entry.blockId] = { primary_topics, do_not_repeat };

    const changed =
      !previous ||
      !arraysEqual(previous.primary_topics ?? [], primary_topics) ||
      !arraysEqual(previous.do_not_repeat ?? [], do_not_repeat);
    if (changed) changedBlockIds.push(entry.blockId);
  }

  // Any non-canonical (e.g. hallucinated) block ids the model produced are
  // dropped by rebuilding from the canonical set; record them as changes.
  for (const key of Object.keys(previousBoundaries)) {
    if (!(key in nextBoundaries) && !changedBlockIds.includes(key)) {
      changedBlockIds.push(key);
    }
  }

  const candidate: CareerPlaybookRoleProfileSpec = {
    ...spec,
    block_boundaries: nextBoundaries,
  };

  const parsed = CareerPlaybookRoleProfileSpecSchema.safeParse(candidate);
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error.message },
      'career playbook canonical block-topic normalization produced an invalid spec; keeping original'
    );
    return { spec, changedBlockIds: [] };
  }

  return { spec: parsed.data, changedBlockIds };
}

/**
 * Build a single correction prompt that names the deviating block ids and
 * restates the canonical routing rules, used for the one retry before
 * deterministic normalization.
 */
export function buildCanonicalBlockTopicCorrectionPrompt(
  basePrompt: string,
  deviations: CareerPlaybookBlockTopicDeviation[]
): string {
  const lines = deviations.map(deviation => {
    const actual =
      deviation.actualTopics.length > 0 ? JSON.stringify(deviation.actualTopics) : '(missing)';
    return `- ${deviation.blockId}: primary_topics must anchor on "${deviation.expectedTopic}", but got ${actual}`;
  });

  return `${basePrompt}

Your previous RoleProfileSpec.block_boundaries did not follow the fixed 26-block layout.
Fix these block ids and resubmit the COMPLETE RoleProfileSpec JSON:
${lines.join('\n')}

Rules:
- Each block id keeps its canonical topic; never move a topic to a different block id.
- Route role emphasis into the block that owns it (metrics or forecasting -> block_6 and block_4; ownership -> block_3; strategic ties -> block_20).
- block_25 must be footer + revision cadence + MegaCampus CTA.
- Return ONLY valid JSON matching the RoleProfileSpec schema.`;
}

export function buildSpecBuilderPromptVariables(
  qaData: CareerPlaybookQAData,
  research: {
    kpis_insights: string[];
    trends_insights: string[];
    onboarding_insights: string[];
    sources: string[];
    errors?: string[];
  },
  contentLanguage: string,
  businessContextSourceExcerpts = '- none'
): Record<string, string> {
  const businessContext = getCareerPlaybookBusinessContext(qaData);

  return {
    qa_data_json: JSON.stringify(qaData, null, 2),
    business_context_mode: businessContext.mode,
    business_context_digest: formatCareerPlaybookBusinessContextDigest(businessContext),
    business_context_source_excerpts: businessContextSourceExcerpts,
    business_context_missing_signals:
      formatCareerPlaybookBusinessContextMissingSignals(businessContext),
    kpi_insights: joinInsights(research.kpis_insights),
    trends_insights: joinInsights(research.trends_insights),
    onboarding_insights: joinInsights(research.onboarding_insights),
    source_urls: research.sources.length > 0 ? research.sources.join('\n') : 'none',
    content_language: contentLanguage,
  };
}

export interface CreateSpecBuilderNodeOptions {
  runtime?: CareerPlaybookRuntime;
  webResearch?: RunCareerPlaybookWebResearchOptions;
  businessContextSourceExcerpts?: (state: CareerPlaybookGraphStateType) => Promise<string>;
}

async function invokeRoleProfileSpecWithFallback(
  runtime: CareerPlaybookRuntime,
  prompt: string
): Promise<{
  roleProfileSpec: CareerPlaybookRoleProfileSpec;
  llmResults: Awaited<ReturnType<CareerPlaybookRuntime['invokeLLM']>>[];
}> {
  const baseOptions = {
    phaseName: SPEC_BUILDER_PHASE,
    promptKey: SPEC_BUILDER_PROMPT_KEY,
    node: 'specBuilder',
    temperature: 0.3,
    maxTokens: 8_000,
  };
  const firstResult = await runtime.invokeLLM(prompt, baseOptions);

  try {
    return {
      roleProfileSpec: parseRoleProfileSpecFromLLM(firstResult.content),
      llmResults: [firstResult],
    };
  } catch (validationError) {
    const repairPrompt = buildRoleProfileSpecRepairPrompt(prompt, validationError);
    const fallbackResult = await runtime.invokeLLM(repairPrompt, {
      ...baseOptions,
      temperature: 0.2,
      preferFallbackModel: true,
      maxTokensMultiplier: 1.25,
    });

    return {
      roleProfileSpec: parseRoleProfileSpecFromLLM(fallbackResult.content),
      llmResults: [firstResult, fallbackResult],
    };
  }
}

const SPEC_TOPIC_RETRY_TEMPERATURE = 0.2;

/**
 * Enforce the canonical 26-block topic layout on a freshly built spec. If the
 * spec deviates, retry the spec call once with an explicit correction prompt,
 * then always run deterministic normalization as the guaranteed-valid backstop.
 * Returns any extra LLM results so their cost is accounted for.
 */
async function enforceCanonicalBlockTopics(
  runtime: CareerPlaybookRuntime,
  basePrompt: string,
  spec: CareerPlaybookRoleProfileSpec
): Promise<{
  spec: CareerPlaybookRoleProfileSpec;
  extraLLMResults: Awaited<ReturnType<CareerPlaybookRuntime['invokeLLM']>>[];
}> {
  const extraLLMResults: Awaited<ReturnType<CareerPlaybookRuntime['invokeLLM']>>[] = [];
  const deviations = findCanonicalBlockTopicDeviations(spec);
  let workingSpec = spec;
  let retried = false;

  // Only a topic the model actively got wrong (renamed or reassigned a block)
  // justifies paying for a retry; boundaries the model merely omitted are filled
  // losslessly by deterministic normalization below.
  const substantiveDeviations = deviations.filter(deviation => deviation.kind !== 'missing');

  if (substantiveDeviations.length > 0) {
    try {
      const correctionPrompt = buildCanonicalBlockTopicCorrectionPrompt(
        basePrompt,
        substantiveDeviations
      );
      const retryResult = await runtime.invokeLLM(correctionPrompt, {
        phaseName: SPEC_BUILDER_PHASE,
        promptKey: SPEC_BUILDER_PROMPT_KEY,
        node: 'specBuilder',
        temperature: SPEC_TOPIC_RETRY_TEMPERATURE,
        maxTokens: 8_000,
      });
      extraLLMResults.push(retryResult);
      retried = true;

      const retrySpec = parseRoleProfileSpecFromLLM(retryResult.content);
      const retrySubstantive = findCanonicalBlockTopicDeviations(retrySpec).filter(
        deviation => deviation.kind !== 'missing'
      );
      if (retrySubstantive.length < substantiveDeviations.length) {
        workingSpec = retrySpec;
      }
    } catch (retryError) {
      logger.warn(
        { error: errorMessageFrom(retryError) },
        'career playbook spec canonical-topic retry failed; normalizing original spec'
      );
    }
  }

  const { spec: normalizedSpec, changedBlockIds } =
    normalizeRoleProfileSpecToCanonicalBlockTopics(workingSpec);

  if (deviations.length > 0 || changedBlockIds.length > 0) {
    logger.info(
      {
        deviations: deviations.map(deviation => ({
          blockId: deviation.blockId,
          kind: deviation.kind,
        })),
        retried,
        changedBlockIds,
      },
      'career playbook spec block topics normalized to canonical layout'
    );
  }

  return { spec: normalizedSpec, extraLLMResults };
}

export function createSpecBuilderNode(options: CreateSpecBuilderNodeOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();

  return async function specBuilderNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    try {
      const webResearch = await runCareerPlaybookWebResearch(state.qaData, options.webResearch);
      const businessContext = getCareerPlaybookBusinessContext(state.qaData);
      const businessContextSourceExcerpts = options.businessContextSourceExcerpts
        ? await options.businessContextSourceExcerpts(state)
        : await loadCareerPlaybookBusinessContextSourceExcerpts({
            playbookId: state.playbookId,
            context: businessContext,
          });
      const prompt = await runtime.renderPrompt(
        SPEC_BUILDER_PROMPT_KEY,
        buildSpecBuilderPromptVariables(
          state.qaData,
          webResearch,
          state.language,
          businessContextSourceExcerpts
        )
      );
      const { roleProfileSpec, llmResults } = await invokeRoleProfileSpecWithFallback(
        runtime,
        prompt
      );
      const { spec: canonicalSpec, extraLLMResults } = await enforceCanonicalBlockTopics(
        runtime,
        prompt,
        roleProfileSpec
      );

      return {
        roleProfileSpec: canonicalSpec,
        webResearch,
        nodeCosts: [...llmResults, ...extraLLMResults].map(buildNodeCost),
        currentNode: 'group1Generator',
      };
    } catch (error) {
      return {
        errors: [`specBuilder failed: ${errorMessageFrom(error)}`],
        currentNode: 'specBuilder',
      };
    }
  };
}

export const specBuilderNode = createSpecBuilderNode();
