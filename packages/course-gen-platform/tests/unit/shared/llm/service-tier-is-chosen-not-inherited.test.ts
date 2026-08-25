/**
 * Contract: the service tier is a decision, never a consequence of the price sort.
 *
 * OpenRouter publishes tier variants of a model as ordinary endpoints in the
 * same `/endpoints` list as everything else — `openai/flex` at half the default
 * rate, `openai/priority` at double. `pickCheapestUntriedEndpoint` sorts by
 * price and pins the cheapest, so on the day those tags appeared the entire
 * pipeline was one production run away from silently moving to flex, chat box
 * included. Measured live on 2026-08-25: identical 14-token prompts cost
 * $0.000004356 pinned to `openai/flex` against $0.000008712 unpinned, and the
 * body reported `service_tier: "flex"` and `"default"`.
 *
 * That trade — half price, higher latency, and a refusal instead of a fallback
 * when capacity is short — is right for a lesson nobody is watching and wrong
 * for a person waiting on an answer. So it is chosen from the phase, and these
 * are the checks that keep it chosen (mc2-a9w19).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  cheapestEndpointAtTier,
  pickCheapestUntriedEndpoint,
  readEndpointTier,
  type ModelEndpoint,
} from '@/shared/llm/openrouter-endpoints';
import {
  resolveServiceTier,
  withFlexCapacityFallbackFetch,
  LATENCY_SENSITIVE_PHASES,
} from '@/shared/llm/service-tier';
import { buildProviderParams } from '@/shared/llm/langchain-models';

function endpoint(tag: string, prompt: number, completion = prompt * 6): ModelEndpoint {
  return {
    tag,
    providerName: tag,
    promptPricePerMillion: prompt,
    completionPricePerMillion: completion,
    status: 0,
    tier: readEndpointTier(tag),
  };
}

/** The live shape of `openai/gpt-5.6-luna`, cheapest first, read 2026-08-25. */
const LUNA_ENDPOINTS: ModelEndpoint[] = [
  endpoint('openai/flex', 0.1, 0.6),
  endpoint('openai', 0.2, 1.2),
  endpoint('amazon-bedrock/us-east-1', 0.22, 1.32),
  endpoint('openai/priority', 0.4, 2.4),
];

describe('readEndpointTier', () => {
  it('reads the tier a tag names', () => {
    expect(readEndpointTier('openai/flex')).toBe('flex');
    expect(readEndpointTier('openai/priority')).toBe('priority');
    expect(readEndpointTier('google-vertex/global/flex')).toBe('flex');
  });

  it('does not mistake a quantisation or a region for a tier', () => {
    // Every one of these is in the live catalogue, and reading them as tiers
    // would refuse endpoints that are simply an fp4 build or an EU region.
    expect(readEndpointTier('sail-research/fp4')).toBe('default');
    expect(readEndpointTier('open-inference/fp4')).toBe('default');
    expect(readEndpointTier('azure/eu')).toBe('default');
    expect(readEndpointTier('azure/us')).toBe('default');
    expect(readEndpointTier('openai')).toBe('default');
  });
});

describe('pickCheapestUntriedEndpoint', () => {
  it('passes over the cheaper flex endpoint when the caller may not use it', () => {
    const chosen = pickCheapestUntriedEndpoint(LUNA_ENDPOINTS, new Set(), undefined, 'default');
    expect(chosen?.tag).toBe('openai');
  });

  it('takes the flex endpoint when the caller may', () => {
    const chosen = pickCheapestUntriedEndpoint(LUNA_ENDPOINTS, new Set(), undefined, 'flex');
    expect(chosen?.tag).toBe('openai/flex');
  });

  it('defaults to the ordinary tariff when no tier is named', () => {
    // The argument is optional so that every existing call site keeps its
    // behaviour. A caller that forgot must not be upgraded by accident.
    expect(pickCheapestUntriedEndpoint(LUNA_ENDPOINTS, new Set())?.tag).toBe('openai');
  });

  it('degrades to the default tier once flex has had its attempt', () => {
    // This is the whole fallback story on the SDK path: a flex endpoint that
    // refuses for capacity loses its attempt like any other, and the next
    // attempt takes the next cheapest untried endpoint.
    const tried = new Set(['openai/flex']);
    expect(pickCheapestUntriedEndpoint(LUNA_ENDPOINTS, tried, undefined, 'flex')?.tag).toBe(
      'openai'
    );
  });

  it('never chooses the priority tier, whatever is asked for', () => {
    const onlyPriority = [endpoint('openai/priority', 0.4, 2.4)];
    expect(pickCheapestUntriedEndpoint(onlyPriority, new Set(), undefined, 'flex')).toBeUndefined();
    expect(
      pickCheapestUntriedEndpoint(onlyPriority, new Set(), undefined, 'default')
    ).toBeUndefined();
  });
});

