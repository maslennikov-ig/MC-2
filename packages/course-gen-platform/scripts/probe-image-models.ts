#!/usr/bin/env tsx
/**
 * One hard prompt, every image model, side by side.
 *
 * The card is the largest single cost line in a generated course — about 40% of
 * it once Stage 6 prose moved to glm-5.3-flash (mc2-4clyr). So the question of
 * which image model to sit on is worth measuring rather than assuming, and the
 * only honest way to compare pictures is to look at them.
 *
 * **The candidates are not in `/api/v1/models`.** Image-generation models live in
 * a separate catalogue at `GET /api/v1/images/models` — 48 of them, against the
 * 11 chat models that happen to emit an image. Looking in the chat catalogue and
 * concluding a model "does not exist on OpenRouter" is a mistake this script
 * exists partly to stop repeating.
 *
 * **This spends money.** Roughly $0.03-0.05 per candidate, one image each.
 *
 * Pricing is per *image*, not per token, for everything except the two models we
 * already use — which is why the comparison table is worth reading before the
 * pictures: read live 2026-08-27 from each model's `/endpoints`.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/probe-image-models.ts
 *   ... --out /tmp/cards        where to write the PNGs
 *   ... --only qwen/qwen-image-3,krea/krea-2-medium
 *   ... --prompt-file ./p.txt   override the built-in prompt
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * What the models are asked for.
 *
 * Built to fail in the ways that matter for a course card rather than to look
 * pretty: Cyrillic text that has to be spelled correctly (the failure that
 * disqualified `quality: 'low'` on the incumbent — it misspelled the one word it
 * rendered), a stated count, a stated spatial arrangement, and a stated palette.
 * A model can produce a beautiful picture and still fail every one of those.
 */
const DEFAULT_PROMPT = `Кинематографичная обложка онлайн-курса, вид сверху на деревянный стол в тёплом вечернем свете.
На столе ровно три предмета, слева направо: раскрытый ноутбук с графиком на экране, стопка из двух книг в тёмно-синих обложках, и керамическая кружка с паром.
Над столом парит полупрозрачная голограмма нейронной сети из светящихся узлов и связей.
В верхней трети кадра крупная аккуратная надпись кириллицей: «Основы машинного обучения».
Ниже, шрифтом поменьше: «Модуль 3».
Палитра: тёплый янтарный свет, глубокий синий, приглушённый фиолетовый акцент. Стиль: фотореалистичный рендер с мягкой глубиной резкости.`;

interface Candidate {
  id: string;
  /** Only what the model's own `supported_parameters` admits. */
  aspectRatio: string;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  /** What `/endpoints` says one image costs, for the table. */
  listed: string;
}

const CANDIDATES: Candidate[] = [
  // The incumbent. Per token, not per image: medium is 1056 image tokens at
  // $0.000008 each. It has no 16:9 — 1:1, 3:2, 2:3, auto is the whole list.
  { id: 'openai/gpt-5-image-mini', aspectRatio: '3:2', quality: 'medium', listed: '$0.0086' },
  // Already configured as the card's fallback and the cover's primary, and
  // never once billed: `stage_7_cover` has no traces at all.
  { id: 'google/gemini-2.5-flash-image', aspectRatio: '16:9', listed: '~$0.039' },
  { id: 'qwen/qwen-image-3', aspectRatio: '16:9', listed: '$0.030' },
  { id: 'bytedance-seed/seedream-5-0-lite', aspectRatio: '16:9', listed: '$0.035' },
  { id: 'qwen/qwen-image-3-pro', aspectRatio: '16:9', listed: '$0.040 (1K)' },
  { id: 'bytedance-seed/seedream-5-0-pro', aspectRatio: '16:9', listed: '$0.045' },
  { id: 'krea/krea-2-medium', aspectRatio: '16:9', listed: 'не опубликована' },
  { id: 'meta/muse-image', aspectRatio: '16:9', listed: 'не опубликована' },
];

