/**
 * A model identifier is declared once, and one phase has one answer.
 *
 * Written 2026-08-23 for two Stage 5 files, widened on 2026-08-28 to the whole
 * platform source tree after `mc2-u8kwx` counted the damage: ten registries
 * naming twenty models, and **eleven phases where the hardcoded emergency path
 * disagreed with the database it was standing in for**. `stage_5_normal` and
 * `stage_5_escalation` said `moonshotai/kimi-k2-thinking` where the table said
 * Luna; `stage_5_complex` said `qwen/qwen3.7-plus`; `stage_7_cover` still named
 * the image model replaced that morning.
 *
 * None of it was dormant. `langchain-models.ts` routes every failure of
 * `ModelConfigService` into that path, which is why sixty days of
 * `generation_trace` held eleven distinct model ids against nine configured
 * ones (mc2-a6qxc) — a mystery nobody could explain at the time.
 *
 * So the rule is not "tidy the constants". It is: a routing decision lives in
 * `llm_model_config`, the superadmin panel edits it, `config-seed.json` is the
 * committed snapshot, and `model-defaults.ts` names the five roles a snapshot
 * cannot express: default, its cross-vendor fallback, large-context, prose and
 * escalation. A literal anywhere else is a second answer nobody can see.
 *
 * The rule grandfathers what exists and fails only what is new.
 */

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MODEL_ID,
  PROSE_FALLBACK_MODEL_ID,
  PROSE_MODEL_ID,
  phaseNameSchema,
} from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';
import { getDefaultModelConfig } from '@/server/routers/pipeline-admin/constants';
import { resolveDefaultPhaseConfig } from '@/shared/llm/model-config-service';

const PLATFORM_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SHARED_TYPES_SRC = fileURLToPath(
  new URL('../../../../../shared-types/src/', import.meta.url)
);

/** `vendor/model-name` as it appears in source, quoted. */
const MODEL_ID_LITERAL = /'[a-z0-9-]+\/[a-z0-9][a-z0-9.\-:]*'/g;

/** Vendors OpenRouter serves. Narrow on purpose: `openai/resources/chat` is an import path. */
const OPENROUTER_VENDOR =
  /^'(openai|google|deepseek|qwen|moonshotai|anthropic|z-ai|minimax|meta|mistralai|x-ai|sourceful|bytedance-seed|krea|microsoft|nvidia|amazon|cohere|perplexity|xiaomi)\//;

/**
 * The files allowed to name a model, and why each is a declaration rather than
 * a copy. Anything not on this list must route through a named constant or the
 * phase config.
 */
const REGISTRIES: Record<string, string> = {
  // The rename map: retired ids are the keys, so they have to be spelt out.
  'shared-types/src/retired-model-ids.ts': 'the retired ids themselves',
  // The catalogue keys are model ids by definition.
  'shared-types/src/model-catalog.ts': 'catalogue keys and the live-routing list',
  // The four named roles every other file borrows from.
  // The five named roles every other file borrows from: default, its
  // cross-vendor fallback, large-context, prose, escalation.
  'shared-types/src/model-defaults.ts': 'the role constants themselves',
  // Image models: a separate OpenRouter catalogue, no phase config covers them.
  'src/stages/stage7-enrichments/services/image-generation-service.ts': 'image model registry',
  // Substring tests against a served id, not ids to request.
  'src/stages/stage6-lesson-content/judge/clev-voter-helpers.ts': 'judge-weight heuristics',
};

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', '--', 'src/**/*.ts'], {
    cwd: PLATFORM_ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter(
      relativePath =>
        // Probes and one-off benchmarks name a model because naming it is the
        // experiment. They reach no pipeline.
        !relativePath.startsWith('src/experiments/') &&
        !relativePath.startsWith('src/scripts/') &&
        !relativePath.endsWith('.example.ts')
    );
}

