import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  careerPlaybookBlockViewers,
  careerPlaybookViewerReceivesBlock,
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

/**
 * May a block point its reader at another block?
 *
 * Only when every reader who RECEIVES the source also receives the target. A
 * view is a separately read document: "see Block 5" inside a view that has no
 * Block 5 sends its reader to a page they were never given. Measured on the 14
 * stored playbooks before this existed, 71% of the HR view's cross-references
 * were of exactly that kind, and 12% and 16% of the employee and manager views —
 * see docs/career-playbook/2026-08-30-role-guide-views-measurement.md.
 *
 * The question is about readers, not about audiences, and since the owner ruling
 * of 2026-08-31 those differ: the reading rule is a hierarchy where the manager
 * also receives the employee's blocks and HR receives everything. So `block_26`
 * (manager+hr) may now cite `block_5` (employee+manager) — its two readers,
 * manager and HR, both hold it — while `block_9` (employee-only) still may not
 * cite `block_23`, which no employee receives.
 */
export function careerPlaybookBlockMayCite(
  sourceBlockId: CareerPlaybookBlockId,
  targetBlockId: CareerPlaybookBlockId
): boolean {
  const sourceViewers = careerPlaybookBlockViewers(sourceBlockId);
  if (sourceViewers.length === 0) return false;
  if (getCareerPlaybookBlockAudiences(targetBlockId).length === 0) return false;

  return sourceViewers.every(viewer => careerPlaybookViewerReceivesBlock(viewer, targetBlockId));
}

/**
 * Render, for each block a group is about to write, the blocks it may send its
 * reader to. The generator cannot derive this: it is told who reads its own
 * blocks, not which other block every one of those readers also holds.
 */
export function formatCareerPlaybookCitableBlocks(
  blockIds: readonly CareerPlaybookBlockId[]
): string {
  return blockIds
    .map(blockId => {
      const citable = CAREER_PLAYBOOK_BLOCK_CATALOG.filter(
        block => block.blockId !== blockId && careerPlaybookBlockMayCite(blockId, block.blockId)
      );
      const rendered =
        citable.length === 0
          ? 'none — every statement must stand on its own'
          : citable.map(block => `${block.blockId} (${block.title})`).join(', ');
      return `- ${blockId} may reference: ${rendered}`;
    })
    .join('\n');
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
