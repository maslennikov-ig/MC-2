#!/usr/bin/env tsx
/**
 * Can this model stand where that one stands, and what would it cost?
 *
 * Written for `z-ai/glm-5.3-flash` against `openai/gpt-5.6-luna` (mc2-lwrle),
 * but the questions are the ones any substitution has to answer, so the two ids
 * are flags.
 *
 * It asks three things, in the shapes this repository actually uses:
 *
 * 1. **Strict structured output.** Two Career Playbook nodes call
 *    `withStructuredOutput(..., { method: 'jsonSchema', strict: true })`, which
 *    reaches the wire as `response_format.type = 'json_schema'` with
 *    `strict: true`. OpenRouter advertises that capability as
 *    `structured_outputs` in `supported_parameters`, and a model can list
 *    `response_format` without listing it. A missing capability here is not a
 *    quality question, it is a hard 400 in production.
 * 2. **Reasoning off.** Most phases disable reasoning. A model that ignores
 *    `reasoning: { enabled: false }` bills thinking tokens nobody asked for.
 * 3. **What a call costs**, on the same prompt, read back from
 *    `GET /api/v1/generation` — the provider's receipt, not our estimate. The
 *    luna-pro probe on 2026-08-25 is why this matters: identical $/token, and
 *    2–4x the bill, because the model consumed several times the prompt tokens.
 *
 * What it does NOT measure is answer quality. Cost and capability are settled
 * here; whether the output is good enough is a separate, larger run.
 *
 * **This spends money.** Six short completions, cents of a cent, but they are
 * paid calls.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/probe-model-substitution.ts
 *   ... --candidate z-ai/glm-5.3-flash    the model under consideration
 *   ... --control openai/gpt-5.6-luna     what it would replace
 */

import 'dotenv/config';

import { getOpenRouterApiKey } from '../src/shared/services/api-key-service';

const OPENROUTER_API = 'https://openrouter.ai/api/v1';

/** The generation record lands late; a single early read returns nothing (mc2-b7olk.6). */
const LOOKUP_DELAY_MS = 3_000;
const LOOKUP_INTERVAL_MS = 2_000;
const LOOKUP_MAX_WAIT_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

function readFlag(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

/**
 * A schema of the shape the Career Playbook nodes send: a small object, every
 * property required, `additionalProperties: false` — which is what `strict`
 * demands and what a model without real support tends to choke on.
 */
const STRICT_SCHEMA = {
  name: 'lesson_verdict',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'score', 'reasons'],
    properties: {
      verdict: { type: 'string', enum: ['accept', 'revise', 'reject'] },
      score: { type: 'number' },
      reasons: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;

/** A prompt long enough for prompt-token appetite to show, identical for both models. */
function longPrompt(): string {
  const paragraph =
    'The lesson introduces incident response for a small platform team. It covers ' +
    'detection, triage, containment and the written post-mortem, with an emphasis on ' +
    'what the on-call engineer does in the first ten minutes and what can safely wait. ';
  return (
    `Summarise the following lesson draft in exactly three sentences.\n\n` + paragraph.repeat(24)
  );
}

interface Call {
  label: string;
  model: string;
  body: Record<string, unknown>;
}

interface Receipt extends Call {
  httpStatus: number;
  error: string | null;
  finishReason: string | null;
  content: string;
  generationId: string | null;
  provider: string | null;
  totalCostUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  latencyMs: number;
}

async function complete(apiKey: string, call: Call): Promise<Receipt> {
  const startedAt = Date.now();
  const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: call.model, ...call.body }),
  });
  const latencyMs = Date.now() - startedAt;

  const payload = (await response.json()) as {
    provider?: string | null;
    choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null } }>;
    error?: { message?: string };
  };

  return {
    ...call,
    httpStatus: response.status,
    error: response.ok ? null : (payload.error?.message ?? `HTTP ${response.status}`),
    finishReason: payload.choices?.[0]?.finish_reason ?? null,
    content: payload.choices?.[0]?.message?.content ?? '',
    generationId: response.headers.get('x-generation-id'),
    provider: payload.provider ?? null,
    totalCostUsd: null,
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    latencyMs,
  };
}

