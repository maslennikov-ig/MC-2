/**
 * Phase configuration against the provider contract (mc2-o3s4r).
 *
 * `mc2-see4m` was not a bug in any one function. A phase config carried a
 * reasoning effort *and* a reasoning budget, OpenRouter accepts only one of the
 * two, and nothing in the repository compared the two sides. Every complex-tier
 * Stage 6 call was refused at the provider for a week. The unit test covering
 * it passed throughout, because it asserted the shape the code produced rather
 * than the shape the provider accepts.
 *
 * So these checks state the provider contract and read the configuration into
 * it, never the reverse. Each `it` is a sentence about what OpenRouter or the
 * model will accept; the committed seed, the canonical Stage 6 defaults and the
 * substitution tables are the inputs under test.
 *
 * Offline: `MODEL_CATALOG` and `config-seed.json` are both committed files.
 */
import { describe, expect, it } from 'vitest';

import {
  getModelCapabilities,
  LIVE_ROUTING_MODEL_IDS,
  modelSupportsReasoning,
  modelSupportsTemperature,
} from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';

import { buildCompletionRequest, buildReasoningPayload } from '@/shared/llm/client-helpers';
import {
  COLLISION_FALLBACK_MODEL_ID,
  RETIRED_MODEL_ID_REPLACEMENTS,
} from '@/shared/llm/model-config-db';
import seed from '@/config/config-seed.json';

interface SeedRow {
  phase_name: string;
  language: string;
  context_tier: string;
  is_active: boolean;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number | null;
  max_tokens: number;
  reasoning_enabled: boolean | null;
  reasoning_effort: string | null;
  reasoning_max_tokens: number | null;
}

const rows = (seed as unknown as SeedRow[]).filter(row => row.is_active);

const where = (row: SeedRow) => `${row.phase_name} [${row.language}/${row.context_tier}]`;

/** What the phase actually asks the provider to emit, reasoning included. */
const outputBudget = (row: SeedRow) =>
  row.max_tokens + (row.reasoning_enabled ? (row.reasoning_max_tokens ?? 0) : 0);

const liveRouting = new Set<string>(LIVE_ROUTING_MODEL_IDS);

