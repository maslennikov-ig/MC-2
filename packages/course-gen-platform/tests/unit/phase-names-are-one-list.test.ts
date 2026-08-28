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

interface SeedRow {
  phase_name: string;
  judge_role?: string | null;
}

const seedPhases = [...new Set((seed as SeedRow[]).map(row => row.phase_name))].sort();
const panelPhases = new Set<string>(phaseNameSchema.options);

describe('phase names are one list', () => {
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
