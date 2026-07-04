import { logger } from '@/shared/logger';
import {
  CareerPlaybookRoleProfileSpecSchema,
  type CareerPlaybookRoleProfileSpec,
} from '@megacampus/shared-types';
import {
  CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS,
  findCanonicalBlocksForTopic,
  normalizeTopicKey,
  topicMatchesBlock,
} from '@/shared/prompts/career-playbook-block-topics';

type CareerPlaybookBlockBoundary = CareerPlaybookRoleProfileSpec['block_boundaries'][string];

export type CareerPlaybookBlockTopicDeviationKind =
  | 'missing'
  | 'missing_anchor'
  | 'cross_assignment';

export interface CareerPlaybookBlockTopicDeviation {
  blockId: string;
  kind: CareerPlaybookBlockTopicDeviationKind;
  expectedTopic: string;
  actualTopics: string[];
  /** For cross_assignment: block ids whose canonical topic the spec borrowed. */
  conflictingBlockIds?: string[];
}

/**
 * Detect where RoleProfileSpec.block_boundaries drifts from the canonical
 * 26-block layout: a block missing entirely, a block that lost its own topic,
 * or a block that borrowed another block id's canonical topic.
 */
export function findCanonicalBlockTopicDeviations(
  spec: CareerPlaybookRoleProfileSpec
): CareerPlaybookBlockTopicDeviation[] {
  const boundaries = spec.block_boundaries ?? {};
  const deviations: CareerPlaybookBlockTopicDeviation[] = [];

  for (const entry of CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS) {
    const boundary = boundaries[entry.blockId];
    if (!boundary) {
      deviations.push({
        blockId: entry.blockId,
        kind: 'missing',
        expectedTopic: entry.primaryTopic,
        actualTopics: [],
      });
      continue;
    }

    const primaryTopics = boundary.primary_topics ?? [];
    const hasAnchor = primaryTopics.some(topic => topicMatchesBlock(topic, entry));
    if (!hasAnchor) {
      deviations.push({
        blockId: entry.blockId,
        kind: 'missing_anchor',
        expectedTopic: entry.primaryTopic,
        actualTopics: primaryTopics,
      });
    }

    const conflicting = new Set<string>();
    for (const topic of primaryTopics) {
      if (topicMatchesBlock(topic, entry)) continue;
      for (const other of findCanonicalBlocksForTopic(topic, entry.blockId)) {
        conflicting.add(other.blockId);
      }
    }
    if (conflicting.size > 0) {
      deviations.push({
        blockId: entry.blockId,
        kind: 'cross_assignment',
        expectedTopic: entry.primaryTopic,
        actualTopics: primaryTopics,
        conflictingBlockIds: [...conflicting],
      });
    }
  }

  return deviations;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function dedupeByTopicKey(topics: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const topic of topics) {
    const key = normalizeTopicKey(topic);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(topic);
  }
  return result;
}

export interface NormalizeCanonicalBlockTopicsResult {
  spec: CareerPlaybookRoleProfileSpec;
  changedBlockIds: string[];
}

/**
 * Rebuild block_boundaries onto the canonical 26-block layout. Every content
 * block gets its canonical topic as the anchor primary topic; role-specific
 * wording that still belongs to the block is preserved, topics that belong to
 * another block id are dropped, and do_not_repeat keeps only cross-block guards.
 * The result is canonical by construction and re-validated against the schema;
 * on any unexpected failure the original (already valid) spec is returned so
 * normalization can never produce an invalid spec.
 */
export function normalizeRoleProfileSpecToCanonicalBlockTopics(
  spec: CareerPlaybookRoleProfileSpec
): NormalizeCanonicalBlockTopicsResult {
  const previousBoundaries = spec.block_boundaries ?? {};
  const nextBoundaries: Record<string, CareerPlaybookBlockBoundary> = {};
  const changedBlockIds: string[] = [];

  for (const entry of CAREER_PLAYBOOK_CANONICAL_BOUNDARY_BLOCKS) {
    const previous = previousBoundaries[entry.blockId];
    const previousPrimary = previous?.primary_topics ?? [];
    const previousDoNotRepeat = previous?.do_not_repeat ?? [];

    const anchorKey = normalizeTopicKey(entry.primaryTopic);
    const keptRefinements = previousPrimary.filter(
      topic => topicMatchesBlock(topic, entry) && normalizeTopicKey(topic) !== anchorKey
    );
    const primary_topics = dedupeByTopicKey([entry.primaryTopic, ...keptRefinements]);
    const do_not_repeat = dedupeByTopicKey(
      previousDoNotRepeat.filter(topic => !topicMatchesBlock(topic, entry))
    );

    nextBoundaries[entry.blockId] = { primary_topics, do_not_repeat };

    const changed =
      !previous ||
      !arraysEqual(previous.primary_topics ?? [], primary_topics) ||
      !arraysEqual(previous.do_not_repeat ?? [], do_not_repeat);
    if (changed) changedBlockIds.push(entry.blockId);
  }

  // Any non-canonical (e.g. hallucinated) block ids the model produced are
  // dropped by rebuilding from the canonical set; record them as changes.
  for (const key of Object.keys(previousBoundaries)) {
    if (!(key in nextBoundaries) && !changedBlockIds.includes(key)) {
      changedBlockIds.push(key);
    }
  }

  const candidate: CareerPlaybookRoleProfileSpec = {
    ...spec,
    block_boundaries: nextBoundaries,
  };

  const parsed = CareerPlaybookRoleProfileSpecSchema.safeParse(candidate);
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error.message },
      'career playbook canonical block-topic normalization produced an invalid spec; keeping original'
    );
    return { spec, changedBlockIds: [] };
  }

  return { spec: parsed.data, changedBlockIds };
}

/**
 * Build a single correction prompt that names the deviating block ids and
 * restates the canonical routing rules, used for the one retry before
 * deterministic normalization.
 */
export function buildCanonicalBlockTopicCorrectionPrompt(
  basePrompt: string,
  deviations: CareerPlaybookBlockTopicDeviation[]
): string {
  const lines = deviations.map(deviation => {
    const actual =
      deviation.actualTopics.length > 0 ? JSON.stringify(deviation.actualTopics) : '(missing)';
    return `- ${deviation.blockId}: primary_topics must anchor on "${deviation.expectedTopic}", but got ${actual}`;
  });

  return `${basePrompt}

Your previous RoleProfileSpec.block_boundaries did not follow the fixed 26-block layout.
Fix these block ids and resubmit the COMPLETE RoleProfileSpec JSON:
${lines.join('\n')}

Rules:
- Each block id keeps its canonical topic; never move a topic to a different block id.
- Route role emphasis into the block that owns it (metrics or forecasting -> block_6 and block_4; ownership -> block_3; strategic ties -> block_20).
- block_25 must be footer + revision cadence + MegaCampus CTA.
- Return ONLY valid JSON matching the RoleProfileSpec schema.`;
}
