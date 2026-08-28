/**
 * A phase name exists in three places, and on 2026-08-28 they disagreed both
 * ways at once.
 *
 * The lists: the `llm_model_config.phase_name` CHECK constraint (72 entries),
 * the `PhaseName` union, and `phaseNameSchema` (61 each). The disagreement was
 * exactly symmetric, which is why neither side had ever noticed it:
 *
 *   * Twelve `stage_career_playbook_*` names the **database accepts and the
 *     panel rejected**. Every one had a live, active row; they generate and they
 *     cost money; and `resetModelConfigToDefault` refused the name at the tRPC
 *     boundary before any handler ran. Twelve phases editable only by a deploy.
 *   * One name — `stage_6_content` — the **panel accepted and the database
 *     rejected**. It is the phase whose `timeout_ms` is the Stage 6 job timeout,
 *     and it had no row at all: the insert answers `23514`, a CHECK no migration
 *     in this repository mentions (mc2-oyes7, and the same shape as the
 *     `generation_trace.stage` constraint before it).
 *
 * The CHECK cannot be read offline, so this guards the half that can be: every
 * phase the database has a row for — as recorded in the committed seed — must be
 * a phase the panel knows. That is the direction that fails silently. The other
 * direction fails loudly, with a Postgres error, the first time somebody presses
 * the button.
 */

import { describe, expect, it } from 'vitest';
import { phaseNameSchema } from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';

import seed from '@/config/config-seed.json';
import { DEFAULT_PHASE_CONFIGS } from '@/shared/llm/model-config-db';
import { MIN_ENDPOINT_THROUGHPUT_TPS } from '@/shared/llm/openrouter-endpoints';

interface SeedRow {
  phase_name: string;
  judge_role?: string | null;
}

const seedPhases = [...new Set((seed as SeedRow[]).map(row => row.phase_name))].sort();
const panelPhases = new Set<string>(phaseNameSchema.options);

describe('phase names are one list', () => {
  it('names each phase once', () => {
    // `z.enum` accepts a repeated member in silence, and `.options` is what the
    // other guards here iterate — so a duplicate makes them do the same work
    // twice and, worse, hides that somebody added a name without noticing it was
    // already there. Three were found on 2026-08-28: `stage_6_auto_last_chance`
    // and `stage_6_manual_regeneration` had been listed twice since the Stage 6
    // tier block was added, and `stage_6_content` was added a second time while
    // fixing the very drift this file guards.
    const counts = new Map<string, number>();
    for (const option of phaseNameSchema.options) {
      counts.set(option, (counts.get(option) ?? 0) + 1);
    }
    const repeated = [...counts].filter(([, n]) => n > 1).map(([phase]) => phase);

    expect(repeated).toEqual([]);
  });

  it('the panel knows every phase the database has a row for', () => {
    const unreachable = seedPhases.filter(phase => !panelPhases.has(phase));

    // A name here is a phase that runs, spends money, and cannot be changed
    // without a release. Add it to `PhaseName` and `phaseNameSchema`.
    expect(unreachable).toEqual([]);
  });

  it('every phase the panel knows resolves to a config', () => {
    // The counterpart: a name in the enum with nothing behind it makes the panel
    // offer a control that does nothing.
    const unresolvable = [...panelPhases].filter(
      phase => !DEFAULT_PHASE_CONFIGS[phase] && !DEFAULT_PHASE_CONFIGS['global_default']
    );

    expect(unresolvable).toEqual([]);
  });

  it('gives every phase enough time to spend its own token budget', () => {
    // A timeout below the time the phase's own `max_tokens` needs is a phase
    // able to abort its own work. The floor is `MIN_ENDPOINT_THROUGHPUT_TPS` —
    // the slowest endpoint routing will accept — and the margin is a factor of
    // two, because generation is the dominant term but connection and prompt
    // processing come out of the same budget.
    //
    // All seventeen rows carrying a timeout were under it on 2026-08-28, and
    // seven were not close: the Career Playbook groups allowed 238 s for 14 000
    // tokens, which needs 934 s. That half was live — the playbook applies its
    // configured timeout — so those phases could cut themselves off. The Stage 6
    // half was not applied at all until the same commit wired the column
    // through (mc2-jm25g).
    const tooTight = (seed as Array<SeedRow & { max_tokens?: number; timeout_ms?: number | null }>)
      .filter(row => !row.judge_role && typeof row.timeout_ms === 'number')
      .filter(row => {
        const budget = row.max_tokens ?? 0;
        const requiredMs = (budget / MIN_ENDPOINT_THROUGHPUT_TPS) * 2 * 1000;
        return (row.timeout_ms as number) < requiredMs;
      })
      .map(row => `${row.phase_name}: ${row.timeout_ms}ms for ${row.max_tokens} tokens`);

    expect(tooTight).toEqual([]);
  });

  it('the compiled Stage 6 defaults agree with the seed they overwrite', () => {
    // `loadDefaultPhaseConfigs` replaces every Stage 6 seed entry with the
    // compiled canonical one, so the database wins at runtime while the binary
    // wins offline. That asymmetry is defensible only while the two agree; when
    // they drift, a database-unreachable moment silently serves a model the
    // operator never chose — which is the whole failure `mc2-u8kwx` removed
    // everywhere else.
    const disagreements: Array<{ phase: string; seed?: string; compiled: string }> = [];

    for (const [phase, canonical] of Object.entries(STAGE6_CANONICAL_PHASE_DEFAULTS)) {
      const row = (seed as Array<SeedRow & { model_id?: string; context_tier?: string }>).find(
        entry =>
          entry.phase_name === phase && entry.context_tier === 'standard' && !entry.judge_role
      );
      if (!row) continue;
      if (row.model_id !== canonical.modelId) {
        disagreements.push({ phase, seed: row.model_id, compiled: canonical.modelId });
      }
    }

    expect(disagreements).toEqual([]);
  });
});
