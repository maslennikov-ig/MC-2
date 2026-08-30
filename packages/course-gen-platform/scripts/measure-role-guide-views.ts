import 'dotenv/config';

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  type CareerPlaybookAudience,
  type CareerPlaybookBlockId,
  type CareerPlaybookBlockState,
} from '@megacampus/shared-types';
import { buildRoleGuideView } from '@/stages/stage-career-playbook/nodes/final-assembler';

/**
 * How well does the audience split hold up on stored playbooks?
 *
 * A view is a separately read document, so the question is not "did we filter
 * the blocks" — the catalogue answers that by construction — but "does what a
 * reader is handed still make sense on its own". The measurable form of that is
 * a cross-reference: a block that says "see Block 5" inside a view that has no
 * Block 5 sends its reader to a page they were never given.
 *
 * Read-only. No provider call, no write, no cost.
 */

const AUDIENCES: readonly CareerPlaybookAudience[] = ['employee', 'manager', 'hr'];

/** "Block 5", "Блок 5", "блока 5", "Block №5". */
const BLOCK_REFERENCE = /(?:\bblock|\bблок\p{L}*)\s*№?\s*(\d{1,2})/giu;

const CANONICAL_BLOCK_IDS = CAREER_PLAYBOOK_BLOCK_CATALOG.map(block => block.blockId);

export interface StoredPlaybook {
  id: string;
  language: string | null;
  generated_blocks: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> | null;
}

export interface DanglingReference {
  audience: CareerPlaybookAudience;
  from: CareerPlaybookBlockId;
  to: CareerPlaybookBlockId;
}

export interface ViewMeasurement {
  audience: CareerPlaybookAudience;
  blockCount: number;
  characters: number[];
  references: number;
  dangling: DanglingReference[];
  playbooksWithDangling: number;
}

export function blocksInView(audience: CareerPlaybookAudience): CareerPlaybookBlockId[] {
  return CAREER_PLAYBOOK_BLOCK_CATALOG.filter(block =>
    (block.audiences as readonly string[]).includes(audience)
  ).map(block => block.blockId);
}

/**
 * Every reference a view makes to a block, split into resolvable and dangling.
 * A block referring to itself is not a reference to follow.
 */
export function collectViewReferences(
  playbooks: readonly StoredPlaybook[],
  audience: CareerPlaybookAudience
): { references: number; dangling: DanglingReference[]; playbooksWithDangling: number } {
  const present = new Set<string>(blocksInView(audience));
  const dangling: DanglingReference[] = [];
  let references = 0;
  let playbooksWithDangling = 0;

  for (const playbook of playbooks) {
    const before = dangling.length;

    for (const blockId of present) {
      const content = playbook.generated_blocks?.[blockId as CareerPlaybookBlockId]?.content;
      if (!content) continue;

      for (const match of content.matchAll(BLOCK_REFERENCE)) {
        const target = `block_${Number(match[1])}` as CareerPlaybookBlockId;
        if (!CANONICAL_BLOCK_IDS.includes(target) || target === blockId) continue;

        references += 1;
        if (!present.has(target)) {
          dangling.push({ audience, from: blockId as CareerPlaybookBlockId, to: target });
        }
      }
    }

    if (dangling.length > before) playbooksWithDangling += 1;
  }

  return { references, dangling, playbooksWithDangling };
}

export function measureViews(playbooks: readonly StoredPlaybook[]): ViewMeasurement[] {
  return AUDIENCES.map(audience => {
    const { references, dangling, playbooksWithDangling } = collectViewReferences(
      playbooks,
      audience
    );
    return {
      audience,
      blockCount: blocksInView(audience).length,
      characters: playbooks.map(
        playbook => buildRoleGuideView(playbook.generated_blocks ?? {}, audience).length
      ),
      references,
      dangling,
      playbooksWithDangling,
    };
  });
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function blockTitle(blockId: string): string {
  return CAREER_PLAYBOOK_BLOCK_CATALOG.find(block => block.blockId === blockId)?.title ?? blockId;
}

function blockReaders(blockId: string): string {
  return (
    CAREER_PLAYBOOK_BLOCK_CATALOG.find(block => block.blockId === blockId)?.audiences.join('+') ??
    'none'
  );
}

async function loadCompletedPlaybooks(limit: number): Promise<StoredPlaybook[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('career_playbooks')
    .select('id, language, generated_blocks')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).filter((row): row is StoredPlaybook =>
    CANONICAL_BLOCK_IDS.every(blockId => {
      const content = (row as StoredPlaybook).generated_blocks?.[blockId]?.content;
      return typeof content === 'string' && content.trim().length > 0;
    })
  );
}

async function main(): Promise<void> {
  const playbooks = await loadCompletedPlaybooks(200);
  if (playbooks.length === 0) {
    console.log('No completed playbook carries all stored blocks; nothing to measure.');
    return;
  }

  const fullCharacters = playbooks.map(playbook =>
    CANONICAL_BLOCK_IDS.reduce(
      (sum, blockId) => sum + (playbook.generated_blocks?.[blockId]?.content.trim().length ?? 0),
      0
    )
  );
  const measurements = measureViews(playbooks);
  const fullMedian = median(fullCharacters);

  console.log(`Playbooks measured: ${playbooks.length}`);
  console.log('\n## View size');
  console.log('| View | Blocks | Median characters | Share of the whole document |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const view of measurements) {
    const chars = median(view.characters);
    console.log(
      `| ${view.audience} | ${view.blockCount} | ${chars} | ${((chars / fullMedian) * 100).toFixed(0)}% |`
    );
  }
  console.log(`| (whole document) | ${CANONICAL_BLOCK_IDS.length} | ${fullMedian} | 100% |`);

  console.log('\n## References to a block the reader was not given');
  console.log('| View | References | Dangling | Rate | Playbooks affected |');
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const view of measurements) {
    const rate = view.references === 0 ? 0 : (view.dangling.length / view.references) * 100;
    console.log(
      `| ${view.audience} | ${view.references} | ${view.dangling.length} | ${rate.toFixed(0)}% | ${view.playbooksWithDangling}/${playbooks.length} |`
    );
  }

  console.log('\n## Which block the broken links point at');
  console.log('| Target | Title | Its readers | Dangling references |');
  console.log('| --- | --- | --- | ---: |');
  const byTarget = new Map<string, number>();
  for (const view of measurements) {
    for (const reference of view.dangling) {
      byTarget.set(reference.to, (byTarget.get(reference.to) ?? 0) + 1);
    }
  }
  for (const [target, count] of [...byTarget].sort((left, right) => right[1] - left[1])) {
    console.log(`| ${target} | ${blockTitle(target)} | ${blockReaders(target)} | ${count} |`);
  }

  console.log('\n## What one added block would repair');
  for (const view of measurements) {
    if (view.dangling.length === 0) {
      console.log(`${view.audience}: no dangling reference.`);
      continue;
    }
    const perTarget = new Map<string, number>();
    for (const reference of view.dangling) {
      perTarget.set(reference.to, (perTarget.get(reference.to) ?? 0) + 1);
    }
    const ranked = [...perTarget]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(
        ([target, count]) =>
          `${target} (−${count}, ${((count / view.dangling.length) * 100).toFixed(0)}%)`
      );
    console.log(`${view.audience}: ${view.dangling.length} dangling; adding ${ranked.join(', ')}`);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
