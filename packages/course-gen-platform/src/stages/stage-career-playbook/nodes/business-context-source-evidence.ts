import type { CareerPlaybookBusinessContext } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import { buildLoadedSourceEvidence, loadBusinessContextSources } from './business-context';

export interface CareerPlaybookBusinessContextSourceEvidenceResult {
  sourceExcerpts: string;
  hasAuthoritativeEvidence: boolean;
  unavailableReason:
    | 'none'
    | 'universal'
    | 'missing_playbook_id'
    | 'missing_source_records'
    | 'loader_unavailable'
    | 'no_authoritative_content';
}

export function inspectCareerPlaybookBusinessContextSourceEvidence(
  sourceExcerpts: string | null | undefined
): CareerPlaybookBusinessContextSourceEvidenceResult {
  const text = sourceExcerpts?.trim() ?? '';
  if (!text || text === '- none') {
    return {
      sourceExcerpts: text || '- none',
      hasAuthoritativeEvidence: false,
      unavailableReason: 'universal',
    };
  }
  if (text.startsWith('Uploaded source files are recorded, but source evidence was not loaded')) {
    return {
      sourceExcerpts: text,
      hasAuthoritativeEvidence: false,
      unavailableReason: 'missing_playbook_id',
    };
  }
  if (text.startsWith('Uploaded source ids were provided, but no matching source records')) {
    return {
      sourceExcerpts: text,
      hasAuthoritativeEvidence: false,
      unavailableReason: 'missing_source_records',
    };
  }
  if (
    text.startsWith('Uploaded source files are recorded, but source evidence could not be loaded')
  ) {
    return {
      sourceExcerpts: text,
      hasAuthoritativeEvidence: false,
      unavailableReason: 'loader_unavailable',
    };
  }
  if (text.startsWith('Source evidence pack.') && !text.includes('Authoritative source content')) {
    return {
      sourceExcerpts: text,
      hasAuthoritativeEvidence: false,
      unavailableReason: 'no_authoritative_content',
    };
  }

  return {
    sourceExcerpts: text,
    hasAuthoritativeEvidence: true,
    unavailableReason: 'none',
  };
}

export async function loadCareerPlaybookBusinessContextSourceEvidence(input: {
  playbookId?: string;
  context: CareerPlaybookBusinessContext;
  maxSources?: number;
  maxCharsPerSource?: number;
  maxAggregateTokens?: number;
}): Promise<CareerPlaybookBusinessContextSourceEvidenceResult> {
  const sourceIds = Array.from(new Set(input.context.source_ids)).filter(Boolean);
  if (input.context.mode === 'universal' || sourceIds.length === 0) {
    return {
      sourceExcerpts: '- none',
      hasAuthoritativeEvidence: false,
      unavailableReason: 'universal',
    };
  }

  if (!input.playbookId) {
    return {
      sourceExcerpts: [
        'Uploaded source files are recorded, but source evidence was not loaded because playbook_id is missing.',
        'Do not infer company facts from source ids. Ask targeted follow-up questions for missing details.',
      ].join('\n'),
      hasAuthoritativeEvidence: false,
      unavailableReason: 'missing_playbook_id',
    };
  }

  try {
    const sources = await loadBusinessContextSources({
      playbookId: input.playbookId,
      sourceIds,
      maxSources: input.maxSources,
    });

    if (sources.length === 0) {
      return {
        sourceExcerpts:
          'Uploaded source ids were provided, but no matching source records were found for this playbook. Do not infer facts from source ids.',
        hasAuthoritativeEvidence: false,
        unavailableReason: 'missing_source_records',
      };
    }

    const result = buildLoadedSourceEvidence(sources, {
      maxCharsPerSource: input.maxCharsPerSource,
      maxAggregateTokens: input.maxAggregateTokens,
    });

    return {
      sourceExcerpts: result.sourceExcerpts,
      hasAuthoritativeEvidence: result.hasAuthoritativeEvidence,
      unavailableReason: result.hasAuthoritativeEvidence ? 'none' : 'no_authoritative_content',
    };
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        playbookId: input.playbookId,
      },
      'Unexpected error while loading Career Playbook business context source evidence'
    );
    return {
      sourceExcerpts:
        'Uploaded source files are recorded, but source evidence could not be loaded. Do not infer facts from source ids.',
      hasAuthoritativeEvidence: false,
      unavailableReason: 'loader_unavailable',
    };
  }
}
