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
  "metric_ledger": [{ "key": "pipeline_coverage", "label": "Pipeline coverage", "unit": "x", "target": ">=3x", "green": ">=3x", "yellow": "2-2.9x", "red": "<2x", "review_period": "quarter", "provenance": "assumption", "source_ref": null }],
  "research": { "kpis_insights": ["..."], "trends_insights": ["..."], "onboarding_insights": ["..."], "sources": ["..."] },
  "block_boundaries": { "block_1": { "primary_topics": ["..."], "do_not_repeat": ["..."] } },
  "content_language": "ru"
}

Allowed level values: junior, middle, senior, lead, director, c-level.
Allowed company_stage values: pre-pmf, growth, scale, mature.
Allowed team_size values: 1-10, 11-50, 51-200, 201-1000, 1000+.
Allowed metric_ledger[].provenance values: company_source, user_answer, benchmark, assumption — a single string, never an array.
Every metric_ledger entry needs a non-empty "key", "label" and "target".
Do not emit evidence_ledger or generated_on; the application fills both.
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

const METRIC_PROVENANCE_VALUES = new Set([
  'company_source',
  'user_answer',
  'benchmark',
  'assumption',
]);

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (Array.isArray(value)) {
      const nested = firstString(...value);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * Salvage whatever the model produced for `metric_ledger` instead of letting a
 * malformed entry abort the whole generation.
 *
 * The first live run on this contract died at spec validation: the model emitted
 * ledger rows with no `key`/`label` and `provenance` as an array, and zod
 * rejected the entire RoleProfileSpec — losing 26 blocks and ~13 minutes over a
 * secondary field. The ledger is a quality aid; failing closed on its shape
 * trades a whole document for a formatting slip, which is the wrong trade. An
 * unusable row is dropped, a recoverable one is coerced, and generation
 * continues with whatever survives.
 */
function sanitizeMetricLedgerCandidate(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;

    const label = firstString(row.label, row.name, row.metric, row.title, row.key);
    const key = firstString(row.key, row.id, label);
    const target = firstString(row.target, row.target_value, row.value, row.goal);
    if (!label || !key || !target) return [];

    const provenanceCandidate = firstString(row.provenance, row.source_type, row.origin);
    const provenance =
      provenanceCandidate && METRIC_PROVENANCE_VALUES.has(provenanceCandidate)
        ? provenanceCandidate
        : 'assumption';

    return [
      {
        key,
        label,
        target,
        unit: firstString(row.unit) ?? '',
        green: firstString(row.green, row.green_threshold) ?? '',
        yellow: firstString(row.yellow, row.yellow_threshold) ?? '',
        red: firstString(row.red, row.red_threshold) ?? '',
        review_period: firstString(row.review_period, row.cadence, row.period) ?? '',
        provenance,
        source_ref: firstString(row.source_ref, row.source) ?? null,
      },
    ];
  });
}

function normalizeRoleProfileSpecCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;

  const normalized = candidate as Record<string, unknown>;

  normalized.metric_ledger = sanitizeMetricLedgerCandidate(normalized.metric_ledger);
  // Both are application-owned and overwritten later; accepting the model's
  // version only creates a chance for it to fail validation on data we discard.
  delete normalized.evidence_ledger;
  delete normalized.generated_on;

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

/**
 * Carries the calls a failed spec build already paid for.
 *
 * The first live run on this contract threw a validation error after three
 * successful LLM calls, and the receipt recorded none of them: the node reported
 * only the error. Spend that happened is spend that must appear, especially on a
 * failed run where it is otherwise invisible.
 */
export class CareerPlaybookSpecBuildError extends Error {
  constructor(
    message: string,
    readonly nodeCosts: CareerPlaybookNodeCost[]
  ) {
    super(message);
    this.name = 'CareerPlaybookSpecBuildError';
  }
}

async function invokeRoleProfileSpecWithFallback(
  runtime: CareerPlaybookRuntime,
  prompt: string,
  spent: Awaited<ReturnType<CareerPlaybookRuntime['invokeLLM']>>[]
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
  spent.push(firstResult);

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
      spent.push(retryResult);

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
    spent.push(fallbackResult);

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
    // Every completed call lands here immediately, so a later failure still
    // reports what it already cost.
    const spent: Awaited<ReturnType<CareerPlaybookRuntime['invokeLLM']>>[] = [];

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
        prompt,
        spent
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
        // A failed spec build still consumed provider time: successful calls that
        // preceded the failure, plus attempts that never returned.
        nodeCosts: [
          ...spent.flatMap(buildNodeCosts),
          ...(error instanceof CareerPlaybookLLMCallError
            ? buildCareerPlaybookAbortedAttemptCosts('specBuilder', error.abortedAttempts)
            : []),
        ],
        currentNode: 'specBuilder',
      };
    }
  };
}

export const specBuilderNode = createSpecBuilderNode();
