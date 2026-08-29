import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  type CareerPlaybookAudience,
  type CareerPlaybookBlockId,
} from '@megacampus/shared-types';

const AUDIENCES_BY_BLOCK = new Map<CareerPlaybookBlockId, readonly CareerPlaybookAudience[]>(
  CAREER_PLAYBOOK_BLOCK_CATALOG.map(block => [block.blockId, block.audiences])
);

export function getCareerPlaybookBlockAudiences(
  blockId: CareerPlaybookBlockId
): readonly CareerPlaybookAudience[] {
  return AUDIENCES_BY_BLOCK.get(blockId) ?? [];
}

export function careerPlaybookBlocksShareAudience(
  leftBlockId: CareerPlaybookBlockId,
  rightBlockId: CareerPlaybookBlockId
): boolean {
  const rightAudiences = getCareerPlaybookBlockAudiences(rightBlockId);
  return getCareerPlaybookBlockAudiences(leftBlockId).some(audience =>
    rightAudiences.includes(audience)
  );
}

export function careerPlaybookBlockSharesAnyTargetAudience(
  blockId: CareerPlaybookBlockId,
  targetBlockIds: readonly CareerPlaybookBlockId[]
): boolean {
  return targetBlockIds.some(targetBlockId =>
    careerPlaybookBlocksShareAudience(blockId, targetBlockId)
  );
}

/**
 * Render "blockId: reader, reader" lines for the given blocks. Shared by the
 * group generator (its own output blocks) and the cross-block judge (every
 * canonical block, since a repeated topic between two blocks is only a defect
 * when they share a reader).
 */
export function formatCareerPlaybookBlockAudiences(
  blockIds: readonly CareerPlaybookBlockId[]
): string {
  const blockIdSet = new Set(blockIds);

  return CAREER_PLAYBOOK_BLOCK_CATALOG.filter(block => blockIdSet.has(block.blockId))
    .map(block => `- ${block.blockId}: ${block.audiences.join(', ')}`)
    .join('\n');
}
