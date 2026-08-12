/**
 * Routing seed integrity (mc2-pqjgl, mc2-t6iec).
 *
 * The database has a unique index guarding one active row per routing key, but
 * it took until 2026-08-12 to actually hold: Postgres treats NULLs as distinct,
 * every non-judge phase has `judge_role IS NULL`, and so two identical active
 * rows for `inline_block_regeneration` and `inline_element_crud` sat there from
 * 2026-02-11. `.maybeSingle()` errors on two rows, so the lookup reported a
 * database outage and silently used the frozen seed instead.
 *
 * `config-seed.json` is generated from that table, so it carries the same shape.
 * These checks run offline and fail on the file, which is the earliest place a
 * duplicate or a self-defeating fallback can be caught.
 */
import { describe, expect, it } from 'vitest';

import seed from '@/config/config-seed.json';

interface SeedRow {
  phase_name: string;
  language: string;
  context_tier: string;
  judge_role: string | null;
  config_type: string;
  course_id: string | null;
  model_id: string;
  fallback_model_id: string | null;
}

const rows = seed as unknown as SeedRow[];

const routingKey = (row: SeedRow) =>
  [
    row.config_type,
    row.course_id ?? '-',
    row.phase_name,
    row.language,
    row.context_tier,
    row.judge_role ?? '-',
  ].join('|');

describe('routing seed integrity', () => {
  it('carries no rows at all only if something is badly wrong', () => {
    expect(rows.length).toBeGreaterThan(50);
  });

  it('holds exactly one row per routing key', () => {
    const seen = new Map<string, number>();
    for (const row of rows) {
      const key = routingKey(row);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);

    expect(duplicated).toEqual([]);
  });

  it('never points a fallback at the model it is meant to rescue', () => {
    const selfFallback = rows
      .filter(row => row.fallback_model_id && row.fallback_model_id === row.model_id)
      .map(row => `${row.phase_name}/${row.language}/${row.context_tier}`);

    expect(selfFallback).toEqual([]);
  });

  it('keeps the three Stage 6 judges on three distinct models', () => {
    const judges = rows.filter(row => row.phase_name === 'stage_6_judge' && row.judge_role);
    expect(judges.length).toBeGreaterThan(0);

    const byLanguage = new Map<string, Set<string>>();
    for (const judge of judges) {
      const models = byLanguage.get(judge.language) ?? new Set<string>();
      models.add(judge.model_id);
      byLanguage.set(judge.language, models);
    }

    // A panel voting with one model agrees with itself and is blind wherever
    // that model is blind, which defeats the point of CLEV voting.
    for (const [language, models] of byLanguage) {
      expect(models.size, `judges for language "${language}" collapsed onto one model`).toBe(
        judges.filter(judge => judge.language === language).length
      );
    }
  });
});
