/**
 * Career Playbook — canonical block-topic layout (single source of truth)
 * @module shared/prompts/career-playbook-block-topics
 *
 * The 26-block Role Guide layout is authoritative here. Group prompts,
 * CAREER_PLAYBOOK_MERMAID_REQUIREMENTS, the deterministic minimum checks, and
 * the block regenerator all assume the same fixed subject per block id. The
 * spec builder previously let the LLM reassign topics between block ids
 * (e.g. block_11=Forecasting, block_23=Career Pathing, block_25=Compliance),
 * which made RoleProfileSpec.block_boundaries disagree with the generated
 * blocks and drove the cross-block judge to the per-block regeneration cap.
 *
 * This module gives the spec builder one place to read canonical topics from,
 * both to constrain the spec-builder prompt and to deterministically normalize
 * spec output back onto the canonical layout. See bead mc2-1slzl.
 */

import type { CareerPlaybookBlockId } from '@megacampus/shared-types';

export interface CareerPlaybookCanonicalBlockTopic {
  /** Canonical block id: 'header' or 'block_1'..'block_26'. */
  blockId: CareerPlaybookBlockId;
  /** Canonical English title, aligned with group-generator block titles. */
  title: string;
  /** Canonical anchor topic used for block_boundaries.primary_topics. */
  primaryTopic: string;
  /**
   * Semantic variants that identify this block's subject. Used to (a) detect
   * when the spec reassigned a topic to the wrong block id and (b) preserve
   * role-specific wording refinements that still belong to this block.
   */
  aliases: string[];
  /**
   * Whether this block participates in block_boundaries. The Header is a title
   * block with no repetition concern, so it is excluded from boundaries but
   * still shown in the canonical layout for prompt clarity.
   */
  hasBoundaries: boolean;
}

/**
 * Canonical 26-block layout plus the Header. Order matches the assembled Role
 * Guide. Titles mirror group-generator.ts; primaryTopic values are the anchors
 * the cross-block judge compares generated content against.
 */
