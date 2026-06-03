import { extractJSON, safeJSONParse } from '@megacampus/shared-utils';
import {
  CareerPlaybookRoleProfileSpecSchema,
  type CareerPlaybookNodeCost,
  type CareerPlaybookQAData,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import type { CareerPlaybookGraphStateType, CareerPlaybookGraphStateUpdate } from '../state';
import {
  buildCareerPlaybookResearchQueries,
  runCareerPlaybookWebResearch,
  type RunCareerPlaybookWebResearchOptions,
} from '../rag/web-research';
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
}): CareerPlaybookNodeCost {
  return {
    node: 'specBuilder',
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: result.costUsd,
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
  return CareerPlaybookRoleProfileSpecSchema.parse(parsed);
}

export function buildSpecBuilderPromptVariables(
  qaData: CareerPlaybookQAData,
  research: {
    kpis_insights: string[];
    trends_insights: string[];
    onboarding_insights: string[];
    sources: string[];
  },
  contentLanguage: string
): Record<string, string> {
  return {
    qa_data_json: JSON.stringify(qaData, null, 2),
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

export function createSpecBuilderNode(options: CreateSpecBuilderNodeOptions = {}) {
  const runtime = options.runtime ?? createCareerPlaybookRuntime();

  return async function specBuilderNode(
    state: CareerPlaybookGraphStateType
  ): Promise<CareerPlaybookGraphStateUpdate> {
    try {
      const webResearch = await runCareerPlaybookWebResearch(state.qaData, options.webResearch);
      const prompt = await runtime.renderPrompt(
        SPEC_BUILDER_PROMPT_KEY,
        buildSpecBuilderPromptVariables(state.qaData, webResearch, state.language)
      );
      const { roleProfileSpec, llmResults } = await invokeRoleProfileSpecWithFallback(
        runtime,
        prompt
      );

      return {
        roleProfileSpec,
        webResearch,
        nodeCosts: llmResults.map(buildNodeCost),
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
