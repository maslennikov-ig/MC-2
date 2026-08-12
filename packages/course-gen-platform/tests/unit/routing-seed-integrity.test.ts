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
  primary_display_name: string | null;
  fallback_display_name: string | null;
  reasoning_enabled: boolean | null;
  reasoning_max_tokens: number | null;
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

  it('never enables reasoning without reserving a budget for it', () => {
    // Reasoning tokens are billed out of max_tokens. Enabled with no reserved
    // budget, the model spends the answer on thinking and returns a stub.
    const unbudgeted = rows
      .filter(row => row.reasoning_enabled && !row.reasoning_max_tokens)
      .map(row => row.phase_name);

    expect(unbudgeted).toEqual([]);
  });

  it('labels every row with the model it actually routes to', () => {
    // pipeline-admin showed "Kimi K2 Thinking" on rows routing to gpt-5.6-luna
    // for as long as the display names were maintained by hand.
    const mismatched = rows
      .filter(row => {
        if (!row.primary_display_name) return false;
        const label = row.primary_display_name.toLowerCase().replace(/[^a-z0-9]/gu, '');
        const model = row.model_id.toLowerCase().replace(/[^a-z0-9]/gu, '');
        const family = model.replace(/^[a-z]*(deepseek|openai|google|zai|minimax)/u, '');
        return !family.includes(label.slice(0, 6)) && !label.includes(family.slice(0, 6));
      })
      .map(row => `${row.phase_name}: "${row.primary_display_name}" vs ${row.model_id}`);

    expect(mismatched).toEqual([]);
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
