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

export interface CareerPlaybookWebResearchResult {
  kpis_insights: string[];
  trends_insights: string[];
  onboarding_insights: string[];
  sources: string[];
  errors: string[];
}

export type CareerPlaybookWebSearchClient = (
  query: CareerPlaybookResearchQuery,
  options: { signal: AbortSignal; timeoutMs: number }
) => Promise<CareerPlaybookSearchResult[]>;

export interface RunCareerPlaybookWebResearchOptions {
  client?: CareerPlaybookWebSearchClient;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

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
    errors,
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

export const tavilyCareerPlaybookWebSearchClient: CareerPlaybookWebSearchClient = async (
  researchQuery,
  { signal }
) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    logger.info(
      { category: researchQuery.category },
      'Career Playbook web research skipped: TAVILY_API_KEY is not configured'
    );
    return [];
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
      search_depth: 'basic',
      max_results: 5,
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
      const results = await runWithTimeout(
        signal => client(query, { signal, timeoutMs }),
        timeoutMs,
        `Career Playbook web research timed out for ${query.category}`
      );
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
  return research;
}