/** Comments are where the history lives; only code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

function modelLiterals(absolutePath: string): string[] {
  const code = stripComments(readFileSync(absolutePath, 'utf8'));
  return [
    ...new Set((code.match(MODEL_ID_LITERAL) ?? []).filter(id => OPENROUTER_VENDOR.test(id))),
  ];
}

describe('model identifiers are declared once', () => {
  it('no platform source file names a model outside the declared registries', () => {
    const offenders: Record<string, string[]> = {};

    for (const relativePath of sourceFiles()) {
      if (REGISTRIES[relativePath]) continue;
      const found = modelLiterals(`${PLATFORM_ROOT}${relativePath}`);
      if (found.length > 0) offenders[relativePath] = found;
    }

    // A new entry here is a routing decision written where the panel cannot
    // reach it. Use DEFAULT_MODEL_ID / DEFAULT_FALLBACK_MODEL_ID /
    // LARGE_CONTEXT_MODEL_ID / PROSE_MODEL_ID, or the phase config.
    expect(offenders).toEqual({});
  });

  it('the shared-types registries are the only ones there too', () => {
    const offenders: Record<string, string[]> = {};

    for (const file of ['stage6-model-config.ts', 'model-config.ts', 'pipeline-admin.ts']) {
      const found = modelLiterals(`${SHARED_TYPES_SRC}${file}`);
      if (found.length > 0) offenders[file] = found;
    }

    expect(offenders).toEqual({});
  });

  it('one phase has one answer: the admin default and the runtime default agree', () => {
    // These were separate tables until 2026-08-28 — `DEFAULT_MODEL_CONFIGS` in
    // pipeline-admin against `PHASE_FALLBACK_CONFIG` in shared/llm against the
    // seed — so "reset to default" in the panel could write a model the runtime
    // would never have chosen, and did: `stage_7_cover` was two routing
    // decisions behind and `stage_4_clarifying` fell back to
    // `anthropic/claude-sonnet-4`, an id in no catalogue here.
    const disagreements: Array<{ phase: string; admin?: string; runtime?: string }> = [];

    for (const phase of phaseNameSchema.options) {
      const admin = getDefaultModelConfig(phase);
      const runtime = resolveDefaultPhaseConfig(phase);
      if (admin?.modelId !== runtime?.modelId) {
        disagreements.push({ phase, admin: admin?.modelId, runtime: runtime?.modelId });
      }
    }

    expect(disagreements).toEqual([]);
  });

  it('every phase the panel can reset has a default to reset to', () => {
    const missing = phaseNameSchema.options.filter(phase => getDefaultModelConfig(phase) === null);

    expect(missing).toEqual([]);
  });

  it('every Stage 6 phase that authors prose resolves to PROSE_MODEL_ID', () => {
    // These are the phases whose output reaches the reader verbatim: the body,
    // the tier variants of the body, the expansion of a thin section, and the
    // rewrite of one that failed review.
    const authoring = [
      'stage_6_content',
      'stage_6_simple',
      'stage_6_normal',
      'stage_6_complex',
      'stage_6_section_expander',
      'stage_6_refinement',
    ] as const;

    for (const phase of authoring) {
      expect(STAGE6_CANONICAL_PHASE_DEFAULTS[phase].modelId, phase).toBe(PROSE_MODEL_ID);
      expect(STAGE6_CANONICAL_PHASE_DEFAULTS[phase].fallbackModelId, phase).toBe(
        PROSE_FALLBACK_MODEL_ID
      );
    }
  });

  it('phases that only edit or never reach the reader stay on the fast default', () => {
    // The counterpart of the rule above: stating it keeps the distinction from
    // eroding in either direction. A patcher applies one named instruction to
    // one span and has no room to invent a statistic, which is what the
    // 2026-08-22 comparison found DeepSeek doing when it was authoring.
    const notAuthoring = ['stage_6_patcher', 'stage_6_arbiter', 'stage_6_rag_planning'] as const;

    for (const phase of notAuthoring) {
      expect(STAGE6_CANONICAL_PHASE_DEFAULTS[phase].modelId, phase).toBe(DEFAULT_MODEL_ID);
    }
  });

  it('the prose pair crosses vendors, so one outage cannot take out both', () => {
    const vendor = (id: string) => id.split('/')[0];

    expect(vendor(PROSE_MODEL_ID)).not.toBe(vendor(PROSE_FALLBACK_MODEL_ID));
  });
});
