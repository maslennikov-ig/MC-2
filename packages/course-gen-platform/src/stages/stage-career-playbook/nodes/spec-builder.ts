import { extractJSON, safeJSONParse } from '@/shared/workspace-utils';
import { logger } from '@/shared/logger';
import {
  CareerPlaybookRoleProfileSpecSchema,
  type CareerPlaybookNodeCost,
  type CareerPlaybookQAData,
  type CareerPlaybookQualityIssue,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  buildCanonicalBlockTopicCorrectionPrompt,
  findCanonicalBlockTopicDeviations,
  normalizeRoleProfileSpecToCanonicalBlockTopics,
} from './spec-builder-canonical';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';
import {
  buildCareerPlaybookResearchQueries,
  runCareerPlaybookWebResearch,
  type CareerPlaybookWebResearchResult,
  type RunCareerPlaybookWebResearchOptions,
} from '../rag/web-research';
import {
  formatCareerPlaybookBusinessContextDigest,
  formatCareerPlaybookBusinessContextMissingSignals,
  getCareerPlaybookBusinessContext,
  loadCareerPlaybookBusinessContextSourceExcerpts,
} from './business-context';
import {
  buildCareerPlaybookAbortedAttemptCosts,
  CareerPlaybookLLMCallError,
  createCareerPlaybookRuntime,
  type CareerPlaybookAbortedAttempt,
  type CareerPlaybookRuntime,
} from './runtime';
import {
  buildCareerPlaybookEvidenceLedger,
  normalizeCareerPlaybookMetricLedger,
  reconcileMetricLedgerSourceRefs,
} from './quality-ledger';

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
    outcome: 'succeeded',
  };
}

