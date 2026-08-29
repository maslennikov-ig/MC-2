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
