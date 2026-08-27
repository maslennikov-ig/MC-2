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
 * What the pipeline actually asks for.
 *
 * This is `stage7_card_course` as it stands in `prompt_templates` on 2026-08-27,
 * with `DEFAULT_CARD_VISUAL_STYLE` filled in and the service's negative prompt
 * appended the way `generateImage` appends it. Not an approximation of the real
 * thing — the real thing.
 *
 * It matters that it demands **no text at all**, because the first version of
 * this script asked instead for a cinematic desk scene with a Cyrillic headline,
 * and every conclusion drawn from that run was about a job the product does not
 * do. Worse, it was landscape by construction — a table shot with three objects
 * arranged left to right and a headline across the top — so forcing it to 1:1
 * clipped the headline, and the incumbent got blamed for a crop this prompt had
 * caused. A card is abstract, square, centred and text-free; judge on that.
 *
 * `--hard-text` restores the old prompt. It is still worth having, just not for
 * this decision: nothing we ship puts a word inside a generated image.
 */
const CARD_PROMPT = `Create a professional 1:1 square thumbnail image for an educational course catalog.

SUBJECT CONTEXT:
Course: "Основы машинного обучения"
Topic: практическое введение в машинное обучение для аналитиков
Language Context: Russian

VISUAL STYLE (MUST FOLLOW):
Color Scheme: blue and purple gradients with subtle accents
Aesthetic: modern, professional, clean
Visual Elements: abstract geometric shapes, flowing lines
Mood: professional, engaging, educational

COMPOSITION REQUIREMENTS:
- 1:1 square format (optimized for thumbnail display)
- Abstract or symbolic representation of the course topic
- Professional, modern digital art aesthetic
- Rich visual depth with layered composition
- Centered focal point that works at small sizes
- High contrast for visibility in catalog grids

CRITICAL CONSTRAINTS - NO TEXT:
ABSOLUTELY NO text, letters, words, numbers, characters, typography, writing in ANY alphabet.
Also AVOID: logos, watermarks, signatures, human faces.
The image must be 100% text-free.

Remember: ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, TEXT-FREE IMAGE.

Do not include any watermarks, logos, or signatures.`;

/**
 * A lesson banner, in the shape `stage7_cover_system` demands of the LLM that
 * writes these: abstract, 1-3 sentences, 50-100 words, ending in the no-text
 * clause.
 *
 * Note what the template says and what the code asks for. Both
 * `stage7_cover_system` and `stage7_cover_user` say "16:9 hero banner", twice;
 * `DEFAULT_ASPECT_RATIO` is `'21:9'` and `getImageDimensions` returns 1536x672
 * for it. So the model is told to compose for one frame and rendered into a
 * wider one.
 */
const COVER_PROMPT = `An abstract hero banner representing supervised machine learning: layered translucent planes of deep blue and violet receding into depth, a luminous cluster of connected nodes drifting slightly left of centre, thin flowing gradient lines sweeping across the frame. Modern, clean, high-quality digital art with rich colour and a clear sense of depth. Absolutely no text, text-free image.

Do not include any watermarks, logos, or signatures.`;

/** The original text-rendering torture test, kept behind `--hard-text`. */
const HARD_TEXT_PROMPT = `Кинематографичная обложка онлайн-курса, вид сверху на деревянный стол в тёплом вечернем свете.
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
  // The incumbent without the language model bolted on top. Same
  // `output_image` rate to the cent — $0.000008/token — and the same `quality`
  // enum, but OpenRouter's own warning about the GPT-5 image models is that they
  // "generate images through an LLM ... and may incur extra inference cost". If
  // that surcharge is real, this is the same picture for less.
  { id: 'openai/gpt-image-1-mini', aspectRatio: '1:1', quality: 'medium', listed: '$0.000008/tok' },
  { id: 'google/gemini-3.1-flash-lite-image', aspectRatio: '1:1', listed: '$0.00003/tok' },
  { id: 'google/gemini-3.1-flash-image', aspectRatio: '1:1', listed: '$0.00006/tok' },
  // Billed per token like the OpenAI pair, but at 13.5x their output rate.
  { id: 'microsoft/mai-image-2.5-pro', aspectRatio: '1:1', listed: '$0.000108/tok' },
  { id: 'microsoft/mai-image-2.5', aspectRatio: '1:1', listed: '$0.000047/tok' },
  // The newer OpenAI pair: 3.75x the mini rate per output token, but they are
  // the only OpenAI image models here that publish `9:16` — which is the ratio
  // the mini pair cannot do at all, and the one a vertical lesson banner needs.
  { id: 'openai/gpt-image-2', aspectRatio: '1:1', quality: 'medium', listed: '$0.00003/tok' },
  { id: 'openai/gpt-5.4-image-2', aspectRatio: '1:1', quality: 'medium', listed: '$0.00003/tok' },
  // Widescreen candidates, for the banner rather than the card. The owner's
  // constraint is "wide", not 21:9 specifically, which matters: 43 models do
  // 16:9 against 19 that do 21:9, and 16:9 is what both cover templates already
  // tell the model it is composing for.
  { id: 'black-forest-labs/flux.2-klein-4b', aspectRatio: '16:9', listed: '~$0.0145' },
  { id: 'sourceful/riverflow-v2.5-fast', aspectRatio: '16:9', listed: '$0.019' },
  { id: 'black-forest-labs/flux.2-pro', aspectRatio: '16:9', listed: '~$0.031' },
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
  const hardText = process.argv.includes('--hard-text');
  const cover = process.argv.includes('--cover');
  const prompt = promptFile
    ? readFileSync(promptFile, 'utf8')
    : hardText
      ? HARD_TEXT_PROMPT
      : cover
        ? COVER_PROMPT
        : CARD_PROMPT;

  const only = readFlag('--only', '');
  const wanted = only ? new Set(only.split(',').map(s => s.trim())) : null;
  const selected = wanted ? CANDIDATES.filter(c => wanted.has(c.id)) : CANDIDATES;

  // The card the pipeline actually ships is square: `getImageDimensions` pins
  // gpt-5-image-mini to 1024x1024 whatever `aspect_ratio` says, so a comparison
  // run at 16:9 compares something we do not ship. `--aspect` forces the whole
  // field onto one ratio so the pictures are answerable side by side.
  const aspect = readFlag('--aspect', '');
  const withAspect = aspect ? selected.map(c => ({ ...c, aspectRatio: aspect })) : selected;

  // `--quality` forces the tier on every candidate that has one. The incumbent's
  // tier was chosen against a prompt that asked for a word and got it misspelled
  // at `low`; the production card prompt forbids letters entirely, so that
  // evidence never applied to it and the tier is worth re-deciding on the real
  // brief.
  const quality = readFlag('--quality', '') as '' | 'auto' | 'low' | 'medium' | 'high';
  const candidates = quality
    ? withAspect.map(c => (c.quality ? { ...c, quality } : c))
    : withAspect;

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