describe('phase configuration against the provider contract', () => {
  it('reads a seed with rows in it', () => {
    // Guards every other check in this file: an empty array passes them all.
    expect(rows.length).toBeGreaterThan(50);
  });

  describe('OpenRouter accepts exactly one reasoning control', () => {
    it('sends the budget and drops the effort when a phase carries both', () => {
      // `400 Only one of "reasoning.effort" and "reasoning.max_tokens" can be
      // specified`. The budget is the half that must survive, because the
      // answer budget is grown by exactly this number downstream.
      const payload = buildReasoningPayload({ enabled: true, effort: 'high', maxTokens: 8000 });

      expect(payload).toEqual({ max_tokens: 8000 });
      expect(Object.keys(payload)).toHaveLength(1);
    });

    it('never emits both keys for any reasoning setting a phase can hold', () => {
      const settings = [
        { enabled: true, effort: 'low' as const, maxTokens: 512 },
        { enabled: true, effort: 'medium' as const, maxTokens: null },
        { enabled: true, effort: null, maxTokens: 4096 },
        { enabled: true, effort: 'high' as const, maxTokens: 64000 },
      ];

      for (const setting of settings) {
        const payload = buildReasoningPayload(setting);
        expect(
          'effort' in payload && 'max_tokens' in payload,
          `both controls sent for ${JSON.stringify(setting)}`
        ).toBe(false);
      }
    });
  });

  describe('a phase asks only for what its model accepts', () => {
    it('enables reasoning only on models whose catalogue entry accepts it', () => {
      // The client logs a warning and strips the parameter, so the phase
      // believes it is deliberating and no one is listening.
      const unheard = rows
        .filter(row => row.reasoning_enabled && !modelSupportsReasoning(row.model_id))
        .map(row => `${where(row)} -> ${row.model_id}`);

      expect(unheard).toEqual([]);
    });

    it('enables reasoning only on fallbacks that accept it too', () => {
      // The fallback runs the same request. A fallback that refuses reasoning
      // quietly answers a different question than the primary was asked.
      const unheard = rows
        .filter(
          row =>
            row.reasoning_enabled &&
            row.fallback_model_id &&
            !modelSupportsReasoning(row.fallback_model_id)
        )
        .map(row => `${where(row)} -> ${row.fallback_model_id}`);

      expect(unheard).toEqual([]);
    });

    it('reserves a budget wherever reasoning is enabled', () => {
      const unbudgeted = rows
        .filter(row => row.reasoning_enabled && !row.reasoning_max_tokens)
        .map(where);

      expect(unbudgeted).toEqual([]);
    });
  });

  describe('the request fits inside what the model can emit', () => {
    it('keeps answer budget plus reasoning budget under the primary ceiling', () => {
      // OpenRouter bills reasoning tokens against `max_tokens`, so the client
      // ADDS the reasoning budget to the answer budget. Checking `max_tokens`
      // alone passes a request the provider will refuse.
      const over = rows
        .filter(row => {
          const ceiling = getModelCapabilities(row.model_id)?.maxOutputTokens;
          return ceiling != null && outputBudget(row) > ceiling;
        })
        .map(
          row =>
            `${where(row)} -> ${row.model_id}: ${outputBudget(row)} > ${
              getModelCapabilities(row.model_id)?.maxOutputTokens
            }`
        );

      expect(over).toEqual([]);
    });

    it('keeps the same total under the fallback ceiling', () => {
      // The fallback inherits the phase budget unchanged, so a fallback with a
      // smaller ceiling turns a primary outage into a hard failure.
      const over = rows
        .filter(row => {
          if (!row.fallback_model_id) return false;
          const ceiling = getModelCapabilities(row.fallback_model_id)?.maxOutputTokens;
          return ceiling != null && outputBudget(row) > ceiling;
        })
        .map(
          row =>
            `${where(row)} -> ${row.fallback_model_id}: ${outputBudget(row)} > ${
              getModelCapabilities(row.fallback_model_id!)?.maxOutputTokens
            }`
        );

      expect(over).toEqual([]);
    });

    it('grows the answer budget by exactly the reasoning budget', () => {
      // States the arithmetic the two ceiling checks above depend on. If the
      // client ever carves the reasoning budget out of `max_tokens` instead,
      // those checks would be measuring a total nothing sends.
      const [, request] = buildCompletionRequest(
        'z-ai/glm-5.2',
        'prompt',
        'system',
        8000,
        0.7,
        false,
        { enabled: true, effort: 'high', maxTokens: 8000 }
      );

      expect(request.max_tokens).toBe(16000);
      expect(request.reasoning).toEqual({ max_tokens: 8000 });
    });
  });

  describe('a model that ignores a parameter is never sent it', () => {
    it('omits temperature for a model that does not honour it', () => {
      // GPT-5.6 exposes reasoning controls instead. Sending the value anyway
      // makes the configured number a claim rather than a setting.
      const ignoring = LIVE_ROUTING_MODEL_IDS.filter(id => !modelSupportsTemperature(id));
      expect(
        ignoring.length,
        'no live model ignores temperature — check the catalogue'
      ).toBeGreaterThan(0);

      for (const modelId of ignoring) {
        const [, request] = buildCompletionRequest(modelId, 'prompt', 'system', 1024, 0.3, false);
        expect('temperature' in request, `${modelId} was sent a temperature`).toBe(false);
      }
    });

    it('still sends temperature to a model that honours it', () => {
      const [, request] = buildCompletionRequest(
        '~deepseek/deepseek-v4-flash-latest',
        'prompt',
        'system',
        1024,
        0.3,
        false
      );

      expect(request.temperature).toBe(0.3);
    });

    it('omits reasoning for a model that does not accept it', () => {
      const refusing = Object.keys(RETIRED_MODEL_ID_REPLACEMENTS)
        .map(id => RETIRED_MODEL_ID_REPLACEMENTS[id])
        .concat('openai/gpt-4-turbo')
        .filter(id => !modelSupportsReasoning(id));

      for (const modelId of refusing) {
        const [, request] = buildCompletionRequest(modelId, 'prompt', 'system', 1024, 0.3, false, {
          enabled: true,
          effort: null,
          maxTokens: 2048,
        });

        expect(request.reasoning, `${modelId} was sent a reasoning payload`).toBeUndefined();
        expect(request.max_tokens, `${modelId} was charged for reasoning it will not do`).toBe(
          1024
        );
      }
    });
  });

  describe('every model the runtime can substitute is one it is allowed to route to', () => {
    it('substitutes a live model when a fallback collides with its primary', () => {
      expect(getModelCapabilities(COLLISION_FALLBACK_MODEL_ID)).not.toBeNull();
      expect(liveRouting.has(COLLISION_FALLBACK_MODEL_ID)).toBe(true);
    });

    it('replaces a retired model id with one the catalogue prices', () => {
      // An unknown replacement resolves to the pessimistic $1/$3 default and to
      // "unknown" capabilities, which read as "no reasoning, temperature fine".
      const unpriced = Object.entries(RETIRED_MODEL_ID_REPLACEMENTS)
        .filter(([, replacement]) => !getModelCapabilities(replacement))
        .map(([retired, replacement]) => `${retired} -> ${replacement}`);

      expect(unpriced).toEqual([]);
    });

    it('never maps a retired id onto another retired id', () => {
      const chained = Object.entries(RETIRED_MODEL_ID_REPLACEMENTS)
        .filter(([, replacement]) => replacement in RETIRED_MODEL_ID_REPLACEMENTS)
        .map(([retired, replacement]) => `${retired} -> ${replacement}`);

      expect(chained).toEqual([]);
    });
  });

  describe('the Stage 6 defaults compiled into the binary obey the same contract', () => {
    // These overwrite the seed entirely when the database is unreachable, so a
    // value that never passes through `llm_model_config` still has to hold.
    const canonical = Object.entries(STAGE6_CANONICAL_PHASE_DEFAULTS);

    it('routes only to models the catalogue prices', () => {
      const unpriced = canonical
        .flatMap(([phase, config]) => [
          [phase, config.modelId] as const,
          [phase, config.fallbackModelId] as const,
        ])
        .filter(([, modelId]) => !getModelCapabilities(modelId))
        .map(([phase, modelId]) => `${phase} -> ${modelId}`);

      expect(unpriced).toEqual([]);
    });

    it('keeps every budget under the model ceiling', () => {
      const over = canonical
        .filter(([, config]) => {
          const ceiling = getModelCapabilities(config.modelId)?.maxOutputTokens;
          return ceiling != null && config.maxTokens > ceiling;
        })
        .map(([phase, config]) => `${phase}: ${config.maxTokens} > ${config.modelId}`);

      expect(over).toEqual([]);
    });

    it('never rescues a model with itself', () => {
      const selfRescue = canonical
        .filter(([, config]) => config.modelId === config.fallbackModelId)
        .map(([phase]) => phase);

      expect(selfRescue).toEqual([]);
    });
  });
});
