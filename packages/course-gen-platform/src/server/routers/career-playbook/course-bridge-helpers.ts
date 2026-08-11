import anyAscii from 'any-ascii';
import {
  CareerPlaybookRoleProfileSpecSchema,
  DEFAULT_COURSE_STYLE,
  type CourseSize,
  type CourseStyle,
  type CareerPlaybookRoleProfileSpec,
  type Json,
  type Language,
} from '@megacampus/shared-types';
import type { CareerPlaybookWebResearchResult } from '../../../stages/stage-career-playbook/rag/web-research';
import {
  normalizeGeneratedBlocks,
  normalizeStoredQAData,
  toJson,
  type CareerPlaybookRow,
} from './service-mappers';

export interface CourseBridgeBrief {
  title: string;
  slugBase: string;
  courseDescription: string;
  targetAudience: string;
  learningOutcomes: string[];
  language: Language;
  courseSize: CourseSize;
  style: CourseStyle;
  settings: Json;
}

export interface CourseBridgeSourceDocument {
  filename: string;
  markdown: string;
  sourceUrls: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readString).filter((item): item is string => Boolean(item));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => value.trim().length > 0)));
}

function textFromBlocks(playbook: CareerPlaybookRow, blockIds: string[]): string[] {
  const blocks = normalizeGeneratedBlocks(playbook.generated_blocks);
  return blockIds
    .map(blockId => readString(blocks[blockId]?.content))
    .filter((content): content is string => Boolean(content));
}

