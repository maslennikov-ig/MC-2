/**
 * Config seed drift comparison (mc2-5p609).
 *
 * The seed silently fell twenty phases behind the database for two months
 * because nothing compared the two. What matters here is what counts as drift,
 * so the comparison is tested directly rather than through a live connection.
 */
import { describe, expect, it } from 'vitest';

import { compareSeedToDatabase, type SeedRow } from '../../../scripts/check-config-seed-drift';

const row = (overrides: Partial<SeedRow> = {}): SeedRow => ({
  config_type: 'global',
  course_id: null,
  phase_name: 'stage_6_normal',
  language: 'any',
  context_tier: 'standard',
  judge_role: null,
  model_id: 'openai/gpt-5.6-luna',
  fallback_model_id: '~deepseek/deepseek-v4-flash-latest',
  ...overrides,
});

describe('config seed drift comparison', () => {
  it('reports no drift when the seed matches the table', () => {
    const rows = [row(), row({ phase_name: 'stage_6_simple' })];

    const result = compareSeedToDatabase(rows, rows);

    expect(result.hasDrift).toBe(false);
    expect(result.seedCount).toBe(2);
    expect(result.dbCount).toBe(2);
  });

  it('catches a phase the database has and the seed does not', () => {
    // This is the exact 2026-06 failure: new phases landed in the database and
    // the seed refresh that should have picked them up was silently failing.
    const dbRows = [row(), row({ phase_name: 'stage_career_playbook_spec' })];

    const result = compareSeedToDatabase([row()], dbRows);

    expect(result.hasDrift).toBe(true);
    expect(result.missingFromSeed).toHaveLength(1);
    expect(result.missingFromSeed[0]).toContain('stage_career_playbook_spec');
  });

  it('catches a model changed in the database but not in the seed', () => {
    const result = compareSeedToDatabase(
      [row({ model_id: 'moonshotai/kimi-k2-thinking' })],
      [row({ model_id: 'openai/gpt-5.6-luna' })]
    );

    expect(result.hasDrift).toBe(true);
    expect(result.changedModels[0]).toContain('kimi-k2-thinking');
    expect(result.changedModels[0]).toContain('gpt-5.6-luna');
  });

  it('catches a changed fallback even when the primary matches', () => {
    const result = compareSeedToDatabase(
      [row({ fallback_model_id: 'z-ai/glm-5.2' })],
      [row({ fallback_model_id: '~deepseek/deepseek-v4-flash-latest' })]
    );

    expect(result.hasDrift).toBe(true);
    expect(result.changedModels).toHaveLength(1);
  });

  it('catches a row the seed still carries after it left the table', () => {
    const result = compareSeedToDatabase([row(), row({ phase_name: 'stage_6_retired' })], [row()]);

    expect(result.hasDrift).toBe(true);
    expect(result.staleInSeed[0]).toContain('stage_6_retired');
  });

  it('treats judge roles as separate rows rather than duplicates', () => {
    const judges = ['primary', 'secondary', 'tiebreaker'].map(judge_role =>
      row({ phase_name: 'stage_6_judge', judge_role, model_id: `model-${judge_role}` })
    );

    const result = compareSeedToDatabase(judges, judges);

    expect(result.hasDrift).toBe(false);
    expect(result.seedCount).toBe(3);
  });

  it('ignores course overrides, which the offline seed deliberately does not carry', () => {
    // During an outage there is no course context to apply an override to, so
    // the generator emits global rows only. Comparing overrides reported drift
    // on every one that existed.
    const result = compareSeedToDatabase(
      [row()],
      [row(), row({ config_type: 'course_override', course_id: 'course-1' })]
    );

    expect(result.hasDrift).toBe(false);
  });

  it('ignores stage_6_content, which the generator injects with no database row', () => {
    const result = compareSeedToDatabase([row(), row({ phase_name: 'stage_6_content' })], [row()]);

    expect(result.hasDrift).toBe(false);
  });
});
