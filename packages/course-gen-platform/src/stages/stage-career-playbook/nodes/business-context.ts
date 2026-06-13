import {
  CareerPlaybookBusinessContextSchema,
  type CareerPlaybookBusinessContext,
  type CareerPlaybookBusinessContextDigest,
  type CareerPlaybookQAData,
} from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import { getCareerPlaybookBusinessContextSupabase } from '@/shared/career-playbook/source-db';
import { tokenEstimator } from '@/shared/llm/token-estimator';

type DigestArrayKey =
  | 'product'
  | 'customers'
  | 'sales_channels'
  | 'processes'
  | 'metrics'
  | 'org_structure'
  | 'constraints';

const DIGEST_LABELS: Array<[DigestArrayKey, string]> = [
  ['product', 'Product / offer'],
  ['customers', 'Customers / market'],
  ['sales_channels', 'Sales channels'],
  ['processes', 'Processes'],
  ['metrics', 'Metrics'],
  ['org_structure', 'Organization structure'],
  ['constraints', 'Constraints'],
];

const DEFAULT_SOURCE_EVIDENCE_TOKEN_BUDGET = 250_000;
const DIGEST_TEXT_LIMIT = 6_000;
const TRUNCATION_NOTICE = '[truncated to fit Career Playbook source budget]';
const SOURCE_EVIDENCE_TOKEN_LANGUAGE = 'rus';

export interface CareerPlaybookSourceRecord {
  id: string;
  filename: string | null;
  status: string;
  file_catalog_id: string | null;
}

export interface FileCatalogSourceRecord {
  id: string;
  filename: string | null;
  processed_content: string | null;
  markdown_content: string | null;
}

export interface LoadedCareerPlaybookSourceRecord extends CareerPlaybookSourceRecord {
  file?: FileCatalogSourceRecord;
}

export interface RefreshCareerPlaybookBusinessContextDigestInput {
  playbookId?: string;
  context: CareerPlaybookBusinessContext;
  freeformText?: string;
  maxSources?: number;
  maxCharsPerSource?: number;
  maxAggregateTokens?: number;
}

export interface RefreshCareerPlaybookBusinessContextDigestResult {
  context: CareerPlaybookBusinessContext;
  sourceExcerpts: string;
  hasPendingSources: boolean;
  hasFailedSources: boolean;
}

function listValues(values: string[]): string {
  return values.length > 0 ? values.map(value => `- ${value}`).join('\n') : '- none';
}

export function getCareerPlaybookBusinessContext(
  qaData: CareerPlaybookQAData
): CareerPlaybookBusinessContext {
  return CareerPlaybookBusinessContextSchema.parse(qaData.business_context ?? {});
}

export function formatCareerPlaybookBusinessContextDigest(
  context: CareerPlaybookBusinessContext
): string {
  if (context.mode === 'universal') {
    return [
      'Mode: universal benchmark Role Guide.',
      'No company-specific facts were provided. Do not invent product, customer, sales, process, or metric details.',
    ].join('\n');
  }

  if (!context.digest) {
    return [
      'Mode: company_specific.',
      'No structured digest is ready yet. Use only explicit Q&A/free-form context and ask targeted follow-up questions for gaps.',
    ].join('\n');
  }

  const sections = DIGEST_LABELS.map(([key, label]) => {
    const value = context.digest?.[key];
    return `${label}:\n${Array.isArray(value) ? listValues(value) : '- none'}`;
  });

  return [
    'Mode: company_specific.',
    ...sections,
    `Source ids:\n${listValues(context.source_ids)}`,
    `User edited digest: ${context.digest.user_edited ? 'yes' : 'no'}`,
  ].join('\n\n');
}

export function formatCareerPlaybookBusinessContextMissingSignals(
  context: CareerPlaybookBusinessContext
): string {
  if (context.mode === 'universal') {
    return 'company-specific product, customers, sales channels, processes, metrics, org structure, constraints';
  }

  const missingSignals = context.digest?.missing_signals ?? [];
  return missingSignals.length > 0
    ? missingSignals.map(signal => `- ${signal}`).join('\n')
    : '- none';
}

