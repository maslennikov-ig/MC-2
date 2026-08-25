#!/usr/bin/env tsx
/**
 * Does the Batch API honour `service_tier`, and what does it actually bill?
 *
 * The whole case for batching rests on a number that cannot be read from the
 * catalogue. `/models` publishes the default tariff for both `openai/gpt-5.6-luna`
 * and its `:batch` sibling, so it says batch is half price — of a synchronous
 * call this pipeline stopped making when every background phase moved to flex
 * (mc2-a9w19). Measured live on 2026-08-25, $/1M:
 *
 * | route         | in   | out  |
 * | ------------- | ---- | ---- |
 * | sync default  | 0.20 | 1.20 |
 * | sync flex     | 0.10 | 0.60 |  ← what we pay today
 * | batch default | 0.10 | 0.60 |  ← identical, plus up to a day of waiting
 * | batch flex    | 0.05 | 0.30 |  ← the only route that is cheaper
 *
 * So batch is worth having only if a batched request can be served at flex. The
 * `/endpoints` listing says `openai/gpt-5.6-luna:batch` publishes one. Whether a
 * request inside a batch can *ask* for it is a different question, and the last
 * time this codebase assumed a routing field was read, it had been a no-op for
 * as long as it existed (mc2-5pt54). So this asks the API.
 *
 * **This spends money.** Two completions of a few dozen tokens.
 *
 * A batch may take up to 24h. `--wait` bounds the poll; a run that times out
 * proves nothing either way and says so rather than guessing.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/probe-batch-service-tier.ts
 *   ... --model openai/gpt-5.6-luna
 *   ... --tier flex          the tier to request, or `none` to send no field
 *   ... --wait 900           seconds to follow the batch
 */

import 'dotenv/config';

import { getOpenRouterApiKey } from '../src/shared/services/api-key-service';
import {
  OpenRouterBatchClient,
  type OpenRouterBatch,
} from '../src/shared/llm/openrouter-batch-client';

const POLL_INTERVAL_MS = 15_000;

function readFlag(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * What OpenRouter says it billed, per generation.
 *
 * The batch result carries `usage.cost`, but that is the figure we would be
 * trusting; `/api/v1/generation` is the receipt, and it is the only place that
 * names the tier that served the call.
 */
async function readGeneration(
  apiKey: string,
  generationId: string
): Promise<{ totalCost: number | null; serviceTier: string | null; provider: string | null }> {
  const response = await fetch(
    `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!response.ok) return { totalCost: null, serviceTier: null, provider: null };

  const payload = (await response.json()) as {
    data?: { total_cost?: number; service_tier?: string | null; provider_name?: string | null };
  };
  return {
    totalCost: payload.data?.total_cost ?? null,
    serviceTier: payload.data?.service_tier ?? null,
    provider: payload.data?.provider_name ?? null,
  };
}

async function main(): Promise<void> {
  const model = readFlag('--model', 'openai/gpt-5.6-luna');
  const tier = readFlag('--tier', 'flex');
  const waitSeconds = Number(readFlag('--wait', '900'));

  const apiKey = await getOpenRouterApiKey();
  const client = new OpenRouterBatchClient({ apiKey });

  const body = {
    messages: [{ role: 'user' as const, content: 'Reply with the single word: ready' }],
    max_tokens: 16,
    ...(tier === 'none' ? {} : { service_tier: tier as 'flex' | 'default' }),
  };

  console.log(`Submitting 2 requests on ${model}, service_tier=${tier}...`);
  let batch: OpenRouterBatch;
  try {
    batch = await client.submitChatBatch({
      model,
      requests: [
        { customId: 'probe-1', body },
        { customId: 'probe-2', body },
      ],
    });
  } catch (error) {
    // A rejected submission is itself the answer: the field is not accepted.
    console.error(`Submission refused: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  console.log(`  batch ${batch.id}, status ${batch.status}`);

  const deadline = Date.now() + waitSeconds * 1000;
  let lastStatus = batch.status;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    batch = await client.getBatch(batch.id);
    if (batch.status !== lastStatus) {
      console.log(`  ${new Date().toISOString().slice(11, 19)}  ${batch.status}`);
      lastStatus = batch.status;
    }
    if (['completed', 'failed', 'expired', 'cancelled'].includes(batch.status)) break;
  }

  if (batch.status !== 'completed') {
    console.log(
      `\nStill ${batch.status} after ${waitSeconds}s. This proves nothing about the tier; ` +
        `re-read it with --wait raised, or read batch ${batch.id} later.`
    );
    return;
  }

  console.log(`\nAggregate usage: ${JSON.stringify(batch.usage)}`);

  for (const result of batch.results ?? []) {
    const generationId = result.response?.body.id;
    const usage = result.response?.body.usage;
    if (!generationId) {
      console.log(`  ${result.custom_id}: no generation id (error: ${result.error?.message})`);
      continue;
    }
    const receipt = await readGeneration(apiKey, generationId);
    console.log(
      `  ${result.custom_id}: served_tier=${receipt.serviceTier ?? 'unreported'} ` +
        `provider=${receipt.provider ?? '?'} billed=$${receipt.totalCost ?? 'unknown'} ` +
        `tokens=${usage?.prompt_tokens ?? '?'}+${usage?.completion_tokens ?? '?'}`
    );
  }

  console.log(
    `\nRead it against the rate card: at ${model} batch@flex the completion leg is ` +
      `$0.30/1M, batch@default $0.60/1M. A served_tier of "default" means the field was ignored.`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
