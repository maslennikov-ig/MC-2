import {
  CareerPlaybookBusinessContextSchema,
  type CareerPlaybookBusinessContext,
  type CareerPlaybookBusinessContextDigest,
  type CareerPlaybookQAData,
} from '@megacampus/shared-types';

const DIGEST_LABELS: Array<[keyof CareerPlaybookBusinessContextDigest, string]> = [
  ['product', 'Product / offer'],
  ['customers', 'Customers / market'],
  ['sales_channels', 'Sales channels'],
  ['processes', 'Processes'],
  ['metrics', 'Metrics'],
  ['org_structure', 'Organization structure'],
  ['constraints', 'Constraints'],
];

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
