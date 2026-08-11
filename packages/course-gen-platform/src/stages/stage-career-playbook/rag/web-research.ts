import type { CareerPlaybookQAData } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';

export type CareerPlaybookResearchCategory = 'kpis' | 'trends' | 'onboarding';

export interface CareerPlaybookResearchQuery {
  category: CareerPlaybookResearchCategory;
  query: string;
}

export interface CareerPlaybookSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

/**
 * A single retrieved result kept whole. The flat `*_insights` and `sources`
 * arrays lose the link between a claim and the URL that supports it, which is
 * why the reviewed output asserted precise statistics with no traceable source.
 * Findings preserve that pairing so the evidence ledger can be built from them.
 */
export interface CareerPlaybookResearchFinding {
  category: CareerPlaybookResearchCategory;
  title: string;
  url: string;
  claim: string;
}

export interface CareerPlaybookWebResearchResult {
  kpis_insights: string[];
  trends_insights: string[];
  onboarding_insights: string[];
  sources: string[];
  findings: CareerPlaybookResearchFinding[];
  errors: string[];
  /**
   * True when no external source is available for this run (no API key, or every
   * query failed). Generation continues, but precise external statistics are then
   * unsupportable and the deterministic sourcing check rejects them.
   */
  unavailable: boolean;
}

export type CareerPlaybookWebSearchClient = (
  query: CareerPlaybookResearchQuery,
  options: { signal: AbortSignal; timeoutMs: number }
) => Promise<CareerPlaybookSearchResult[]>;

export interface RunCareerPlaybookWebResearchOptions {
  client?: CareerPlaybookWebSearchClient;
  timeoutMs?: number;
}

// 5s was too tight for a real search round-trip and made the whole grounding
// path fail open in normal conditions. One retry covers a transient failure
// without turning research into a latency risk: worst case per category is
// 2 x 20s, and the three categories run concurrently.
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESULTS = 8;
const SEARCH_ATTEMPTS = 2;

function getAnswerText(qaData: CareerPlaybookQAData, key: string): string | null {
  const fixedAnswer = qaData.fixed.find(answer => answer.question_key === key);
  if (!fixedAnswer) return null;
  return Array.isArray(fixedAnswer.value) ? fixedAnswer.value.join(', ') : fixedAnswer.value;
}

export function buildCareerPlaybookResearchQueries(
  qaData: CareerPlaybookQAData
): CareerPlaybookResearchQuery[] {
  const roleTitle = getAnswerText(qaData, 'position') ?? 'role';
  const department = getAnswerText(qaData, 'department') ?? 'business';
  const level = getAnswerText(qaData, 'level') ?? 'professional';

  return [
    {
      category: 'kpis',
      query: `"${roleTitle}" ${department} ${level} KPIs scorecard metrics best practices`,
    },
    {
      category: 'trends',
      query: `"${roleTitle}" ${department} trends 2025 2026 skills AI impact`,
    },
    {
      category: 'onboarding',
      query: `"${roleTitle}" onboarding playbook career path best practices`,
    },
  ];
}

function createEmptyResearch(errors: string[] = []): CareerPlaybookWebResearchResult {
  return {
    kpis_insights: [],
    trends_insights: [],
    onboarding_insights: [],
    sources: [],
    findings: [],
    errors,
    unavailable: true,
  };
}

function toInsight(result: CareerPlaybookSearchResult): string {
  return result.snippet || result.content || result.title;
}

function mergeResearchResult(
  research: CareerPlaybookWebResearchResult,
  category: CareerPlaybookResearchCategory,
  results: CareerPlaybookSearchResult[]
): void {
  const insights = results.map(toInsight).filter(Boolean);
  const urls = results.map(result => result.url).filter(Boolean);

  if (category === 'kpis') research.kpis_insights.push(...insights);
  if (category === 'trends') research.trends_insights.push(...insights);
  if (category === 'onboarding') research.onboarding_insights.push(...insights);
  research.sources.push(...urls);

  for (const result of results) {
    const claim = toInsight(result);
    if (!result.url || !claim) continue;

    research.findings.push({
      category,
      title: result.title || result.url,
      url: result.url,
      claim,
    });
  }
}

async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class CareerPlaybookResearchUnconfiguredError extends Error {
  constructor() {
    super('Career Playbook web research is unconfigured: TAVILY_API_KEY is empty or missing');
    this.name = 'CareerPlaybookResearchUnconfiguredError';
  }
}

/** True when a usable search key is configured. An empty string counts as absent. */
export function isCareerPlaybookWebResearchConfigured(
  value: string | undefined = process.env.TAVILY_API_KEY
): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export const tavilyCareerPlaybookWebSearchClient: CareerPlaybookWebSearchClient = async (
  researchQuery,
  { signal }
) => {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    // Previously this returned [] and logged at info, so a whole run silently
    // lost its grounding while the guide kept asserting precise statistics.
    // Throwing surfaces the condition as a research error the caller reports.
    throw new CareerPlaybookResearchUnconfiguredError();
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: researchQuery.query,
      search_depth: 'advanced',
      max_results: DEFAULT_MAX_RESULTS,
      include_answer: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; snippet?: string }>;
  };

  return (payload.results ?? [])
    .filter(result => result.url)
    .map(result => ({
      title: result.title ?? result.url!,
      url: result.url!,
      snippet: result.snippet ?? result.content,
      content: result.content,
    }));
};

/**
 * Run one category query with a bounded retry. A configuration error is not
 * retried — a missing key will still be missing on the second attempt.
 */
async function searchCategoryWithRetry(
  client: CareerPlaybookWebSearchClient,
  query: CareerPlaybookResearchQuery,
  timeoutMs: number
): Promise<CareerPlaybookSearchResult[]> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt += 1) {
    try {
      return await runWithTimeout(
        signal => client(query, { signal, timeoutMs }),
        timeoutMs,
        `Career Playbook web research timed out for ${query.category}`
      );
    } catch (error) {
      if (error instanceof CareerPlaybookResearchUnconfiguredError) throw error;
      lastError = error;
      logger.warn(
        {
          category: query.category,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        },
        'Career Playbook web research attempt failed'
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Career Playbook web research failed for ${query.category}`);
}

export async function runCareerPlaybookWebResearch(
  qaData: CareerPlaybookQAData,
  options: RunCareerPlaybookWebResearchOptions = {}
): Promise<CareerPlaybookWebResearchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = options.client ?? tavilyCareerPlaybookWebSearchClient;
  const queries = buildCareerPlaybookResearchQueries(qaData);
  const research = createEmptyResearch();

  const settledResults = await Promise.allSettled(
    queries.map(async query => {
      const results = await searchCategoryWithRetry(client, query, timeoutMs);
      return { query, results };
    })
  );

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      mergeResearchResult(research, settled.value.query.category, settled.value.results);
    } else {
      research.errors.push(
        settled.reason instanceof Error ? settled.reason.message : String(settled.reason)
      );
    }
  }

  research.sources = Array.from(new Set(research.sources));
  // Grounding is available only when at least one finding carries a URL. An
  // empty result set is not a soft warning: it decides whether the generated
  // guide may state precise external statistics at all.
  research.unavailable = research.findings.length === 0;

  if (research.unavailable) {
    logger.warn(
      { errors: research.errors },
      'Career Playbook web research produced no sources; run continues without external statistics'
    );
  }

  return research;
}