export const CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS: readonly CareerPlaybookCanonicalBlockTopic[] =
  [
    {
      blockId: 'header',
      title: 'Header',
      primaryTopic: 'role header and identity',
      aliases: ['header', 'role title header'],
      hasBoundaries: false,
    },
    {
      blockId: 'block_1',
      title: 'Mission and key results',
      primaryTopic: 'mission and key results',
      aliases: ['mission', 'key results', 'north star metric', 'job scorecard', 'okr'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_2',
      title: 'Anti-goals',
      primaryTopic: 'anti-goals',
      aliases: ['anti-goals', 'what this role does not do', 'non-goals', 'out of scope'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_3',
      title: 'Responsibility zones',
      primaryTopic: 'responsibility zones',
      aliases: ['responsibility zones', 'areas of responsibility', 'ownership areas', 'raci'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_4',
      title: 'Duties',
      primaryTopic: 'duties and cadence',
      aliases: ['duties', 'daily weekly monthly duties', 'operating cadence', 'recurring tasks'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_5',
      title: 'Decision authority matrix',
      primaryTopic: 'decision authority matrix',
      aliases: [
        'decision authority',
        'decision rights',
        'one-way two-way door',
        'authority matrix',
        'autonomy levels',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_6',
      title: 'KPI and metrics',
      primaryTopic: 'KPI and metrics',
      aliases: [
        'kpi',
        'metrics',
        'input output metrics',
        'performance metrics',
        'forecast',
        'forecast accuracy',
        'pipeline metrics',
        'revenue projections',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_7',
      title: 'Competencies',
      primaryTopic: 'competencies',
      aliases: [
        'competencies',
        'hard skills',
        'soft skills',
        'superpower',
        'skill map',
        'energy map',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_8',
      title: 'Tools and technologies',
      primaryTopic: 'tools and technologies',
      aliases: ['tools', 'technologies', 'tech stack', 'software', 'proficiency'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_9',
      title: 'Human-AI collaboration',
      primaryTopic: 'human-AI collaboration',
      aliases: [
        'human-ai collaboration',
        'how ai changes this role',
        'human agency scale',
        'ai copilot split',
        'automation split',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_10',
      title: 'Dependencies',
      primaryTopic: 'dependencies and collaboration',
      aliases: [
        'dependencies',
        'collaboration map',
        'blast radius',
        'communication charter',
        'stakeholders',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_11',
      title: 'Career growth',
      primaryTopic: 'career growth',
      aliases: [
        'career growth',
        'career path',
        'career pathing',
        'career development',
        'promotion criteria',
        'growth track',
        'ic track',
        'management track',
        'advancement',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_12',
      title: 'Candidate profile',
      primaryTopic: 'candidate profile',
      aliases: ['candidate profile', 'hiring profile', 'education and experience', 'gwc filter'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_13',
      title: 'Typical working day',
      primaryTopic: 'typical working day',
      aliases: ['typical working day', 'day in the life', 'hourly schedule', 'cognitive load'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_14',
      title: 'Onboarding',
      primaryTopic: 'onboarding plan',
      aliases: ['onboarding', 'first 5 wins', '30-60-90 plan', 'ramp plan', 'graduation criteria'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_15',
      title: 'Motivation system',
      primaryTopic: 'motivation system',
      aliases: ['motivation', 'amp levers', 'job crafting', 'incentives', 'career conversations'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_16',
      title: 'Processes',
      primaryTopic: 'processes and workflows',
      aliases: [
        'processes',
        'workflows',
        'regulations',
        'sbar',
        'main process',
        'do-confirm read-do',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_17',
      title: 'Red flags',
      primaryTopic: 'red flags and early warning',
      aliases: ['red flags', 'early warning system', 'disengagement stages', 'stay interview'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_18',
      title: 'FAQ',
      primaryTopic: 'FAQ',
      aliases: ['faq', 'frequently asked questions', 'common questions'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_19',
      title: 'Industry context',
      primaryTopic: 'industry context',
      aliases: [
        'industry context',
        'industry trends',
        'market context',
        'sector context',
        'durable skills',
        '3-layer context',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_20',
      title: 'Business goals',
      primaryTopic: 'business goals alignment',
      aliases: [
        'business goals',
        'link to business goals',
        'business impact',
        'context over control',
        'business model',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_21',
      title: 'Failure modes',
      primaryTopic: 'failure modes',
      aliases: ['failure modes', 'pre-mortem', 'fmea', 'how people fail'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_22',
      title: 'Working with me README',
      primaryTopic: 'working-with-me README',
      aliases: ['working with me', 'how to work with me', 'role readme', 'personal readme'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_23',
      title: 'Continuity protocol',
      primaryTopic: 'continuity protocol',
      aliases: [
        'continuity protocol',
        'continuity checklist',
        'succession',
        'handover',
        'knowledge transfer',
        'backup plan',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_24',
      title: 'Role Canvas',
      primaryTopic: 'role canvas',
      aliases: ['role canvas', 'one-page canvas', 'role summary canvas'],
      hasBoundaries: true,
    },
    {
      blockId: 'block_25',
      title: 'Footer and revision cadence',
      primaryTopic: 'footer, revision cadence, and MegaCampus CTA',
      aliases: [
        'footer',
        'revision cadence',
        'revision triggers',
        'review schedule',
        'version metadata',
        'when to review',
        'megacampus cta',
        'call to action',
      ],
      hasBoundaries: true,
    },
    {
      blockId: 'block_26',
      title: 'Implementation checklist',
      primaryTopic: 'implementation checklist',
      aliases: [
        'implementation checklist',
        'rollout checklist',
        'operationalize the guide',
        'manager hr employee checklist',
      ],
      hasBoundaries: true,
    },
  ];

/** Canonical entries that participate in block_boundaries (excludes Header). */
export const CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS: readonly CareerPlaybookCanonicalBlockTopic[] =
  CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS.filter(entry => entry.hasBoundaries);

/** Minimum length for a substring alias match; guards against noise like "ai". */
const MIN_SUBSTRING_MATCH_LENGTH = 4;

/** Lowercase, strip punctuation, and collapse whitespace for stable comparison. */
export function normalizeTopicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keysForBlock(entry: CareerPlaybookCanonicalBlockTopic): string[] {
  return [entry.primaryTopic, entry.title, ...entry.aliases]
    .map(normalizeTopicKey)
    .filter(key => key.length > 0);
}

/**
 * True when a free-form topic string clearly refers to this block's subject.
 * Matches on exact key, or on a substring in either direction when the shared
 * fragment is long enough to be meaningful.
 */
export function topicMatchesBlock(
  topic: string,
  entry: CareerPlaybookCanonicalBlockTopic
): boolean {
  const normalizedTopic = normalizeTopicKey(topic);
  if (normalizedTopic.length === 0) return false;

  return keysForBlock(entry).some(key => {
    if (key === normalizedTopic) return true;
    if (key.length >= MIN_SUBSTRING_MATCH_LENGTH && normalizedTopic.includes(key)) return true;
    if (normalizedTopic.length >= MIN_SUBSTRING_MATCH_LENGTH && key.includes(normalizedTopic)) {
      return true;
    }
    return false;
  });
}

/**
 * Canonical boundary blocks whose subject matches the given topic, excluding an
 * optional block being evaluated. Used to detect cross-block reassignment.
 */
export function findCanonicalBlocksForTopic(
  topic: string,
  excludeBlockId?: string
): CareerPlaybookCanonicalBlockTopic[] {
  return CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS.filter(
    entry => entry.blockId !== excludeBlockId && topicMatchesBlock(topic, entry)
  );
}

/**
 * Render the canonical layout as a compact instruction block for the spec
 * builder prompt. Keeps the prompt in lockstep with this single source of
 * truth so the prompt text never drifts from the enforced layout.
 */
export function formatCareerPlaybookCanonicalLayoutForPrompt(): string {
  return CAREER_PLAYBOOK_CANONICAL_BLOCK_TOPICS.map(entry => {
    const label = entry.blockId === 'header' ? 'header' : entry.blockId;
    return `- ${label}: ${entry.primaryTopic}`;
  }).join('\n');
}
