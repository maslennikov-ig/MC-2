/**
 * Contract: a course's money lives in one table, whoever spent it.
 *
 * Two paths spent real money outside `generation_trace`, and the epic that
 * priced the pipeline left them named rather than fixed.
 *
 * Document evidence (mc2-b7olk.4) priced its own calls into the
 * document-evidence coverage ledger. The spend was recorded, just not where
 * `courses.estimated_cost_usd` — a SUM over the trace — could see it. Deciding
 * to teach the course total to read two tables would have put the same truth in
 * two places; instead the calls now write a trace row like every other call, and
 * the coverage ledger stays a record of coverage.
 *
 * Editing (mc2-b7olk.5) had no stage at all: `stageOfPhase` understood
 * `stage_1..stage_7` and nothing else, so a `chat_*` or `inline_*` phase could
 * not be recorded even with a course in hand. A user could rewrite a course all
 * day for a displayed cost of zero. Edits now have a stage of their own, are
 * counted in the course total, and are reported apart from the pipeline stages —
 * because an edit is not a stage, and stage 0 already means "unreadable".
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stageOfPhase } from '@/shared/llm/model-cost-callbacks';

const SRC = join(__dirname, '../../../../src');

function read(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), 'utf8');
}

/**
 * Every `.ts` in a directory, concatenated.
 *
 * The evidence extraction calls used to all sit in `card-generator.ts`, and this guard counted
 * them there. When that file was split, two of the three moved to `evidence-extraction-port.ts`
 * and the count dropped to one — the calls were still priced, but the guard could no longer see
 * them. A guard a file split can blind is not a guard, so it reads the whole module group.
 */
function readDirectory(relativePath: string): string {
  const directory = join(SRC, relativePath);
  return readdirSync(directory)
    .filter(entry => entry.endsWith('.ts'))
    .map(entry => readFileSync(join(directory, entry), 'utf8'))
    .join('\n');
}

describe('document evidence writes to the course ledger', () => {
  const evidenceModules = readDirectory('stages/stage4-analysis/evidence');
  // Both of these read a module GROUP rather than a named file, for the reason recorded on
  // `readDirectory`: conflict detection and the phase that wires it have each since been split
  // across siblings, and a guard a file split can blind is not a guard.
  const conflictDetector = evidenceModules;
  const wiring = readDirectory('stages/stage4-analysis');

  it('prices each of its three extraction calls', () => {
    const phases = evidenceModules.match(/phase: 'stage_4_evidence_\w+'/g) ?? [];
    expect(phases).toHaveLength(3);
  });

  it('prices conflict detection', () => {
    expect(conflictDetector).toContain("phase: 'stage_4_conflict_detection'");
  });

  it('is handed the course by the phase that runs it', () => {
    // The ports take a modelId and had no courseId in their signature, so the
    // calls could not have been priced even if they had asked to be.
    expect(wiring).toContain('createProductionStructuredEvidencePort(modelId, context.courseId)');
    expect(wiring).toContain('createProductionEvidenceExtractor(modelId, context.courseId)');
    expect(wiring).toContain('courseId: context.courseId');
  });
});

describe('an edit is spend on the course', () => {
  it('gives chat and inline phases a stage', () => {
    expect(stageOfPhase('chat_stage_6_refinement')).toBe('stage_edit');
    expect(stageOfPhase('chat_global_guidance')).toBe('stage_edit');
    expect(stageOfPhase('inline_element_crud')).toBe('stage_edit');
    expect(stageOfPhase('inline_block_regeneration')).toBe('stage_edit');
  });

  it('still reads a pipeline phase as its own stage', () => {
    expect(stageOfPhase('stage_6_content')).toBe('stage_6');
    expect(stageOfPhase('stage_7')).toBe('stage_7');
  });

  it('does not invent a stage for a phase it cannot place', () => {
    expect(stageOfPhase('nightly_reindex')).toBeUndefined();
  });

  it('charges every editing entry point', () => {
    const callers = [
      'orchestrator/handlers/block-regeneration-handler.ts',
      'server/routers/generation/editing/regeneration.router.ts',
      'server/routers/generation/editing/element-crud-helpers.ts',
      'server/routers/generation/editing/chat-mutation-helpers.ts',
      'server/routers/generation/editing/chat-intent-handlers.ts',
    ];
    for (const caller of callers) {
      expect(read(caller), caller).toContain("stage: 'stage_edit'");
    }
  });

  it('re-sums the course total, which no job is going to do for an edit', () => {
    const costs = read('shared/metrics/llm-cost.ts');
    expect(costs).toContain('refreshCourseTotalAfterEdit');
    expect(costs).toContain("if (context.stage !== 'stage_edit') return;");
  });

  it('reports editing apart from the numbered stages', () => {
    const tracking = read('services/token-tracking-service.ts');
    expect(tracking).toContain("if (row.stage === 'stage_edit')");
    expect(tracking).toContain('editing: { tokens: number; cost: number }');
  });
});
