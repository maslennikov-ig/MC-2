/**
 * Model identifiers belong in `model-defaults.ts` (as values) and in
 * `model-catalog.ts` (as registry keys). Everywhere else they are a copy.
 *
 * Written 2026-08-23 after `stage6-model-config.ts` was found carrying six
 * hand-typed copies of `'openai/gpt-5.6-luna'` — three that had been there a
 * while, three added the same hour while returning the authoring phases to Luna.
 * A retyped identifier is not a style problem: it is the reason a routing change
 * lands in five of six places and the sixth is discovered by a paid run.
 *
 * The rule grandfathers what exists and fails only what is new, so the
 * allowlist below is deliberate and each entry says why it is still a literal.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MODEL_ID,
  PROSE_FALLBACK_MODEL_ID,
  PROSE_MODEL_ID,
} from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';

const SHARED_TYPES_SRC = fileURLToPath(
  new URL('../../../../../shared-types/src/', import.meta.url)
);

/** `vendor/model-name` as it appears in source, quoted. */
const MODEL_ID_LITERAL = /'[a-z0-9-]+\/[a-z0-9][a-z0-9.\-:]*'/g;

/**
 * Literals that are allowed to stay, with the reason.
 *
 * `z-ai/glm-5.2` has no named constant yet. It is used by the two escalation
 * phases precisely because it is neither of the defaults, so a constant would
 * have to be named for that role before this entry can go.
 */
const GRANDFATHERED = new Set(["'z-ai/glm-5.2'"]);

describe('model identifiers are declared once', () => {
  it('stage6-model-config.ts names no model except the grandfathered escalation one', () => {
    const source = readFileSync(`${SHARED_TYPES_SRC}stage6-model-config.ts`, 'utf8');
    const found = (source.match(MODEL_ID_LITERAL) ?? []).filter(
      literal => !GRANDFATHERED.has(literal)
    );

    expect(found).toEqual([]);
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
