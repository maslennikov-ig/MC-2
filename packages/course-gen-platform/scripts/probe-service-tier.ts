#!/usr/bin/env tsx
/**
 * Which service tier actually served a call, and what it actually cost.
 *
 * OpenRouter's `/endpoints` lists tier variants — `openai/flex` at half the
 * default rate, `openai/priority` at double — as ordinary endpoints with their
 * own tags. The documentation says a tier-suffixed slug may be used in
 * `provider.order` / `provider.only`; it does not say what happens when it is,
 * and the whole flex plan rests on that being true. So this asks the API rather
 * than the docs: the same short prompt is sent twice, once pinned to the tier
 * endpoint and once left alone, and both generations are read back from
 * `GET /api/v1/generation` — the receipt, not the estimate (mc2-a9w19).
 *
 * **This spends money.** Two completions of a few dozen tokens, so cents of a
 * cent, but it is a paid call and not a dry run.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/probe-service-tier.ts
 *   ... --model openai/gpt-5.6-luna   which model to probe
 *   ... --tier openai/flex            which endpoint tag to pin
 *   ... --mode service-tier           ask by `service_tier` instead of by tag
 *
 * The two modes are the two paths this codebase takes. `pin` is the SDK path,
 * which has an endpoint list and names one tag; `service-tier` is the LangChain
 * path, which has no list and names the tier — the path Stage 6 lesson
 * generation, the largest cost line, actually runs on.
 */

import 'dotenv/config';

import { getOpenRouterApiKey } from '../src/shared/services/api-key-service';

const OPENROUTER_API = 'https://openrouter.ai/api/v1';

/** How long the generation record takes to become readable (mc2-b7olk.6). */
const LOOKUP_DELAY_MS = 3_000;
const LOOKUP_INTERVAL_MS = 2_000;
const LOOKUP_MAX_WAIT_MS = 30_000;

interface ProbeResult {
  label: string;
  requestedTag: string | null;
  /** What the completion body itself claimed, before any lookup. */
  reportedTier: string | null;
  generationId: string | null;
  providerName: string | null;
  totalCostUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  latencyMs: number;
  error: string | null;
}

function readFlag(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function complete(
  apiKey: string,
  model: string,
  tag: string | null,
  label: string,
  mode: 'pin' | 'service-tier'
): Promise<ProbeResult> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: 'Reply with exactly one word: ready.' }],
    max_tokens: 16,
  };
  if (tag && mode === 'service-tier') {
    // The tier by name, the way `modelKwargs` carries it on the LangChain path.
    body.service_tier = tag.slice(tag.lastIndexOf('/') + 1);
  } else if (tag) {
    // The pin is the question. `allow_fallbacks: false` is what the docs describe
    // as guaranteeing this one endpoint serves the request, so a tag that is not
    // honoured shows up as a refusal rather than as a quiet reroute.
    body.provider = { only: [tag], allow_fallbacks: false };
  }

  const startedAt = Date.now();
  const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;

  const generationId = response.headers.get('x-generation-id');
  const payload = (await response.json()) as {
    service_tier?: string | null;
    provider?: string | null;
    error?: { message?: string };
  };

  return {
    label,
    requestedTag: tag,
    reportedTier: payload.service_tier ?? null,
    generationId,
    providerName: payload.provider ?? null,
    totalCostUsd: null,
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    latencyMs,
    error: response.ok ? null : (payload.error?.message ?? `HTTP ${response.status}`),
  };
}

/** The provider's own account of one call, polled until it exists. */
async function settle(apiKey: string, probe: ProbeResult): Promise<ProbeResult> {
  if (!probe.generationId) return probe;

  await sleep(LOOKUP_DELAY_MS);
  const deadline = Date.now() + LOOKUP_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${OPENROUTER_API}/generation?id=${encodeURIComponent(probe.generationId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (response.ok) {
      const { data } = (await response.json()) as {
        data?: {
          total_cost?: number | null;
          provider_name?: string | null;
          service_tier?: string | null;
          native_tokens_prompt?: number | null;
          native_tokens_completion?: number | null;
          native_tokens_reasoning?: number | null;
        };
      };
      if (data) {
        return {
          ...probe,
          totalCostUsd: data.total_cost ?? null,
          providerName: data.provider_name ?? probe.providerName,
          reportedTier: data.service_tier ?? probe.reportedTier,
          promptTokens: data.native_tokens_prompt ?? null,
          completionTokens: data.native_tokens_completion ?? null,
          reasoningTokens: data.native_tokens_reasoning ?? null,
        };
      }
    }
    await sleep(LOOKUP_INTERVAL_MS);
  }

  return probe;
}

async function main(): Promise<void> {
  const model = readFlag('--model', 'openai/gpt-5.6-luna');
  const tag = readFlag('--tier', 'openai/flex');
  const mode = readFlag('--mode', 'pin') === 'service-tier' ? 'service-tier' : 'pin';

  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) throw new Error('No OpenRouter API key is configured');

  const probes: ProbeResult[] = [];
  for (const [label, pin] of [
    [mode === 'service-tier' ? `service_tier from ${tag}` : `pinned to ${tag}`, tag],
    ['unpinned (default routing)', null],
  ] as Array<[string, string | null]>) {
    probes.push(await complete(apiKey, model, pin, label, mode));
  }

  const settled: ProbeResult[] = [];
  for (const probe of probes) settled.push(await settle(apiKey, probe));

  console.log(`\nModel: ${model}\n`);
  for (const probe of settled) {
    console.log(`  ${probe.label}`);
    if (probe.error) console.log(`    ERROR            ${probe.error}`);
    console.log(`    service_tier     ${probe.reportedTier ?? '(none)'}`);
    console.log(`    provider         ${probe.providerName ?? '(unknown)'}`);
    console.log(`    total_cost       ${probe.totalCostUsd ?? '(unread)'}`);
    console.log(
      `    tokens           prompt ${probe.promptTokens ?? '?'}, completion ${
        probe.completionTokens ?? '?'
      }, reasoning ${probe.reasoningTokens ?? '?'}`
    );
    console.log(`    latency          ${probe.latencyMs} ms\n`);
  }

  const [pinned, unpinned] = settled;
  if (pinned?.totalCostUsd && unpinned?.totalCostUsd) {
    const perToken = (probe: ProbeResult): number | null => {
      const prompt = probe.promptTokens ?? 0;
      const completion = probe.completionTokens ?? 0;
      // The two calls answer with different lengths, so the totals are not
      // comparable; the input leg is, and it is what the tariff moves.
      return prompt > 0 ? (probe.totalCostUsd ?? 0) / (prompt + completion) : null;
    };
    console.log(
      `  cost per token   pinned ${perToken(pinned)?.toExponential(3)} vs unpinned ${perToken(
        unpinned
      )?.toExponential(3)}`
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