function answerValue(playbook: CareerPlaybookRow, key: string): string | null {
  const qaData = normalizeStoredQAData(playbook.q_a_data);
  const answer = qaData.fixed.find(item => item.question_key === key);
  if (!answer) return null;
  return Array.isArray(answer.value) ? answer.value.join(', ') : answer.value;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

export function buildSlug(text: string, suffix?: string): string {
  let slug = anyAscii(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  const maxBaseLength = suffix ? 86 : 95;
  if (slug.length > maxBaseLength) {
    const lastDash = slug.substring(0, maxBaseLength).lastIndexOf('-');
    slug =
      lastDash > 50
        ? slug.substring(0, lastDash)
        : slug.substring(0, maxBaseLength).replace(/-+$/, '');
  }

  if (suffix) slug = `${slug}-${suffix}`;
  return slug.length >= 3 ? slug : suffix ? `course-${suffix}` : 'course';
}

function markdownList(title: string, values: string[]): string {
  if (values.length === 0) return '';
  return [`## ${title}`, ...values.map(value => `- ${value}`)].join('\n');
}

function sourceFilename(prefix: string, title: string): string {
  return `${prefix}-${buildSlug(title)}.md`;
}

function parseRoleProfileSpec(playbook: CareerPlaybookRow): CareerPlaybookRoleProfileSpec | null {
  const parsed = CareerPlaybookRoleProfileSpecSchema.safeParse(playbook.role_profile_spec);
  return parsed.success ? parsed.data : null;
}

function roleSpecTargetAudience(roleSpec: CareerPlaybookRoleProfileSpec | null): string | null {
  if (!roleSpec) return null;
  const audience = [
    roleSpec.position.level,
    roleSpec.position.department,
    roleSpec.position.specialization,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim();
  return audience || null;
}

function roleSpecDescriptionParts(roleSpec: CareerPlaybookRoleProfileSpec | null): string[] {
  if (!roleSpec) return [];
  return [
    markdownList('Primary KPIs', roleSpec.focus_areas.primary_kpis),
    markdownList('Critical competencies', roleSpec.focus_areas.critical_competencies),
    markdownList('Anti-goals', roleSpec.focus_areas.anti_goals),
    markdownList('Failure patterns', roleSpec.focus_areas.failure_patterns),
  ].filter(Boolean);
}

export function persistedWebResearch(
  playbook: CareerPlaybookRow
): CareerPlaybookWebResearchResult | null {
  const directResearch = normalizeWebResearchResult(playbook.web_research);
  if (directResearch) return directResearch;

  const roleSpec = parseRoleProfileSpec(playbook);
  return normalizeWebResearchResult(roleSpec?.research);
}

function normalizeWebResearchResult(raw: unknown): CareerPlaybookWebResearchResult | null {
  const value = asRecord(raw);
  const sources = readStringArray(value.sources);
  const research: CareerPlaybookWebResearchResult = {
    kpis_insights: readStringArray(value.kpis_insights),
    trends_insights: readStringArray(value.trends_insights),
    onboarding_insights: readStringArray(value.onboarding_insights),
    sources,
    // A spec persisted before findings existed keeps its insight arrays but has
    // no claim-to-URL pairing to recover, so the course bridge treats it as
    // ungrounded rather than fabricating findings from loose URLs.
    findings: [],
    errors: readStringArray(value.errors),
    unavailable: sources.length === 0,
  };
  const hasResearch =
    research.kpis_insights.length > 0 ||
    research.trends_insights.length > 0 ||
    research.onboarding_insights.length > 0 ||
    research.sources.length > 0;

  return hasResearch ? research : null;
}

export function hasCourseBridgeSourceEvidence(
  sourceExcerpts: string | null | undefined
): sourceExcerpts is string {
  const text = sourceExcerpts?.trim();
  if (!text || text === '- none') return false;
  if (text.startsWith('Uploaded source ids were provided, but no matching source records')) {
    return false;
  }
  if (text.startsWith('Uploaded source files are recorded, but source evidence')) return false;
  if (text.startsWith('Source evidence pack.') && !text.includes('Authoritative source content')) {
    return false;
  }
  return true;
}

export function buildCourseBridgeBrief(playbook: CareerPlaybookRow): CourseBridgeBrief {
  const roleSpec = parseRoleProfileSpec(playbook);
  const looseRoleSpec = asRecord(playbook.role_profile_spec);
  const selectedBlocks = textFromBlocks(playbook, [
    'block_6',
    'block_7',
    'block_8',
    'block_14',
    'block_21',
  ]);
  const title =
    roleSpec?.position.title ??
    readString(looseRoleSpec.title) ??
    readString(playbook.position_title) ??
    answerValue(playbook, 'position') ??
    'Role Guide course';
  const rowAudience = [
    readString(playbook.level),
    readString(playbook.department),
    readString(playbook.specialization),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const targetAudience =
    (roleSpecTargetAudience(roleSpec) ??
      readString(looseRoleSpec.target_audience) ??
      rowAudience) ||
    `Professionals preparing for the ${title} role`;
  const learningOutcomes = uniqueStrings([
    ...(roleSpec?.focus_areas.primary_kpis ?? []),
    ...(roleSpec?.focus_areas.critical_competencies ?? []),
    ...readStringArray(looseRoleSpec.learning_outcomes),
  ]);
  const fallbackOutcomes = selectedBlocks.slice(0, 3).map(block => truncate(block, 140));
  const descriptionParts = [
    readString(looseRoleSpec.summary),
    readString(looseRoleSpec.description),
    ...roleSpecDescriptionParts(roleSpec),
    ...selectedBlocks,
    readString(playbook.final_markdown),
  ].filter((part): part is string => Boolean(part));

  return {
    title,
    slugBase: buildSlug(title),
    courseDescription: truncate(descriptionParts.join('\n\n'), 6000),
    targetAudience,
    learningOutcomes: learningOutcomes.length > 0 ? learningOutcomes : fallbackOutcomes,
    language: playbook.language,
    courseSize: 'auto',
    style: DEFAULT_COURSE_STYLE,
    settings: toJson({
      source: 'career_playbook',
      playbookId: playbook.id,
      bridgeVersion: 1,
      includeWebResearch: false,
      includeBusinessContextSources: false,
      style: DEFAULT_COURSE_STYLE,
    }),
  };
}

export function renderCourseBridgeBusinessContextSourceDocument(params: {
  brief: CourseBridgeBrief;
  sourceExcerpts: string | null;
}): CourseBridgeSourceDocument | null {
  if (!hasCourseBridgeSourceEvidence(params.sourceExcerpts)) return null;

  return {
    filename: sourceFilename('career-playbook-business-context', params.brief.title),
    markdown: [
      `# Uploaded business context for ${params.brief.title}`,
      '',
      'Source: Career Playbook uploaded business-context files',
      '',
      params.sourceExcerpts.trim(),
    ].join('\n'),
    sourceUrls: [],
  };
}

export function renderCourseBridgeSourceDocuments(params: {
  playbook: CareerPlaybookRow;
  brief: CourseBridgeBrief;
  research: CareerPlaybookWebResearchResult | null;
  includeWebResearch: boolean;
  businessContextSourceExcerpts?: string | null;
}): CourseBridgeSourceDocument[] {
  const documents: CourseBridgeSourceDocument[] = [
    {
      filename: sourceFilename('career-playbook', params.brief.title),
      markdown: [
        `# Career Playbook source: ${params.brief.title}`,
        '',
        'Source: Career Playbook',
        `Playbook ID: ${params.playbook.id}`,
        '',
        params.playbook.final_markdown || params.brief.courseDescription,
      ].join('\n'),
      sourceUrls: [],
    },
  ];
  const research = params.research;
  const hasResearch =
    params.includeWebResearch &&
    research &&
    (research.sources.length > 0 ||
      research.kpis_insights.length > 0 ||
      research.trends_insights.length > 0 ||
      research.onboarding_insights.length > 0);

  if (hasResearch) {
    documents.push({
      filename: sourceFilename('career-playbook-web-research', params.brief.title),
      markdown: [
        `# Web research for ${params.brief.title}`,
        '',
        markdownList('Sources', research.sources),
        markdownList('KPI insights', research.kpis_insights),
        markdownList('Trend insights', research.trends_insights),
        markdownList('Onboarding insights', research.onboarding_insights),
        markdownList('Research errors', research.errors),
      ]
        .filter(Boolean)
        .join('\n\n'),
      sourceUrls: research.sources,
    });
  }

  const businessContextDocument = renderCourseBridgeBusinessContextSourceDocument({
    brief: params.brief,
    sourceExcerpts: params.businessContextSourceExcerpts ?? null,
  });
  if (businessContextDocument) documents.push(businessContextDocument);

  return documents;
}