describe('cheapestEndpointAtTier', () => {
  it('prices a route at the tier it would really be served at', () => {
    expect(cheapestEndpointAtTier(LUNA_ENDPOINTS, 'flex')?.promptPricePerMillion).toBe(0.1);
    expect(cheapestEndpointAtTier(LUNA_ENDPOINTS, 'default')?.promptPricePerMillion).toBe(0.2);
  });

  it('answers "no endpoint here", which is not the same as "could not look it up"', () => {
    // `z-ai/glm-5.2` is the live example: the most expensive line of a course
    // and no flex endpoint at all. Assuming a tier multiplier applies to every
    // model would invent a discount it does not offer.
    const noFlex = [endpoint('z-ai', 0.63, 1.98)];
    expect(cheapestEndpointAtTier(noFlex, 'flex')).toBeUndefined();
  });

  it('passes over a degraded endpoint, as the attempt chain does', () => {
    const degraded: ModelEndpoint[] = [
      { ...endpoint('openai/flex', 0.1, 0.6), status: -2 },
      endpoint('google-vertex/global/flex', 0.12, 0.7),
    ];
    expect(cheapestEndpointAtTier(degraded, 'flex')?.tag).toBe('google-vertex/global/flex');
  });
});

describe('resolveServiceTier', () => {
  it('keeps the chat box and the wizard on the tier that does not refuse', () => {
    expect(resolveServiceTier('chat_node_refinement')).toBe('default');
    expect(resolveServiceTier('inline_block_regeneration')).toBe('default');
    expect(resolveServiceTier('stage_4_clarifying')).toBe('default');
    expect(resolveServiceTier('stage_career_playbook_followup')).toBe('default');
  });

  it('gives background work the cheap tier', () => {
    expect(resolveServiceTier('stage_6_content')).toBe('flex');
    expect(resolveServiceTier('stage_6_judge')).toBe('flex');
    expect(resolveServiceTier('stage_2_summarization')).toBe('flex');
    expect(resolveServiceTier('stage_career_playbook_spec')).toBe('flex');
  });

  it('treats an unnamed phase as interactive', () => {
    // `costContext` is optional by design, and a missing field must not be able
    // to change what a call costs or how it fails.
    expect(resolveServiceTier(undefined)).toBe('default');
    expect(resolveServiceTier('')).toBe('default');
  });

  it('lists every chat and inline phase as latency-sensitive', () => {
    // A new chat phase that nobody adds here would be served by a tier that can
    // refuse, and the person waiting would see the refusal.
    for (const phase of [
      'chat_intent_classification',
      'chat_node_refinement',
      'chat_global_guidance',
      'chat_full_regeneration',
      'chat_stage_5_refinement',
      'chat_stage_6_refinement',
      'inline_block_regeneration',
      'inline_element_crud',
    ]) {
      expect(LATENCY_SENSITIVE_PHASES.has(phase)).toBe(true);
    }
  });
});

describe('buildProviderParams', () => {
  it('asks for flex on a background phase', () => {
    const params = buildProviderParams(
      'openai/gpt-5.6-luna',
      0.7,
      4096,
      undefined,
      undefined,
      'stage_6_content'
    );
    expect(params.modelKwargs.service_tier).toBe('flex');
  });

  it('says nothing about tiers for the chat box', () => {
    const params = buildProviderParams(
      'openai/gpt-5.6-luna',
      0.7,
      4096,
      undefined,
      undefined,
      'chat_node_refinement'
    );
    expect(params.modelKwargs.service_tier).toBeUndefined();
  });

  it('says nothing about tiers when the phase is unknown', () => {
    const params = buildProviderParams('openai/gpt-5.6-luna', 0.7, 4096, undefined);
    expect(params.modelKwargs.service_tier).toBeUndefined();
  });
});

describe('withFlexCapacityFallbackFetch', () => {
  const request = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '99' },
    body: JSON.stringify(body),
  });

  it('re-sends a refused flex request at the default tariff', async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(new Response('no capacity', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await withFlexCapacityFallbackFetch('openai/gpt-5.6-luna', base)(
      'https://openrouter.ai/api/v1/chat/completions',
      request({ model: 'openai/gpt-5.6-luna', service_tier: 'flex', max_tokens: 100 })
    );

    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);

    const retryBody = JSON.parse((base.mock.calls[1]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(retryBody.service_tier).toBeUndefined();
    expect(retryBody.max_tokens).toBe(100);
    // A stale content-length would describe the body that was refused.
    expect(
      new Headers((base.mock.calls[1]?.[1] as RequestInit).headers).get('content-length')
    ).toBe(null);
  });

  it('leaves a refusal that never asked for a tier alone', async () => {
    const base = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));

    const response = await withFlexCapacityFallbackFetch('openai/gpt-5.6-luna', base)(
      'https://openrouter.ai/api/v1/chat/completions',
      request({ model: 'openai/gpt-5.6-luna', max_tokens: 100 })
    );

    expect(response.status).toBe(429);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('retries only once, so a second refusal reaches the caller', async () => {
    const base = vi.fn().mockResolvedValue(new Response('no capacity', { status: 503 }));

    const response = await withFlexCapacityFallbackFetch('openai/gpt-5.6-luna', base)(
      'https://openrouter.ai/api/v1/chat/completions',
      request({ model: 'openai/gpt-5.6-luna', service_tier: 'flex' })
    );

    expect(response.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('does not touch a successful call', async () => {
    const base = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await withFlexCapacityFallbackFetch('openai/gpt-5.6-luna', base)(
      'https://openrouter.ai/api/v1/chat/completions',
      request({ model: 'openai/gpt-5.6-luna', service_tier: 'flex' })
    );

    expect(base).toHaveBeenCalledTimes(1);
  });
});