function readFlag(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

/**
 * What OpenRouter says it billed.
 *
 * The response body carries `usage.cost`, but that is the number we would be
 * trusting; `/api/v1/generation` is the receipt. It lands about ten seconds
 * after the call, so a single early read returns nothing and reads exactly like
 * a working feature returning zero.
 */
async function readBilledCost(apiKey: string, generationId: string): Promise<number | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const response = await fetch(
      `${OPENROUTER_BASE_URL}/generation?id=${encodeURIComponent(generationId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!response.ok) continue;
    const body = (await response.json()) as { data?: { total_cost?: number } };
    const cost = body.data?.total_cost;
    if (typeof cost === 'number') return cost;
  }
  return null;
}

interface Outcome {
  id: string;
  listed: string;
  ok: boolean;
  billed: number | null;
  reportedCost: number | null;
  ms: number;
  bytes: number | null;
  file: string | null;
  error: string | null;
}

async function generate(
  apiKey: string,
  candidate: Candidate,
  prompt: string,
  outDir: string
): Promise<Outcome> {
  const started = Date.now();
  const base: Outcome = {
    id: candidate.id,
    listed: candidate.listed,
    ok: false,
    billed: null,
    reportedCost: null,
    ms: 0,
    bytes: null,
    file: null,
    error: null,
  };

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/images`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai.megacampus.ru',
        'X-Title': 'MegaCampus Image Model Probe',
      },
      body: JSON.stringify({
        model: candidate.id,
        prompt,
        aspect_ratio: candidate.aspectRatio,
        ...(candidate.quality ? { quality: candidate.quality } : {}),
      }),
    });

    const generationId = response.headers.get('x-generation-id');
    if (!response.ok) {
      const said = await response.text().catch(() => '');
      return {
        ...base,
        ms: Date.now() - started,
        error: `HTTP ${response.status}: ${said.slice(0, 200)}`,
      };
    }

    const body = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      usage?: { cost?: number };
    };
    const ms = Date.now() - started;

    const first = body.data?.[0];
    let bytes: number | null = null;
    let file: string | null = null;

    if (first?.b64_json) {
      const buffer = Buffer.from(first.b64_json, 'base64');
      bytes = buffer.length;
      file = join(outDir, `${candidate.id.replace(/[/.]/gu, '_')}.png`);
      writeFileSync(file, buffer);
    } else if (first?.url) {
      const image = await fetch(first.url);
      const buffer = Buffer.from(await image.arrayBuffer());
      bytes = buffer.length;
      file = join(outDir, `${candidate.id.replace(/[/.]/gu, '_')}.png`);
      writeFileSync(file, buffer);
    }

    const billed = generationId ? await readBilledCost(apiKey, generationId) : null;

    return {
      ...base,
      ok: file !== null,
      billed,
      reportedCost: body.usage?.cost ?? null,
      ms,
      bytes,
      file,
      error: file === null ? 'ответ без изображения' : null,
    };
  } catch (error) {
    return {
      ...base,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не задан');

  const outDir = readFlag('--out', '/tmp/image-model-probe');
  mkdirSync(outDir, { recursive: true });

  const promptFile = readFlag('--prompt-file', '');
  const prompt = promptFile ? readFileSync(promptFile, 'utf8') : DEFAULT_PROMPT;

  const only = readFlag('--only', '');
  const wanted = only ? new Set(only.split(',').map(s => s.trim())) : null;
  const selected = wanted ? CANDIDATES.filter(c => wanted.has(c.id)) : CANDIDATES;

  // The card the pipeline actually ships is square: `getImageDimensions` pins
  // gpt-5-image-mini to 1024x1024 whatever `aspect_ratio` says, so a comparison
  // run at 16:9 compares something we do not ship. `--aspect` forces the whole
  // field onto one ratio so the pictures are answerable side by side.
  const aspect = readFlag('--aspect', '');
  const candidates = aspect ? selected.map(c => ({ ...c, aspectRatio: aspect })) : selected;

  console.log(
    `Промпт (${prompt.length} символов), ${candidates.length} моделей, вывод в ${outDir}\n`
  );

  const outcomes: Outcome[] = [];
  for (const candidate of candidates) {
    process.stdout.write(`  ${candidate.id} ... `);
    const outcome = await generate(apiKey, candidate, prompt, outDir);
    outcomes.push(outcome);
    console.log(
      outcome.ok
        ? `ok  ${(outcome.ms / 1000).toFixed(1)}s  ${outcome.billed !== null ? '$' + outcome.billed.toFixed(6) : 'счёт не пришёл'}`
        : `ОТКАЗ  ${outcome.error}`
    );
  }

  console.log('\n| модель | по прайсу | по счёту | время | файл |');
  console.log('|---|---|---|---|---|');
  for (const o of outcomes) {
    console.log(
      `| ${o.id} | ${o.listed} | ${o.billed !== null ? '$' + o.billed.toFixed(6) : o.error ? '—' : 'не пришёл'} | ${(o.ms / 1000).toFixed(1)}s | ${o.file ?? o.error} |`
    );
  }
}

void main();