function truncateSourceText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}...` : normalized;
}

function authoritativeSourceContent(file: FileCatalogSourceRecord | undefined): string | null {
  if (!file) return null;
  return file.markdown_content || file.processed_content || null;
}

function digestSourceContent(file: FileCatalogSourceRecord | undefined): string | null {
  if (!file) return null;
  const parts = [file.processed_content, file.markdown_content]
    .filter((content): content is string => Boolean(content?.trim()))
    .filter((content, index, values) => values.indexOf(content) === index);

  return parts.length > 0 ? parts.join('\n\n') : null;
}

function estimateTokens(value: string): number {
  return tokenEstimator.estimateTokens(value, SOURCE_EVIDENCE_TOKEN_LANGUAGE);
}

function trimToTokenBudget(value: string, tokenBudget: number): string {
  if (tokenBudget <= 0) return '';
  const estimatedTokens = estimateTokens(value);
  if (estimatedTokens <= tokenBudget) return value;

  const ratio = value.length / Math.max(estimatedTokens, 1);
  const maxChars = Math.max(0, Math.floor(tokenBudget * ratio));
  if (maxChars <= 0) return '';

  return `${value.slice(0, maxChars).trimEnd()}\n${TRUNCATION_NOTICE}`;
}

function appendWithinBudget(parts: string[], value: string, budget: { remaining: number }): void {
  if (!value.trim() || budget.remaining <= 0) return;

  const valueTokens = estimateTokens(value);
  if (valueTokens <= budget.remaining) {
    parts.push(value);
    budget.remaining -= valueTokens;
    return;
  }

  const trimmed = trimToTokenBudget(value, budget.remaining);
  if (!trimmed) return;

  parts.push(trimmed);
  budget.remaining = 0;
}

function normalizeDigestValue(value: string): string {
  return value
    .replace(
      /^(product|offer|customers?|market|sales channels?|channels?|process(?:es)?|workflow|metrics?|kpis?|org(?:anization)?(?: structure)?|team|constraints?|limits?|risks?)\s*:\s*/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function addUnique(values: string[], value: string): void {
  const normalized = normalizeDigestValue(value);
  if (!normalized || normalized.length < 3) return;
  if (values.some(existing => existing.toLowerCase() === normalized.toLowerCase())) return;
  values.push(normalized);
}

function categoryForText(value: string): DigestArrayKey | null {
  const lower = value.toLowerCase();
  if (/\b(product|offer|platform|service|solution|course generation|lms)\b/.test(lower)) {
    return 'product';
  }
  if (/\b(customer|customers|client|clients|market|segment|hr teams|enterprise)\b/.test(lower)) {
    return 'customers';
  }
  if (
    /\b(sales channel|sales channels|channel|inbound|outbound|partner|demo|demos)\b/.test(lower)
  ) {
    return 'sales_channels';
  }
  if (/\b(process|processes|workflow|regulation|playbook|handoff|onboarding)\b/.test(lower)) {
    return 'processes';
  }
  if (/\b(metric|metrics|kpi|kpis|pipeline|revenue|conversion|win rate|qualified)\b/.test(lower)) {
    return 'metrics';
  }
  if (/\b(org|organization|structure|team|reports to|department|manager|lead)\b/.test(lower)) {
    return 'org_structure';
  }
  if (
    /\b(constraint|constraints|limit|limits|risk|risks|no pii|secret|compliance|security)\b/.test(
      lower
    )
  ) {
    return 'constraints';
  }
  return null;
}

function extractDigestCandidates(text: string): Partial<Record<DigestArrayKey, string[]>> {
  const result: Partial<Record<DigestArrayKey, string[]>> = {};
  const chunks = text
    .slice(0, DIGEST_TEXT_LIMIT)
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const category = categoryForText(chunk);
    if (!category) continue;
    const values = (result[category] ??= []);
    addUnique(values, chunk);
  }

  return result;
}

function digestHasContent(digest: CareerPlaybookBusinessContextDigest | null | undefined): boolean {
  if (!digest) return false;
  return DIGEST_LABELS.some(([key]) => {
    const value = digest[key];
    return Array.isArray(value) && value.length > 0;
  });
}

function buildMissingSignals(
  digest: CareerPlaybookBusinessContextDigest,
  options: { hasPendingSources: boolean; hasFailedSources: boolean }
): string[] {
  const missing: string[] = [];
  for (const [key, label] of DIGEST_LABELS) {
    const value = digest[key];
    if (!Array.isArray(value) || value.length === 0) {
      missing.push(label.toLowerCase());
    }
  }
  if (options.hasPendingSources) missing.push('source processing');
  if (options.hasFailedSources) missing.push('failed source processing');
  return missing;
}

function buildDigestFromText(input: {
  context: CareerPlaybookBusinessContext;
  sourceTexts: string[];
  freeformText: string;
  hasPendingSources: boolean;
  hasFailedSources: boolean;
}): CareerPlaybookBusinessContextDigest {
  const now = new Date().toISOString();
  const existing = input.context.digest;
  const digest: CareerPlaybookBusinessContextDigest = {
    product: [...(existing?.product ?? [])],
    customers: [...(existing?.customers ?? [])],
    sales_channels: [...(existing?.sales_channels ?? [])],
    processes: [...(existing?.processes ?? [])],
    metrics: [...(existing?.metrics ?? [])],
    org_structure: [...(existing?.org_structure ?? [])],
    constraints: [...(existing?.constraints ?? [])],
    source_ids: Array.from(new Set([...(existing?.source_ids ?? []), ...input.context.source_ids])),
    missing_signals: [],
    user_edited: existing?.user_edited ?? false,
    generated_at: existing?.generated_at ?? now,
    updated_at: now,
  };

  const candidates = extractDigestCandidates(
    [input.freeformText, ...input.sourceTexts].join('\n\n')
  );
  for (const [key] of DIGEST_LABELS) {
    for (const value of candidates[key] ?? []) {
      addUnique(digest[key], value);
    }
  }
  digest.missing_signals = buildMissingSignals(digest, {
    hasPendingSources: input.hasPendingSources,
    hasFailedSources: input.hasFailedSources,
  });

  return digest;
}

export interface FormattedCareerPlaybookBusinessContextSourceEvidence {
  sourceExcerpts: string;
  hasAuthoritativeEvidence: boolean;
}

export function buildLoadedSourceEvidence(
  sources: LoadedCareerPlaybookSourceRecord[],
  options: {
    maxCharsPerSource?: number;
    maxAggregateTokens?: number;
  } = {}
): FormattedCareerPlaybookBusinessContextSourceEvidence {
  if (sources.length === 0) {
    return {
      sourceExcerpts: '- none',
      hasAuthoritativeEvidence: false,
    };
  }

  const maxAggregateTokens = options.maxAggregateTokens ?? DEFAULT_SOURCE_EVIDENCE_TOKEN_BUDGET;
  const parts = [
    [
      'Source evidence pack.',
      `Aggregate budget: ${maxAggregateTokens} estimated tokens across all selected sources.`,
      'Use authoritative source content for company-specific facts. Treat summaries as overview only.',
    ].join('\n'),
  ];
  const budget = {
    remaining: Math.max(0, maxAggregateTokens - estimateTokens(parts[0] ?? '')),
  };

  for (const [index, source] of sources.entries()) {
    if (budget.remaining <= 0) {
      parts.push(TRUNCATION_NOTICE);
      break;
    }

    const filename = source.filename || source.file?.filename || `source-${index + 1}`;
    const authoritativeContent = authoritativeSourceContent(source.file);
    const summaryOverview =
      source.file?.processed_content &&
      source.file.markdown_content &&
      source.file.processed_content !== source.file.markdown_content
        ? source.file.processed_content
        : null;

    if (!authoritativeContent) {
      appendWithinBudget(
        parts,
        [
          `[Source ${index + 1}: ${filename}]`,
          `Status: ${source.status}. Processed text is not available yet.`,
          'Do not infer facts from this file. Ask the user targeted questions if these facts are needed.',
        ].join('\n'),
        budget
      );
      continue;
    }

    const sourceContent = options.maxCharsPerSource
      ? truncateSourceText(authoritativeContent, options.maxCharsPerSource)
      : authoritativeContent;
    const sourceParts = [
      `[Source ${index + 1}: ${filename}]`,
      `Status: ${source.status}.`,
      `Authoritative source content (${source.file?.markdown_content ? 'Docling markdown' : 'processed content fallback'}):\n${sourceContent}`,
      summaryOverview
        ? `Summary overview (not authoritative when it conflicts with source content):\n${summaryOverview}`
        : null,
    ].filter((part): part is string => Boolean(part));

    appendWithinBudget(parts, sourceParts.join('\n\n'), budget);
  }

  const sourceExcerpts = parts.join('\n\n');
  return {
    sourceExcerpts,
    hasAuthoritativeEvidence: sourceExcerpts.includes('Authoritative source content ('),
  };
}

function formatLoadedSourceEvidence(
  sources: LoadedCareerPlaybookSourceRecord[],
  options: {
    maxCharsPerSource?: number;
    maxAggregateTokens?: number;
  } = {}
): string {
  return buildLoadedSourceEvidence(sources, options).sourceExcerpts;
}

export async function loadBusinessContextSources(input: {
  playbookId?: string;
  sourceIds: string[];
  maxSources?: number;
}): Promise<LoadedCareerPlaybookSourceRecord[]> {
  if (!input.playbookId || input.sourceIds.length === 0) return [];

  const selectedSourceIds = Array.from(new Set(input.sourceIds))
    .filter(Boolean)
    .slice(0, input.maxSources);
  if (selectedSourceIds.length === 0) return [];

  const supabase = getCareerPlaybookBusinessContextSupabase();
  const { data: sourceRows, error: sourceError } = await supabase
    .from('career_playbook_sources')
    .select('id, filename, status, file_catalog_id')
    .eq('playbook_id', input.playbookId)
    .in('id', selectedSourceIds)
    .neq('status', 'removed');

  if (sourceError) {
    logger.warn(
      {
        err: sourceError.message,
        playbookId: input.playbookId,
        sourceCount: selectedSourceIds.length,
      },
      'Failed to load Career Playbook business context sources'
    );
    return [];
  }

  const sources = (sourceRows ?? []) as CareerPlaybookSourceRecord[];
  const fileCatalogIds = sources
    .filter(source => source.status === 'ready')
    .map(source => source.file_catalog_id)
    .filter((id): id is string => Boolean(id));
  const fileById = new Map<string, FileCatalogSourceRecord>();

  if (fileCatalogIds.length > 0) {
    const { data: fileRows, error: fileError } = await supabase
      .from('file_catalog')
      .select('id, filename, processed_content, markdown_content')
      .in('id', fileCatalogIds);

    if (fileError) {
      logger.warn(
        {
          err: fileError.message,
          playbookId: input.playbookId,
          fileCount: fileCatalogIds.length,
        },
        'Failed to load Career Playbook business context source evidence'
      );
    } else {
      for (const file of (fileRows ?? []) as FileCatalogSourceRecord[]) {
        fileById.set(file.id, file);
      }
    }
  }

  return sources.map(source => ({
    ...source,
    file: source.file_catalog_id ? fileById.get(source.file_catalog_id) : undefined,
  }));
}

export function hasPendingCareerPlaybookBusinessContextSources(
  result: Pick<RefreshCareerPlaybookBusinessContextDigestResult, 'hasPendingSources'>
): boolean {
  return result.hasPendingSources;
}

export async function refreshCareerPlaybookBusinessContextDigest(
  input: RefreshCareerPlaybookBusinessContextDigestInput
): Promise<RefreshCareerPlaybookBusinessContextDigestResult> {
  const context = CareerPlaybookBusinessContextSchema.parse(input.context);
  if (context.mode === 'universal') {
    return {
      context,
      sourceExcerpts: '- none',
      hasPendingSources: false,
      hasFailedSources: false,
    };
  }

  const sources = await loadBusinessContextSources({
    playbookId: input.playbookId,
    sourceIds: context.source_ids,
    maxSources: input.maxSources,
  });
  const hasPendingSources = sources.some(source =>
    ['uploaded', 'processing'].includes(source.status)
  );
  const hasFailedSources = sources.some(source => source.status === 'failed');
  const sourceTexts = sources
    .map(source => digestSourceContent(source.file))
    .filter((content): content is string => Boolean(content));
  const digest = buildDigestFromText({
    context,
    sourceTexts,
    freeformText: input.freeformText ?? '',
    hasPendingSources,
    hasFailedSources,
  });
  const hasDigestContent = digestHasContent(digest);
  const refreshedContext = CareerPlaybookBusinessContextSchema.parse({
    ...context,
    status: hasPendingSources ? 'collecting' : hasDigestContent ? 'ready' : 'collecting',
    digest,
    source_ids: digest.source_ids,
    updated_at: new Date().toISOString(),
  });

  return {
    context: refreshedContext,
    sourceExcerpts: formatLoadedSourceEvidence(sources, {
      maxCharsPerSource: input.maxCharsPerSource,
      maxAggregateTokens: input.maxAggregateTokens,
    }),
    hasPendingSources,
    hasFailedSources,
  };
}

export async function loadCareerPlaybookBusinessContextSourceExcerpts(input: {
  playbookId?: string;
  context: CareerPlaybookBusinessContext;
  maxSources?: number;
  maxCharsPerSource?: number;
  maxAggregateTokens?: number;
}): Promise<string> {
  const sourceIds = Array.from(new Set(input.context.source_ids)).filter(Boolean);
  if (input.context.mode === 'universal' || sourceIds.length === 0) return '- none';

  if (!input.playbookId) {
    return [
      'Uploaded source files are recorded, but source evidence was not loaded because playbook_id is missing.',
      'Do not infer company facts from source ids. Ask targeted follow-up questions for missing details.',
    ].join('\n');
  }

  try {
    const sources = await loadBusinessContextSources({
      playbookId: input.playbookId,
      sourceIds,
      maxSources: input.maxSources,
    });

    if (sources.length === 0) {
      return 'Uploaded source ids were provided, but no matching source records were found for this playbook. Do not infer facts from source ids.';
    }

    return formatLoadedSourceEvidence(sources, {
      maxCharsPerSource: input.maxCharsPerSource,
      maxAggregateTokens: input.maxAggregateTokens,
    });
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        playbookId: input.playbookId,
      },
      'Unexpected error while loading Career Playbook business context source evidence'
    );
    return 'Uploaded source files are recorded, but source evidence could not be loaded. Do not infer facts from source ids.';
  }
}
