import {
  CareerPlaybookBusinessContextSchema,
  type CareerPlaybookBusinessContext,
  type CareerPlaybookBusinessContextDigest,
  type CareerPlaybookQAData,
} from '@megacampus/shared-types';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';

const DIGEST_LABELS: Array<[keyof CareerPlaybookBusinessContextDigest, string]> = [
  ['product', 'Product / offer'],
  ['customers', 'Customers / market'],
  ['sales_channels', 'Sales channels'],
  ['processes', 'Processes'],
  ['metrics', 'Metrics'],
  ['org_structure', 'Organization structure'],
  ['constraints', 'Constraints'],
];

const DEFAULT_MAX_SOURCE_EXCERPTS = 4;
const DEFAULT_MAX_SOURCE_CHARS = 1_200;

interface CareerPlaybookSourceRecord {
  id: string;
  filename: string | null;
  status: string;
  file_catalog_id: string | null;
}

interface FileCatalogSourceRecord {
  id: string;
  filename: string | null;
  processed_content: string | null;
  markdown_content: string | null;
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

function firstAvailableContent(file: FileCatalogSourceRecord | undefined): string | null {
  if (!file) return null;
  return file.processed_content || file.markdown_content || null;
}

export async function loadCareerPlaybookBusinessContextSourceExcerpts(input: {
  playbookId?: string;
  context: CareerPlaybookBusinessContext;
  maxSources?: number;
  maxCharsPerSource?: number;
}): Promise<string> {
  const sourceIds = Array.from(new Set(input.context.source_ids)).filter(Boolean);
  if (input.context.mode === 'universal' || sourceIds.length === 0) return '- none';

  if (!input.playbookId) {
    return [
      'Uploaded source files are recorded, but source excerpts were not loaded because playbook_id is missing.',
      'Do not infer company facts from source ids. Ask targeted follow-up questions for missing details.',
    ].join('\n');
  }

  const selectedSourceIds = sourceIds.slice(0, input.maxSources ?? DEFAULT_MAX_SOURCE_EXCERPTS);
  const maxCharsPerSource = input.maxCharsPerSource ?? DEFAULT_MAX_SOURCE_CHARS;
  const supabase = getSupabaseAdmin() as any;

  try {
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
      return 'Uploaded source files are recorded, but source metadata could not be loaded. Do not infer facts from source ids.';
    }

    const sources = (sourceRows ?? []) as CareerPlaybookSourceRecord[];
    if (sources.length === 0) {
      return 'Uploaded source ids were provided, but no matching source records were found for this playbook. Do not infer facts from source ids.';
    }

    const fileCatalogIds = sources
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
          'Failed to load Career Playbook business context file excerpts'
        );
      } else {
        for (const file of (fileRows ?? []) as FileCatalogSourceRecord[]) {
          fileById.set(file.id, file);
        }
      }
    }

    return sources
      .map((source, index) => {
        const file = source.file_catalog_id ? fileById.get(source.file_catalog_id) : undefined;
        const content = firstAvailableContent(file);
        const filename = source.filename || file?.filename || `source-${index + 1}`;

        if (!content) {
          return [
            `[Source ${index + 1}: ${filename}]`,
            `Status: ${source.status}. Processed text is not available yet.`,
            'Do not infer facts from this file. Ask the user targeted questions if these facts are needed.',
          ].join('\n');
        }

        return [
          `[Source ${index + 1}: ${filename}]`,
          `Status: ${source.status}.`,
          truncateSourceText(content, maxCharsPerSource),
        ].join('\n');
      })
      .join('\n\n');
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        playbookId: input.playbookId,
      },
      'Unexpected error while loading Career Playbook business context source excerpts'
    );
    return 'Uploaded source files are recorded, but source excerpts could not be loaded. Do not infer facts from source ids.';
  }
}