/** Success row plus one unknown-cost row per attempt that never returned. */
function buildNodeCosts(result: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs?: number;
  attemptCount?: number;
  abortedAttempts?: CareerPlaybookAbortedAttempt[];
}): CareerPlaybookNodeCost[] {
  return [
    buildNodeCost(result),
    ...buildCareerPlaybookAbortedAttemptCosts('specBuilder', result.abortedAttempts),
  ];
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildResearchUnavailableQualityIssue(errors: string[]): CareerPlaybookQualityIssue {
  const detail = errors.length > 0 ? ` Reasons: ${errors.join('; ')}.` : '';

  return {
    id: 'system:research:unavailable',
    source: 'system',
    severity: 'warning',
    title: 'Внешние источники недоступны',
    message: `Веб-исследование не вернуло ни одного источника, поэтому Role Guide сгенерирован без внешней статистики: точные рыночные цифры в тексте запрещены и заменены на ориентиры.${detail}`,
    suggestion:
      'Проверьте конфигурацию поиска и перегенерируйте блоки, где нужна отраслевая статистика со ссылками.',
    action: 'review',
  };
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

export {
  buildCanonicalBlockTopicCorrectionPrompt,
  findCanonicalBlockTopicDeviations,
  normalizeRoleProfileSpecToCanonicalBlockTopics,
  type CareerPlaybookBlockTopicDeviation,
  type CareerPlaybookBlockTopicDeviationKind,
  type NormalizeCanonicalBlockTopicsResult,
} from './spec-builder-canonical';

export function buildSpecBuilderPromptVariables(
  qaData: CareerPlaybookQAData,
  research: {
    kpis_insights: string[];
    trends_insights: string[];
    onboarding_insights: string[];
    sources: string[];
    errors?: string[];
    unavailable?: boolean;
  },
  contentLanguage: string,
  businessContextSourceExcerpts = '- none',
  generatedOn: string = new Date().toISOString().slice(0, 10)
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
    research_availability:
      (research.unavailable ?? research.sources.length === 0)
        ? 'unavailable — no external source was retrieved; every metric target must be provenance "assumption" or come from the user answers'
        : 'available',
    generated_on: generatedOn,
    content_language: contentLanguage,
  };
}

export interface CreateSpecBuilderNodeOptions {
  runtime?: CareerPlaybookRuntime;
  webResearch?: RunCareerPlaybookWebResearchOptions;
  businessContextSourceExcerpts?: (state: CareerPlaybookGraphStateType) => Promise<string>;
  /** Injectable clock so `generated_on` is deterministic under test. */
  now?: () => Date;
}

/**
 * Apply the application-owned parts of the spec contract on top of whatever the
 * model returned.
 *
 * The model may propose a metric ledger; it may not own the evidence ledger or
 * the generation date. Both are overwritten unconditionally, because a model
 * that writes its own citations writes citations that do not resolve — which is
 * precisely how the reviewed guide ended up asserting "research shows" with no
 * retrievable source anywhere in the document.
 */
export function applyCareerPlaybookLedgers(
  spec: CareerPlaybookRoleProfileSpec,
  research: CareerPlaybookWebResearchResult | null,
  generatedOn: Date
): CareerPlaybookRoleProfileSpec {
  const isoDate = generatedOn.toISOString().slice(0, 10);
  const evidenceLedger = buildCareerPlaybookEvidenceLedger(research, isoDate);
  const metricLedger = reconcileMetricLedgerSourceRefs(
    normalizeCareerPlaybookMetricLedger(spec.metric_ledger),
    evidenceLedger
  );

  return {
    ...spec,
    metric_ledger: metricLedger,
    evidence_ledger: evidenceLedger,
    generated_on: isoDate,
  };
}

/**
 * Output budget for the spec call. The previous 8_000 was below what the
 * contract actually requires: 26 `block_boundaries` entries plus focus areas,
 * research and the metric ledger. On 2026-08-11 the primary model returned
 * exactly 8_000 tokens — the signature of a truncated response — the JSON failed
 * validation, and the repair path forced the weakest model, burning 17.5 minutes
 * and producing the degraded spec that all 26 blocks inherited.
 */
export const CAREER_PLAYBOOK_SPEC_MAX_TOKENS = 16_000;

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
    maxTokens: CAREER_PLAYBOOK_SPEC_MAX_TOKENS,
  };
  const firstResult = await runtime.invokeLLM(prompt, baseOptions);

  try {
    return {
      roleProfileSpec: parseRoleProfileSpecFromLLM(firstResult.content),
      llmResults: [firstResult],
    };
  } catch (validationError) {
    const repairPrompt = buildRoleProfileSpecRepairPrompt(prompt, validationError);
    const llmResults = [firstResult];

    // Repair on the SAME model first, with a larger budget. The dominant cause of
    // a spec parse failure is truncation, and truncation is a budget problem, not
    // a model-capability problem — downgrading to the fallback model made the
    // artefact worse and slower at once. The fallback escalation below is kept as
    // the genuine safety net for a model that cannot produce the shape at all.
    try {
      const retryResult = await runtime.invokeLLM(repairPrompt, {
        ...baseOptions,
        temperature: 0.2,
        maxTokensMultiplier: 1.5,
      });
      llmResults.push(retryResult);

      return {
        roleProfileSpec: parseRoleProfileSpecFromLLM(retryResult.content),
        llmResults,
      };
    } catch (retryError) {
      logger.warn(
        { error: errorMessageFrom(retryError) },
        'career playbook spec repair on primary model failed; escalating to fallback model'
      );
    }

    const fallbackResult = await runtime.invokeLLM(repairPrompt, {
      ...baseOptions,
      temperature: 0.2,
      preferFallbackModel: true,
      maxTokensMultiplier: 1.5,
    });
    llmResults.push(fallbackResult);

    return {
      roleProfileSpec: parseRoleProfileSpecFromLLM(fallbackResult.content),
      llmResults,
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
        maxTokens: CAREER_PLAYBOOK_SPEC_MAX_TOKENS,
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
      const generatedOn = (options.now ?? (() => new Date()))();
      const prompt = await runtime.renderPrompt(
        SPEC_BUILDER_PROMPT_KEY,
        buildSpecBuilderPromptVariables(
          state.qaData,
          webResearch,
          state.language,
          businessContextSourceExcerpts,
          generatedOn.toISOString().slice(0, 10)
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
      const specWithLedgers = applyCareerPlaybookLedgers(canonicalSpec, webResearch, generatedOn);

      return {
        roleProfileSpec: specWithLedgers,
        webResearch,
        // Losing grounding is a publication-blocking condition, not a log line:
        // without it the guide may not state a single precise external figure.
        ...(webResearch.unavailable
          ? {
              qualityIssues: [buildResearchUnavailableQualityIssue(webResearch.errors)],
              warnings: [
                'Career Playbook web research returned no sources; external statistics are disallowed for this run.',
              ],
            }
          : {}),
        nodeCosts: [...llmResults, ...extraLLMResults].flatMap(buildNodeCosts),
        currentNode: 'group1Generator',
      };
    } catch (error) {
      return {
        errors: [`specBuilder failed: ${errorMessageFrom(error)}`],
        // A total failure still consumed provider time; keep its attempts on the
        // receipt rather than losing the most expensive part of a failed run.
        nodeCosts:
          error instanceof CareerPlaybookLLMCallError
            ? buildCareerPlaybookAbortedAttemptCosts('specBuilder', error.abortedAttempts)
            : [],
        currentNode: 'specBuilder',
      };
    }
  };
}

export const specBuilderNode = createSpecBuilderNode();