/** The provider's own account of one call, polled until it exists. */
async function settle(apiKey: string, receipt: Receipt): Promise<Receipt> {
  if (!receipt.generationId) return receipt;

  await sleep(LOOKUP_DELAY_MS);
  const deadline = Date.now() + LOOKUP_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${OPENROUTER_API}/generation?id=${encodeURIComponent(receipt.generationId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (response.ok) {
      const { data } = (await response.json()) as {
        data?: {
          total_cost?: number | null;
          provider_name?: string | null;
          native_tokens_prompt?: number | null;
          native_tokens_completion?: number | null;
          native_tokens_reasoning?: number | null;
        };
      };
      if (data) {
        return {
          ...receipt,
          // A real $0 is a measurement; `?? null` keeps it, `|| null` would erase it.
          totalCostUsd: data.total_cost ?? null,
          provider: data.provider_name ?? receipt.provider,
          promptTokens: data.native_tokens_prompt ?? null,
          completionTokens: data.native_tokens_completion ?? null,
          reasoningTokens: data.native_tokens_reasoning ?? null,
        };
      }
    }
    await sleep(LOOKUP_INTERVAL_MS);
  }
  return receipt;
}

function callsFor(model: string, pin: string | null): Call[] {
  const provider = pin ? { provider: { only: [pin], allow_fallbacks: false } } : {};

  return [
    {
      label: 'strict json_schema',
      model,
      body: {
        ...provider,
        messages: [
          {
            role: 'user',
            content:
              'Judge this lesson draft: "Incident response, first ten minutes." ' +
              'Answer with the schema only.',
          },
        ],
        response_format: { type: 'json_schema', json_schema: STRICT_SCHEMA },
        // Room for a model that thinks before it answers. At 200 the first run
        // of this probe spent 198 tokens reasoning, hit `finish_reason: length`
        // and returned nothing — which would have read as "cannot do structured
        // output" when it only meant the budget was too small (mc2-9r0nq).
        max_tokens: 2_000,
      },
    },
    {
      label: 'reasoning disabled',
      model,
      body: {
        ...provider,
        messages: [{ role: 'user', content: 'Reply with exactly one word: ready.' }],
        reasoning: { enabled: false },
        max_tokens: 32,
      },
    },
    {
      label: 'long prompt, reasoning left at the default',
      model,
      body: {
        ...provider,
        messages: [{ role: 'user', content: longPrompt() }],
        max_tokens: 2_000,
      },
    },
  ];
}

function conformsToSchema(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort().join(',');
    const ok =
      keys === 'reasons,score,verdict' &&
      ['accept', 'revise', 'reject'].includes(String(parsed.verdict)) &&
      typeof parsed.score === 'number' &&
      Array.isArray(parsed.reasons);
    return ok ? 'conforms' : `parsed but off-schema (keys: ${keys})`;
  } catch {
    return 'not valid JSON';
  }
}

async function main(): Promise<void> {
  const candidate = readFlag('--candidate', 'z-ai/glm-5.3-flash');
  const control = readFlag('--control', 'openai/gpt-5.6-luna');
  // Which endpoint serves the candidate is not a detail: `/endpoints` for
  // glm-5.3-flash lists Z.AI at $0.075/$0.25 and Novita at twice that, and
  // unpinned routing picked the dearer one. Our own routing pins the cheapest
  // healthy endpoint, so a probe that does not pin is measuring a call we would
  // never make.
  const candidatePin = readFlag('--pin', '');
  const controlPin = readFlag('--control-pin', '');

  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) throw new Error('No OpenRouter API key is configured');

  for (const [model, pin] of [
    [candidate, candidatePin],
    [control, controlPin],
  ] as Array<[string, string]>) {
    console.log(`\n=== ${model}${pin ? ` pinned to ${pin}` : ''}`);
    for (const call of callsFor(model, pin || null)) {
      const receipt = await settle(apiKey, await complete(apiKey, call));
      console.log(`\n  ${receipt.label}`);
      if (receipt.error)
        console.log(`    ERROR        HTTP ${receipt.httpStatus} — ${receipt.error}`);
      console.log(`    provider     ${receipt.provider ?? '(unknown)'}`);
      console.log(`    finish       ${receipt.finishReason ?? '(none)'}`);
      console.log(
        `    tokens       prompt ${receipt.promptTokens ?? '?'}, completion ${
          receipt.completionTokens ?? '?'
        }, reasoning ${receipt.reasoningTokens ?? '?'}`
      );
      console.log(`    billed       ${receipt.totalCostUsd ?? '(unread)'}`);
      console.log(`    latency      ${receipt.latencyMs} ms`);
      if (receipt.label === 'strict json_schema' && !receipt.error) {
        const verdict = conformsToSchema(receipt.content);
        console.log(`    schema       ${verdict}`);
        // A verdict without the evidence is not actionable: fenced JSON that the
        // repair layer would recover reads the same as prose that it would not.
        if (verdict !== 'conforms') {
          console.log(`    returned     ${JSON.stringify(receipt.content.slice(0, 300))}`);
        }
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
